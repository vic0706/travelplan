import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

// @ts-ignore
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  PASSWORD_SALT: string;
  __STATIC_CONTENT: any;
  __STATIC_CONTENT_MANIFEST: string;
}

type Variables = { user: { id: number; role: string; name: string } };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use('*', cors());

// Custom 404 for API
app.notFound((c) => c.json({ error: 'API route not found' }, 404));

// Helper: Hash
async function generateHash(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Auth Middleware
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  const token = authHeader.split(' ')[1];
  const userData = await c.env.KV.get(`session:${token}`, 'json');
  if (!userData) return c.json({ error: 'Unauthorized' }, 401);
  c.set('user', userData);
  await next();
};

// ==========================================
// 🔓 Public API
// ==========================================
app.post('/api/init', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT COUNT(*) as count FROM Users').all();
    if ((results[0] as any).count === 0) {
      const salt = c.env.PASSWORD_SALT || 'default_salt';
      const passwordHash = await generateHash('123456', salt);
      await c.env.DB.prepare(`
        INSERT INTO Users (role, name, avatar_url, password_hash, allow_login, created_at, updated_at) 
        VALUES ('admin', '超級管理員', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin', ?, 1, ?, ?)
      `).bind(passwordHash, Date.now(), Date.now()).run();
      return c.json({ success: true, message: 'Admin created.' });
    }
    return c.json({ success: false, message: 'Not empty.' });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.get('/api/users/login-list', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT id, name, avatar_url, role FROM Users WHERE allow_login = 1').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (!username || !password) return c.json({ error: 'Missing credentials' }, 400);
    const { results } = await c.env.DB.prepare('SELECT * FROM Users WHERE id = ? AND allow_login = 1').bind(username).all();
    const user = results[0] as any;
    if (!user) return c.json({ error: 'User not found' }, 404);
    
    const passwordHash = await generateHash(password, c.env.PASSWORD_SALT);
    if (passwordHash !== user.password_hash) return c.json({ error: 'Invalid' }, 401);

    const { password_hash, ...safeUser } = user;
    const token = crypto.randomUUID();
    await c.env.KV.put(`session:${token}`, JSON.stringify(safeUser), { expirationTtl: 604800 });
    return c.json({ token, user: safeUser });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// ==========================================
// 🔒 Protected API
// ==========================================
app.use('/api/users', authMiddleware);
app.use('/api/users/*', authMiddleware);
app.use('/api/trips', authMiddleware);
app.use('/api/trips/*', authMiddleware);
app.use('/api/settings', authMiddleware);
app.use('/api/cities', authMiddleware); // Cities API 需登入
app.use('/api/sync', authMiddleware);

// --- Cities API ---
app.get('/api/cities', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Cities ORDER BY country, name').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// --- Users ---
app.get('/api/users', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT id, name, avatar_url, role, allow_login FROM Users').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/users', async (c) => {
  try {
    const { name, password, role, allow_login } = await c.req.json();
    const passwordHash = await generateHash(password, c.env.PASSWORD_SALT || 'salt');
    const avatar_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
    const info = await c.env.DB.prepare(`
      INSERT INTO Users (name, password_hash, role, avatar_url, allow_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(name, passwordHash, role || 'user', avatar_url, allow_login ?? 1, Date.now(), Date.now()).run();
    return c.json({ id: info.meta.last_row_id, name, role, avatar_url });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/users/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const { name, role, allow_login, password, avatar_url } = await c.req.json();
    let query = 'UPDATE Users SET name = ?, role = ?, allow_login = ?, avatar_url = ?, updated_at = ?';
    const params: any[] = [name, role, allow_login, avatar_url, Date.now()];
    if (password) {
      query += ', password_hash = ?';
      params.push(await generateHash(password, c.env.PASSWORD_SALT || 'salt'));
    }
    query += ' WHERE id = ?';
    params.push(id);
    await c.env.DB.prepare(query).bind(...params).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// --- Trips ---
app.get('/api/trips', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT id, title, cover_image_url, start_date, end_date, visible_status, default_city_id FROM Trips WHERE visible_status = 1 ORDER BY start_date DESC').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips', async (c) => {
  try {
    const { title, start_date, end_date, cover_image_url, visible_status, default_city_id } = await c.req.json();
    const info = await c.env.DB.prepare(`
      INSERT INTO Trips (title, start_date, end_date, cover_image_url, visible_status, default_city_id, created_at, updated_at, currencies)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(title, start_date, end_date, cover_image_url, visible_status || 1, default_city_id, Date.now(), Date.now(), JSON.stringify(['TWD'])).run();
    
    const idResult = await c.env.DB.prepare('SELECT last_insert_rowid() as id').first();
    const id = idResult ? (idResult as any).id : null;

    if (!id) {
      return c.json({ error: 'Failed to create trip and retrieve ID.' }, 500);
    }

    const newTrip = await c.env.DB.prepare('SELECT * FROM Trips WHERE id = ?').bind(id).first();

    return c.json(newTrip);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.get('/api/trips/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Trips WHERE id = ?').bind(id).all();
    if (results.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = results[0] as any;
    if (trip.currencies) trip.currencies = JSON.parse(trip.currencies);
    return c.json(trip);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// Weather API
app.get('/api/trips/:id/weather', async (c) => {
  const tripId = c.req.param('id');
  try {
    const weatherData = await c.env.KV.get(`weather:trip:${tripId}`, 'json');
    if (!weatherData) return c.json({ message: 'Weather data will be updated at 06:00 AM' }, 202);
    return c.json(weatherData);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// --- Trip Members ---
app.get('/api/trips/:id/members', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT u.id, u.name, u.avatar_url, tm.role FROM TripMembers tm JOIN Users u ON tm.user_id = u.id WHERE tm.trip_id = ?
    `).bind(tripId).all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips/:id/members', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { userIds } = await c.req.json();
    await c.env.DB.prepare('DELETE FROM TripMembers WHERE trip_id = ?').bind(tripId).run();
    for (const userId of userIds) {
      await c.env.DB.prepare('INSERT INTO TripMembers (trip_id, user_id) VALUES (?, ?)').bind(tripId, userId).run();
    }
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// --- Itineraries & Expenses ---
app.get('/api/trips/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT i.*, c.name as city_name 
      FROM Itineraries i 
      LEFT JOIN Cities c ON i.city_id = c.id 
      WHERE i.trip_id = ? ORDER BY date, start_time
    `).bind(tripId).all();
    const parsedResults = results.map((item: any) => ({ ...item, tags: item.tags ? JSON.parse(item.tags) : [] }));
    return c.json(parsedResults);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  try {
    const b = await c.req.json();
    const info = await c.env.DB.prepare(`
      INSERT INTO Itineraries (trip_id, city_id, date, start_time, end_time, title, address, image_url, notes, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tripId, b.city_id, b.date, b.start_time, b.end_time, b.title, b.address, b.image_url, b.notes, JSON.stringify(b.tags || [])).run();
    return c.json({ success: true, id: info.meta.last_row_id });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.get('/api/trips/:id/expenses', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Expenses WHERE trip_id = ? ORDER BY date').bind(tripId).all();
    const parsedResults = results.map((item: any) => ({ ...item, split_members: item.split_members ? JSON.parse(item.split_members) : [] }));
    return c.json(parsedResults);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips/:id/expenses', async (c) => {
  const tripId = c.req.param('id');
  try {
    const b = await c.req.json();
    const info = await c.env.DB.prepare(`
      INSERT INTO Expenses (trip_id, item_name, amount, currency, date, payer_id, split_members, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tripId, b.item_name, b.amount, b.currency, b.date, b.payer_id, JSON.stringify(b.split_members), b.notes, Date.now(), Date.now()).run();
    return c.json({ success: true, id: info.meta.last_row_id });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// --- Settings & Sync ---
app.get('/api/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM App_Settings').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/sync', async (c) => {
  try {
    const data = await c.req.json();
    return c.json({ success: true, message: 'Sync completed' });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// ==========================================
// Export default (Fetch & Scheduled)
// ==========================================
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const normalizedPath = url.pathname.replace(/\/+/g, '/').toLowerCase();
    if (normalizedPath.startsWith('/api')) {
      try {
        const response = await app.fetch(request, env, ctx);
        if (response.status === 404 && !response.headers.get('Content-Type')?.includes('json')) {
          return new Response(JSON.stringify({ error: 'Not Found', path: url.pathname }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }
        return response;
      } catch (e: any) { return new Response(JSON.stringify({ error: 'Error', message: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }); }
    }
    // SPA Fallback
    try {
      const assetManifest = JSON.parse(manifestJSON);
      return await getAssetFromKV({ request, waitUntil: ctx.waitUntil.bind(ctx) }, { ASSET_NAMESPACE: env.__STATIC_CONTENT, ASSET_MANIFEST: assetManifest });
    } catch (e: any) {
      try {
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        return await getAssetFromKV({ request: indexRequest, waitUntil: ctx.waitUntil.bind(ctx) }, { ASSET_NAMESPACE: env.__STATIC_CONTENT, ASSET_MANIFEST: JSON.parse(manifestJSON) });
      } catch (fallbackError) { return new Response('Not Found', { status: 404 }); }
    }
  },
  
  // --- 神級動態天氣演算法 Cron Job ---
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log(`Cron Job triggered at ${new Date().toISOString()}`);
    
    ctx.waitUntil((async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        
        // 1. 撈出所有進行中/未來的 Trips 及預設城市座標
        const { results: activeTrips } = await env.DB.prepare(`
          SELECT t.id, c.name as default_city, c.lat as default_lat, c.lng as default_lng 
          FROM Trips t 
          JOIN Cities c ON t.default_city_id = c.id 
          WHERE t.end_date >= date('now')
        `).all();

        if (activeTrips.length === 0) return;

        const targetHours = ['09:00', '12:00', '15:00', '18:00'];

        for (const trip of activeTrips as any[]) {
          // 2. 撈出該行程「今天」的所有站點及對應的城市
          const { results: todayItineraries } = await env.DB.prepare(`
            SELECT i.start_time, i.end_time, c.name as city, c.lat, c.lng 
            FROM Itineraries i 
            JOIN Cities c ON i.city_id = c.id 
            WHERE i.trip_id = ? AND i.date = ?
          `).bind(trip.id, todayStr).all();

          const intervals = [];
          const uniqueCoords = new Map(); // 用來快取 API 請求，避免同個經緯度打兩次

          // 3. 判斷 4 個時段分別落在哪個城市
          for (const hour of targetHours) {
            let currentLat = trip.default_lat;
            let currentLng = trip.default_lng;
            let currentCity = trip.default_city;

            // 檢查該時段是否落在某個 itinerary 內
            for (const item of todayItineraries as any[]) {
              if (item.start_time && item.end_time && hour >= item.start_time && hour <= item.end_time) {
                currentLat = item.lat;
                currentLng = item.lng;
                currentCity = item.city;
                break;
              }
            }

            const coordKey = `${currentLat},${currentLng}`;
            
            // 4. 若此座標尚未查過，向 Open-Meteo 請求天氣
            if (!uniqueCoords.has(coordKey)) {
              const url = `https://api.open-meteo.com/v1/forecast?latitude=${currentLat}&longitude=${currentLng}&hourly=temperature_2m,precipitation_probability,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
              const res = await fetch(url);
              if (res.ok) uniqueCoords.set(coordKey, await res.json());
            }

            const weatherData = uniqueCoords.get(coordKey);
            
            if (weatherData) {
              const timeString = `${todayStr}T${hour}`;
              const index = weatherData.hourly.time.indexOf(timeString);
              intervals.push({
                time: hour,
                city: currentCity,
                temp: index !== -1 ? Math.round(weatherData.hourly.temperature_2m[index]) : null,
                pop: index !== -1 ? weatherData.hourly.precipitation_probability[index] : null,
                code: index !== -1 ? weatherData.hourly.weathercode[index] : null
              });
            }
          }

          // 5. 抓取每日總結 (以 12:00 中午所在的城市為基準)
          let summary = null;
          const noonData = intervals.find(i => i.time === '12:00');
          if (noonData) {
             const coordKey = [...uniqueCoords.keys()].find(k => uniqueCoords.get(k).hourly.time.includes(`${todayStr}T12:00`)) || [...uniqueCoords.keys()][0];
             const mainWeather = uniqueCoords.get(coordKey);
             summary = {
               max_temp: Math.round(mainWeather.daily.temperature_2m_max[0]),
               min_temp: Math.round(mainWeather.daily.temperature_2m_min[0]),
               weather_code: mainWeather.daily.weathercode[0]
             };
          }

          // 6. 寫入 KV 快取 (24小時過期)
          const finalJSON = { date: todayStr, summary, intervals };
          await env.KV.put(`weather:trip:${trip.id}`, JSON.stringify(finalJSON), { expirationTtl: 86400 });
          console.log(`Weather updated for Trip ${trip.id}`);
        }
      } catch (error) { console.error("Cron job failed:", error); }
    })());
  }
};
