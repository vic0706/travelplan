import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

// 引入所有路由模組
import authRoutes from './routes/auth';
import tripRoutes from './routes/trips';
import userRoutes from './routes/users';
import bookingRoutes from './routes/bookings';
import expenseRoutes from './routes/expenses';
import placeRoutes from './routes/places';
import mediaRoutes from './routes/media';
import cities from './routes/cities';
import travelTimeRoute from './routes/travelTime';
import adminRoute from './routes/admin';
import { checkApiQuota, trackApiCall, getApiUsage, saveApiLimit } from './utils/apiQuota';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  PASSWORD_SALT: string;
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  UNSPLASH_ACCESS_KEY: string;
  GOOGLE_MAPS_API_KEY: string;
  GEMINI_API_KEY?: string;
  GEMINI_DAILY_TOKEN_LIMIT?: string;
  __STATIC_CONTENT: any;
  __STATIC_CONTENT_MANIFEST: string;
}

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// 1. 全域 Middleware
app.use('*', cors());
app.use('/api/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const user = await c.env.KV.get(`session:${token}`, 'json');
      if (user) c.set('user', user);
    } catch (e) { console.error('Session lookup failed:', e); }
  }
  await next();
});

// 2. 路由分發
app.route('/api/auth', authRoutes);
app.route('/api/trips', tripRoutes);
app.route('/api/users', userRoutes);
app.route('/api/trips/:id/bookings', bookingRoutes);
app.route('/api/trips/:id/expenses', expenseRoutes);
app.route('/api/places', placeRoutes);
app.route('/api/media', mediaRoutes);
app.route('/api/cities', cities);
app.route('/api/travel-time', travelTimeRoute);
app.route('/api/admin', adminRoute);

// 3. 基礎城市查詢
app.get('/api/cities', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Cities ORDER BY country, name').all();
  return c.json(results);
});

// 💡 4. 新增：取得分類清單 (解決 404 Not Found)
app.get('/api/settings/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Categories ORDER BY name ASC').all();
    return c.json(results);
  } catch (e) {
    console.error('Error fetching categories:', e);
    return c.json([], 500);
  }
});

// ==========================================
// 📍 Google Places API 代理 (避免前端直接暴露 API Key)
// ==========================================

// 1. 地點搜尋建議 — Autocomplete (New)，附 session token（autocomplete 請求本身免費）
app.get('/api/places/autocomplete', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json([]);

  const cacheKey = `autocomplete:${q.toLowerCase().trim()}`;
  const cached = await c.env.KV.get(cacheKey, 'json') as any;
  if (cached) return c.json(cached);

  try {
    await checkApiQuota(c.env, 'places_autocomplete');
    const sessionToken = c.req.query('session') || undefined;
    const body: any = { input: q, languageCode: 'zh-TW' };
    if (sessionToken) body.sessionToken = sessionToken;

    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': c.env.GOOGLE_MAPS_API_KEY },
      body: JSON.stringify(body),
    });
    await trackApiCall(c.env, 'places_autocomplete');
    const data = await res.json() as any;
    const predictions = (data.suggestions || [])
      .filter((s: any) => s.placePrediction)
      .map((s: any) => ({
        place_id:    s.placePrediction.placeId,
        description: s.placePrediction.text?.text || '',
        structured_formatting: {
          main_text:      s.placePrediction.structuredFormat?.mainText?.text || '',
          secondary_text: s.placePrediction.structuredFormat?.secondaryText?.text || '',
        },
      }));
    await c.env.KV.put(cacheKey, JSON.stringify(predictions), { expirationTtl: 604800 }); // 7 days
    return c.json(predictions);
  } catch (error: any) {
    if (error?.code === 'API_QUOTA_EXCEEDED') return c.json({ error: 'API_QUOTA_EXCEEDED', api: 'places_autocomplete' }, 429);
    return c.json({ error: 'Failed to fetch autocomplete' }, 500);
  }
});

app.get('/api/places/details', async (c) => {
  const placeId = c.req.query('placeId');
  if (!placeId) return c.json({ error: 'Missing placeId' }, 400);

  // 與 syncPlaceDetails 共用同一個 KV key，避免重複燒 quota
  const cacheKey = `place_details_v2:${placeId}`;
  const cachedRaw = await c.env.KV.get(cacheKey, 'json') as any;
  if (cachedRaw) {
    // 快取命中：直接回傳，加上 from_cache 標記讓前端可顯示識別
    return c.json({ ...cachedRaw, from_cache: true });
  }

  try {
    await checkApiQuota(c.env, 'place_details');
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': c.env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'id,location,photos,displayName,formattedAddress,rating,userRatingCount,currentOpeningHours,regularOpeningHours,reviewSummary,websiteUri,internationalPhoneNumber,businessStatus'
      }
    });
    await trackApiCall(c.env, 'place_details');

    const data = await res.json() as any;

    let photoUri = null;
    if (data.photos && data.photos.length > 0) {
      const photoName = data.photos[0].name;
      const mediaRes = await fetch(`https://places.googleapis.com/v1/${photoName}/media?key=${c.env.GOOGLE_MAPS_API_KEY}&maxWidthPx=800&skipHttpRedirect=true`);
      if (mediaRes.ok) {
        const mediaData = await mediaRes.json() as any;
        photoUri = mediaData.photoUri;
      }
    }

    const result = { ...data, actual_photo_url: photoUri };
    await c.env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 604800 });

    return c.json({ ...result, from_cache: false });
  } catch (error: any) {
    if (error?.code === 'API_QUOTA_EXCEEDED') return c.json({ error: 'API_QUOTA_EXCEEDED', api: 'place_details' }, 429);
    return c.json({ error: 'Failed to fetch place details' }, 500);
  }
});


