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

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  PASSWORD_SALT: string;
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  UNSPLASH_ACCESS_KEY: string;
  GOOGLE_MAPS_API_KEY: string;
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

// 1. 地點搜尋建議 (Autocomplete)
app.get('/api/places/autocomplete', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json([]);
  
  try {
    // 使用 Google Maps Autocomplete API
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&language=zh-TW&key=${c.env.GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json() as any;
    
    // 回傳 predictions 陣列給前端
    return c.json(data.predictions || []);
  } catch (error) {
    return c.json({ error: 'Failed to fetch autocomplete' }, 500);
  }
});

// 2. 取得地點詳細座標與照片 (Details)
app.get('/api/places/details', async (c) => {
  const placeId = c.req.query('placeId');
  if (!placeId) return c.json({ error: 'Missing placeId' }, 400);

  try {
    // 使用 Google Places API (New) 來拿座標和照片代碼
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': c.env.GOOGLE_MAPS_API_KEY,
        // 💡 關鍵：我們只要 location 和 photos，幫你省流量跟費用
        'X-Goog-FieldMask': 'id,location,photos,displayName,formattedAddress'
      }
    });
    
    const data = await res.json();
    return c.json(data);
  } catch (error) {
    return c.json({ error: 'Failed to fetch place details' }, 500);
  }
});


// 5. 健康檢查
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