// 5. 匯率查詢 — KV 快取 1 小時
// Primary: frankfurter.app (ECB, major currencies — USD/EUR/JPY/GBP/etc.)
// Fallback: open.er-api.com (free, no key, 160+ currencies incl. TWD/KRW/VND/THB)
app.get('/api/exchange-rates', async (c) => {
  const base = c.req.query('base') || 'TWD';
  const cacheKey = `exchange_rates_v3:${base}`;
  const cached = await c.env.KV.get(cacheKey, 'json');
  if (cached) return c.json(cached);
  try {
    // Try frankfurter.app first (USD, EUR, JPY, GBP, etc.)
    const fRes = await fetch(`https://api.frankfurter.app/latest?from=${base}`);
    if (fRes.ok) {
      const fData = await fRes.json() as any;
      if (fData.rates && Object.keys(fData.rates).length > 0) {
        await c.env.KV.put(cacheKey, JSON.stringify(fData), { expirationTtl: 3600 });
        return c.json(fData);
      }
    }
    // Fallback: open.er-api.com — supports TWD, KRW, VND, THB and 160+ currencies
    const erRes = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (erRes.ok) {
      const erData = await erRes.json() as any;
      const rawRates: Record<string, number> = erData.rates || {};
      delete rawRates[base];
      if (Object.keys(rawRates).length > 0) {
        const result = { base, rates: rawRates };
        await c.env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 });
        return c.json(result);
      }
    }
    return c.json({ base, rates: {} });
  } catch {
    return c.json({ base, rates: {} });
  }
});

// ── Settings endpoints ────────────────────────────────────────────────────────

app.get('/api/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT key_name, value FROM App_Settings').all();
    const settings: Record<string, string> = {};
    for (const row of results as any[]) settings[row.key_name] = row.value;
    return c.json(settings);
  } catch { return c.json({}, 500); }
});

app.put('/api/settings', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const stmts = Object.entries(body).map(([key, val]) =>
      c.env.DB.prepare(
        `INSERT INTO App_Settings (key_name, value) VALUES (?, ?)
         ON CONFLICT(key_name) DO UPDATE SET value = excluded.value`
      ).bind(key, String(val))
    );
    if (stmts.length > 0) await c.env.DB.batch(stmts);
    return c.json({ success: true });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.get('/api/settings/api-usage', async (c) => {
  try {
    const usage = await getApiUsage(c.env);
    return c.json(usage);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.put('/api/settings/api-limit', async (c) => {
  const { apiName, limit } = await c.req.json().catch(() => ({}));
  if (!apiName || limit == null) return c.json({ error: 'Missing apiName or limit' }, 400);
  try {
    await saveApiLimit(c.env, apiName, Number(limit));
    return c.json({ success: true });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── Walking time proxy (Google Directions API, walking mode) ─────────────────
app.get('/api/walking-time', async (c) => {
  const { fromLat, fromLng, toLat, toLng } = c.req.query();
  if (!fromLat || !fromLng || !toLat || !toLng) return c.json({ error: 'missing params' }, 400);
  if (!c.env.GOOGLE_MAPS_API_KEY) return c.json({ minutes: null }, 200);
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&mode=walking&key=${c.env.GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json() as any;
    const secs = data.routes?.[0]?.legs?.[0]?.duration?.value;
    return c.json({ minutes: secs ? Math.ceil(secs / 60) : null });
  } catch {
    return c.json({ minutes: null });
  }
});

// 6. 健康檢查
app.get('/health-check', (c) => c.json({ status: 'ok', time: Date.now() }));

// 6. Cloudflare Worker 進入點
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api') || url.pathname === '/health-check') {
      return app.fetch(request, env, ctx);
    }
    try {
      return await getAssetFromKV(
        { request, waitUntil: ctx.waitUntil.bind(ctx) } as any,
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: manifestJSON,
          mapRequestToAsset: (req) => {
            const u = new URL(req.url);
            if (!u.pathname.includes('.')) return new Request(`${u.origin}/index.html`, req);
            return req;
          },
        }
      );
    } catch (e) {
      try {
        const notFoundRequest = new Request(`${url.origin}/index.html`, request);
        return await getAssetFromKV(
          { request: notFoundRequest, waitUntil: ctx.waitUntil.bind(ctx) } as any,
          { ASSET_NAMESPACE: env.__STATIC_CONTENT, ASSET_MANIFEST: manifestJSON }
        );
      } catch (e2) {
        return new Response('Resource not found', { status: 404 });
      }
    }
  },
};