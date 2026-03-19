/// <reference path="./types.d.ts" />
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import { createClient } from '@supabase/supabase-js';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  PASSWORD_SALT: string;
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  UNSPLASH_ACCESS_KEY: string;
  FLIGHT_API_KEY: string;
  GOOGLE_MAPS_API_KEY: string;
  __STATIC_CONTENT: any;
  __STATIC_CONTENT_MANIFEST: string;
}

type Variables = { user: { id: number; role: string; name: string } };
export const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}));

app.get('/api/images/search', async (c) => {
  const query = c.req.query('query');
  const type = c.req.query('type') || 'trip';
  if (!query) return c.json({ error: 'Missing query' }, 400);

  const searchQuery = type === 'trip' ? `${query} Landmark Travel Cityscape` : query;
  
  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=12&orientation=landscape`,
      { headers: { 'Authorization': `Client-ID ${c.env.UNSPLASH_ACCESS_KEY}` } }
    );
    if (!response.ok) return c.json({ error: 'Failed to fetch images' }, response.status as any);
    const data = await response.json() as any;
    const photos = (data.results || []).map((p: any) => ({
      id: p.id, url: p.urls.regular, thumb: p.urls.thumb, attribution: p.user.name, attribution_url: p.user.links.html
    }));
    return c.json(photos);
  } catch (error) { return c.json({ error: 'Internal server error' }, 500); }
});

app.get('/api/flights/lookup', async (c) => {
  const inputCode = c.req.query('code') || '';
  const code = inputCode.replace(/[\u4e00-\u9fa5a-zA-Z\s]+(?=[A-Z]{2}\d+)/g, '').trim().replace(/\s+/g, '');
  if (!code) return c.json({ error: '請輸入正確的航班編號' }, 400);

  const response = await fetch(`http://api.aviationstack.com/v1/flights?access_key=${c.env.FLIGHT_API_KEY}&flight_iata=${code}`);
  const data = await response.json() as any;
  if (!data.data || data.data.length === 0) return c.json({ error: '找不到該航班資訊' }, 404);

  const f = data.data[0];
  return c.json({
    airline: f.airline.name, flight_number: f.flight.iata,
    departure_airport: f.departure.iata, departure_terminal: f.departure.terminal,
    departure_date: f.departure.scheduled.split('T')[0], departure_time: f.departure.scheduled.split('T')[1].substring(0, 5),
    arrival_airport: f.arrival.iata, arrival_terminal: f.arrival.terminal,
    arrival_date: f.arrival.scheduled.split('T')[0], arrival_time: f.arrival.scheduled.split('T')[1].substring(0, 5),
  });
});

app.get('/', (c) => c.text('Worker is running!'));
app.get('/health-check', (c) => c.text('Worker is running!'));
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.notFound((c) => c.json({ error: 'API route not found' }, 404));

async function generateHash(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const decodeUserMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const userData = await c.env.KV.get(`session:${token}`, 'json');
      if (userData) c.set('user', userData);
    } catch (e) {}
  }
  await next();
};

const requireAuthMiddleware = async (c: any, next: any) => {
  if (!c.get('user')) return c.json({ error: 'Unauthorized' }, 401);
  await next();
};

async function checkTripAccess(c: any, tripId: number, level: 'view' | 'edit' | 'admin') {
  const user = c.get('user');
  if (user && user.role === 'Admin') return true;

  const trip = await c.env.DB.prepare('SELECT is_public FROM Trips WHERE id = ?').bind(tripId).first();
  if (!trip) return false;

  let isMember = false;
  if (user) {
    const memberRecord = await c.env.DB.prepare('SELECT 1 FROM TripMembers WHERE trip_id = ? AND user_id = ?').bind(tripId, user.id).first();
    isMember = !!memberRecord;
  }
  if (level === 'admin') return user?.role === 'Admin';
  if (level === 'edit') return isMember;
  if (level === 'view') return trip.is_public === 1 || isMember;
  return false;
}

// 💡 增加 forceRefresh 參數，強制重新抓取而不讀取快取
async function getWeatherForDate(tripId: number, dateStr: string, env: Env, forceRefresh = false) {
  const cacheKey = `weather:trip:${tripId}:${dateStr}`;
  
  if (!forceRefresh) {
    const cached = await env.KV.get(cacheKey, 'json');
    if (cached) return cached;
  }

  const { results: tripResults } = await env.DB.prepare(`SELECT t.id, c.name as default_city, c.lat as default_lat, c.lng as default_lng FROM Trips t JOIN Cities c ON t.default_city_id = c.id WHERE t.id = ?`).bind(tripId).all();
  if (tripResults.length === 0) return null;
  const trip = tripResults[0] as any;

  const targetHours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'];
  const { results: itineraries } = await env.DB.prepare(`SELECT i.start_time, i.end_time, c.name as city, c.lat, c.lng FROM Itineraries i JOIN Cities c ON i.city_id = c.id WHERE i.trip_id = ? AND i.date = ?`).bind(trip.id, dateStr).all();

  const intervals = [];
  const uniqueCoords = new Map();
  const nextDate = new Date(dateStr);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split('T')[0];

  for (const hour of targetHours) {
    let currentLat = trip.default_lat;
    let currentLng = trip.default_lng;
    let currentCity = trip.default_city;
    let checkHour = hour === '24:00' ? '23:59' : hour;

    for (const item of itineraries as any[]) {
      if (item.start_time && item.end_time && checkHour >= item.start_time && checkHour <= item.end_time) {
        currentLat = item.lat; currentLng = item.lng; currentCity = item.city; break;
      }
    }

    const coordKey = `${currentLat},${currentLng}`;
    if (!uniqueCoords.has(coordKey)) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${currentLat}&longitude=${currentLng}&hourly=temperature_2m,precipitation_probability,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&start_date=${dateStr}&end_date=${nextDateStr}`;
      const res = await fetch(url);
      if (res.ok) uniqueCoords.set(coordKey, await res.json());
    }

    const weatherData = uniqueCoords.get(coordKey);
    if (weatherData) {
      const timeString = hour === '24:00' ? `${nextDateStr}T00:00` : `${dateStr}T${hour}`;
      const index = weatherData.hourly.time.indexOf(timeString);
      intervals.push({
        time: hour === '24:00' ? '00:00 (+1)' : hour, city: currentCity,
        temp: index !== -1 ? Math.round(weatherData.hourly.temperature_2m[index]) : null,
        pop: index !== -1 ? weatherData.hourly.precipitation_probability[index] : null,
        code: index !== -1 ? weatherData.hourly.weathercode[index] : null
      });
    }
  }

  let summary = null;
  const noonData = intervals.find(i => i.time === '12:00');
  if (noonData) {
     const coordKey = [...uniqueCoords.keys()].find(k => uniqueCoords.get(k).hourly.time.includes(`${dateStr}T12:00`)) || [...uniqueCoords.keys()][0];
     const mainWeather = uniqueCoords.get(coordKey);
     if (mainWeather && mainWeather.daily) {
       summary = { max_temp: Math.round(mainWeather.daily.temperature_2m_max[0]), min_temp: Math.round(mainWeather.daily.temperature_2m_min[0]), weather_code: mainWeather.daily.weathercode[0] };
     }
  }

  const finalJSON = { date: dateStr, summary, intervals };
  await env.KV.put(cacheKey, JSON.stringify(finalJSON), { expirationTtl: 3600 });
  return finalJSON;
}

async function searchUnsplash(query: string, env: Env): Promise<string | null> {
  try {
    const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`, { headers: { 'Authorization': `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } });
    if (!response.ok) return null;
    const data = await response.json() as any;
    return data.results && data.results.length > 0 ? data.results[0].urls.regular : null;
  } catch (e) { return null; }
}

async function syncWeatherForTrip(tripId: number, env: Env) {
  const todayStr = new Date().toISOString().split('T')[0];
  return getWeatherForDate(tripId, todayStr, env, false);
}

function generateDesiredAccommodationItems(b: any, accId: string | number, hotelImage: string) {
  const desiredItems = [];
  const startDate = new Date(b.check_in_date);
  const endDate = new Date(b.check_out_date);
  const checkInTime = b.check_in_time || '16:00';
  const checkOutTime = b.check_out_time || '11:00';
  const dailyStartTime = b.daily_start_time || '08:00';
  const dailyEndTime = b.daily_end_time || '22:00';

  const currentDate = new Date(startDate);
  const notesWithOrder = b.order_id ? `Order ID: ${b.order_id}\n${b.notes || ''}` : (b.notes || '');

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const isCheckInDay = dateStr === b.check_in_date;
    const isCheckOutDay = dateStr === b.check_out_date;
    const itemName = b.name || b.hotel_name;

    if (isCheckInDay) {
      desiredItems.push({ date: dateStr, start_time: checkInTime, end_time: checkInTime, title: `Check-in ${itemName}`, notes: notesWithOrder, image_url: hotelImage, matchType: 'Check-in' });
      if (!isCheckOutDay) desiredItems.push({ date: dateStr, start_time: dailyEndTime, end_time: dailyEndTime, title: `Back to ${itemName}`, notes: '', image_url: hotelImage, matchType: 'Back to Hotel' });
    } else if (isCheckOutDay) {
      desiredItems.push({ date: dateStr, start_time: checkOutTime, end_time: checkOutTime, title: `Check-out ${itemName}`, notes: notesWithOrder, image_url: hotelImage, matchType: 'Check-out' });
    } else {
      desiredItems.push({ date: dateStr, start_time: dailyStartTime, end_time: dailyStartTime, title: `Leave ${itemName}`, notes: '', image_url: hotelImage, matchType: 'Leave Hotel' });
      desiredItems.push({ date: dateStr, start_time: dailyEndTime, end_time: dailyEndTime, title: `Back to ${itemName}`, notes: '', image_url: hotelImage, matchType: 'Back to Hotel' });
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return desiredItems;
}

// 💡 產生 Rental 子卡片 (加上 Buffer 計算)
function generateDesiredRentalItems(b: any, rentalId: string | number, rentalImage: string) {
  const desiredItems = [];
  const titlePrefix = b.provider ? `${b.provider} ` : '';
  const name = b.title || '';
  const notesWithOrder = b.order_id ? `Order ID: ${b.order_id}\n${b.notes || ''}` : (b.notes || '');

  const details = typeof b.details === 'string' ? JSON.parse(b.details) : (b.details || {});
  
  const depBuffer = details.dep_buffer || 0; 
  const arrBuffer = details.arr_buffer || 0;
  const pad = (n: number) => n.toString().padStart(2, '0');

  // Pick-up
  const pickUpStart = new Date(`1970-01-01T${b.start_time || '10:00'}:00`);
  const pickUpEnd = new Date(pickUpStart.getTime() + (depBuffer * 60000));

  desiredItems.push({
    date: b.start_date,
    start_time: b.start_time || '10:00',
    end_time: `${pad(pickUpEnd.getHours())}:${pad(pickUpEnd.getMinutes())}`,
    title: `Pick-up ${titlePrefix}${name}`.trim(),
    notes: notesWithOrder,
    image_url: rentalImage,
    matchType: 'Pick-up'
  });

  // Return
  const returnStart = new Date(`1970-01-01T${b.end_time || '10:00'}:00`);
  const returnEnd = new Date(returnStart.getTime() + (arrBuffer * 60000));

  desiredItems.push({
    date: b.end_date,
    start_time: b.end_time || '10:00',
    end_time: `${pad(returnEnd.getHours())}:${pad(returnEnd.getMinutes())}`,
    title: `Return ${titlePrefix}${name}`.trim(),
    notes: notesWithOrder,
    image_url: rentalImage,
    matchType: 'Return'
  });

  return desiredItems;
}

// 💡 全域 Sync Handler (天氣 + Google Maps Auto 路線計算)
const syncTripHandler = async (c: any) => {
  const tripId = c.req.param('id');
  const targetDate = c.req.query('date'); 
  
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const { results: trips } = await c.env.DB.prepare('SELECT start_date, end_date FROM Trips WHERE id = ?').bind(tripId).all();
    if (trips.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = trips[0] as any;

    // 1. 強制同步整個 TRIP 的天氣 (遍歷 Trip 所有日期並覆蓋快取)
    const startDate = new Date(trip.start_date);
    const endDate = new Date(trip.end_date);
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dStr = currentDate.toISOString().split('T')[0];
      await getWeatherForDate(Number(tripId), dStr, c.env, true); // forceRefresh = true
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // 取得當前選擇日期的天氣回傳
    const returnDateStr = targetDate || trip.start_date;
    const weatherData = await getWeatherForDate(Number(tripId), returnDateStr, c.env, false);

    // 2. 同步 Google Maps Auto 時間
    const { results: items } = await c.env.DB.prepare(`
      SELECT i.*, c.name as city_name 
      FROM Itineraries i 
      LEFT JOIN Cities c ON i.city_id = c.id 
      WHERE i.trip_id = ? 
      ORDER BY date, start_time
    `).bind(tripId).all();

    const { results: bookings } = await c.env.DB.prepare(`SELECT * FROM Bookings WHERE trip_id = ?`).bind(tripId).all();

    // 💡 精準判定 INFO 卡片的起終點邏輯
    const getLocationString = (item: any, type: 'origin' | 'destination') => {
      let loc = '';
      if (item.related_id) {
         const b = bookings.find((x: any) => x.id === item.related_id);
         if (b) {
            if (b.category === 'HOTEL') {
               loc = b.start_location; // HOTEL只有一個地址
            } else if (b.category === 'PRIVATE_TRANSFER') {
               loc = type === 'origin' ? (b.end_location || b.start_location) : b.start_location;
            } else if (b.category === 'RENTAL') {
               loc = type === 'origin' ? (b.end_location || b.start_location) : b.start_location;
            } else if (b.category === 'FERRY') {
               loc = type === 'origin' ? (b.end_location || b.start_location) : b.start_location;
            } else if (b.category === 'TRAIN') {
               loc = type === 'origin' ? (b.end_location || b.start_location) : b.start_location;
            } else if (b.category === 'FLIGHT') {
               loc = type === 'origin' ? (b.end_location || b.start_location) : b.start_location;
            } else {
               loc = type === 'origin' ? (b.end_location || b.start_location) : b.start_location;
            }
         }
      }
      
      // 如果沒有配地址，就用城市+卡片標題當作GOOGLE MAP位置
      if (!loc) {
         loc = item.address ? item.address : `${item.city_name || ''} ${item.title}`.trim();
      }
      return loc;
    };

    let mapsProcessed = 0;
    let mapsUpdated = 0;
    let mapErrors: string[] = [];

    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i] as any;
      const next = items[i+1] as any;

      // 💡 當使用者設定了 mode，且 next_transport_time 為空 或為 Auto 時才計算
      if (current.date === next.date && current.next_transport_mode && (!current.next_transport_time || current.next_transport_time === 'Auto')) {
         mapsProcessed++;
         
         const origin = getLocationString(current, 'origin');
         const destination = getLocationString(next, 'destination');
         
         let mode = 'transit';
         if (current.next_transport_mode === 'WALKING') mode = 'walking';
         if (current.next_transport_mode === 'DRIVING' || current.next_transport_mode === 'TAXI' || current.next_transport_mode === 'RENTAL') mode = 'driving';

         if (origin && destination) {
            try {
              const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=${mode}&key=${c.env.GOOGLE_MAPS_API_KEY}`;
              const mapRes = await fetch(url);
              const mapData = await mapRes.json() as any;
              
              if (mapData.rows?.[0]?.elements?.[0]?.status === 'OK') {
                 // 將秒數轉為分鐘數
                 const durationSecs = mapData.rows[0].elements[0].duration.value;
                 const durationMins = Math.ceil(durationSecs / 60);
                 
                 // 覆寫時間並清空 Auto
                 await c.env.DB.prepare(`UPDATE Itineraries SET next_transport_time = ?, next_transport_auto_time = '' WHERE id = ?`)
                   .bind(`${durationMins} min`, current.id)
                   .run();
                   
                 mapsUpdated++;
              } else {
                 mapErrors.push(`Failed for ${origin} -> ${destination}: ${mapData.rows?.[0]?.elements?.[0]?.status}`);
              }
            } catch(e: any) { 
              mapErrors.push(`Exception: ${e.message}`);
            }
         } else {
             mapErrors.push(`Missing origin or destination for item ${current.title}`);
         }
      }
    }

    return c.json({ 
        success: true, 
        weather: weatherData, 
        map_sync: { processed: mapsProcessed, updated: mapsUpdated, errors: mapErrors } 
    });
  } catch (error: any) { 
    return c.json({ error: error.message }, 500); 
  }
};

app.post('/api/init', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT COUNT(*) as count FROM Users').all();
    if ((results[0] as any).count === 0) {
      const passwordHash = await generateHash('123456', c.env.PASSWORD_SALT || 'default_salt');
      await c.env.DB.prepare(`INSERT INTO Users (role, name, avatar_url, password_hash, allow_login, created_at, updated_at) VALUES ('Admin', '超級管理員', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin', ?, 1, ?, ?)`).bind(passwordHash, Date.now(), Date.now()).run();
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

// ============================================================================
// 🔒 授權攔截器
// ============================================================================
app.use('/api/*', decodeUserMiddleware);
app.use('/api/users', requireAuthMiddleware);
app.use('/api/users/*', requireAuthMiddleware);
app.use('/api/settings', requireAuthMiddleware);
app.use('/api/sync', requireAuthMiddleware);
app.use('/api/upload', requireAuthMiddleware);
app.post('/api/trips', requireAuthMiddleware);
app.post('/api/trips/*', requireAuthMiddleware);
app.put('/api/trips/*', requireAuthMiddleware);
app.delete('/api/trips/*', requireAuthMiddleware);

// --- 註冊 SYNC API ---
app.post('/api/trips/:id/sync', syncTripHandler);
app.post('/api/trips/:id/weather/sync', syncTripHandler); // 保留防快取

app.post('/api/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file']; 
    const folder = body['folder'] || 'trips';
    if (!file || !(file instanceof File)) return c.json({ error: 'No file uploaded' }, 400);

    const supabaseUrl = c.env.VITE_SUPABASE_URL;
    const supabaseKey = c.env.SUPABASE_SERVICE_ROLE_KEY || c.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return c.json({ error: 'Supabase not configured' }, 500);

    const supabase = createClient(supabaseUrl, supabaseKey);
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    
    const arrayBuffer = await file.arrayBuffer();
    const { error } = await supabase.storage.from('travelplan').upload(fileName, arrayBuffer, { contentType: file.type });
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from('travelplan').getPublicUrl(fileName);
    return c.json({ publicUrl });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

app.get('/api/cities', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Cities ORDER BY country, name').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

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
    const info = await c.env.DB.prepare(`INSERT INTO Users (name, password_hash, role, avatar_url, allow_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(name, passwordHash, role || 'user', avatar_url, allow_login ?? 1, Date.now(), Date.now()).run();
    return c.json({ id: info.meta.last_row_id, name, role, avatar_url });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/users/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const { name, role, allow_login, password, avatar_url, payment_info } = await c.req.json();
    let query = 'UPDATE Users SET updated_at = ?';
    const params: any[] = [Date.now()];

    if (name !== undefined) { query += ', name = ?'; params.push(name); }
    if (role !== undefined) { query += ', role = ?'; params.push(role); }
    if (allow_login !== undefined) { query += ', allow_login = ?'; params.push(allow_login); }
    if (avatar_url !== undefined) { query += ', avatar_url = ?'; params.push(avatar_url); }
    if (payment_info !== undefined) { query += ', payment_info = ?'; params.push(typeof payment_info === 'string' ? payment_info : JSON.stringify(payment_info)); }
    if (password) { query += ', password_hash = ?'; params.push(await generateHash(password, c.env.PASSWORD_SALT || 'salt')); }
    
    query += ' WHERE id = ?'; params.push(id);
    
    await c.env.DB.prepare(query).bind(...params).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.get('/api/trips', async (c) => {
  try {
    const user = c.get('user');
    let query = 'SELECT id, title, cover_image_url, start_date, end_date, default_city_id, is_public FROM Trips WHERE is_public = 1';
    const params: any[] = [];

    if (user) {
      if (user.role === 'Admin') {
        query = 'SELECT id, title, cover_image_url, start_date, end_date, default_city_id, is_public FROM Trips';
      } else {
        query += ' OR id IN (SELECT trip_id FROM TripMembers WHERE user_id = ?)';
        params.push(user.id);
      }
    }
    query += ' ORDER BY start_date DESC';

    const { results: trips } = await c.env.DB.prepare(query).bind(...params).all();
    if (trips.length === 0) return c.json([]);

    const tripIds = trips.map((t: any) => t.id).join(',');
    const { results: allMembers } = await c.env.DB.prepare(`SELECT trip_id, user_id, role FROM TripMembers WHERE trip_id IN (${tripIds})`).all();
    const tripsWithMembers = trips.map((trip: any) => ({ ...trip, members: allMembers.filter((m: any) => m.trip_id === trip.id) }));

    return c.json(tripsWithMembers);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips', async (c) => {
  try {
    const user = c.get('user');
    if (!user || user.role !== 'Admin') return c.json({ error: 'Only Admins can create trips' }, 403);
    const { title, start_date, end_date, cover_image_url, default_city_id, is_public } = await c.req.json();
    await c.env.DB.prepare(`INSERT INTO Trips (title, start_date, end_date, cover_image_url, default_city_id, created_at, updated_at, currencies, is_public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(title, start_date, end_date, cover_image_url || '', default_city_id, Date.now(), Date.now(), JSON.stringify(['TWD']), is_public || 0).run();
    const idResult = await c.env.DB.prepare('SELECT last_insert_rowid() as id').first();
    const id = idResult ? (idResult as any).id : null;
    if (!id) return c.json({ error: 'Failed to create trip.' }, 500);
    const newTrip = await c.env.DB.prepare('SELECT * FROM Trips WHERE id = ?').bind(id).first();
    return c.json(newTrip);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.get('/api/trips/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Trips WHERE id = ?').bind(id).all();
    if (results.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = results[0] as any;
    const { results: members } = await c.env.DB.prepare('SELECT user_id, role FROM TripMembers WHERE trip_id = ?').bind(id).all();
    const isMember = user && members.some((m: any) => m.user_id === user.id);
    const canView = trip.is_public === 1 || isMember || (user && user.role === 'Admin');
    if (!canView) return c.json({ error: 'Unauthorized' }, 401);
    if (trip.currencies) trip.currencies = JSON.parse(trip.currencies);
    trip.members = members || [];
    return c.json(trip);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/trips/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  try {
    const canEdit = await checkTripAccess(c, Number(id), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);
    const { title, start_date, end_date, cover_image_url, default_city_id, currencies, is_public } = await c.req.json();
    let finalIsPublic = is_public;
    if (is_public !== undefined && user.role !== 'Admin') {
       const existing = await c.env.DB.prepare('SELECT is_public FROM Trips WHERE id = ?').bind(id).first();
       finalIsPublic = existing.is_public;
    }
    await c.env.DB.prepare(`UPDATE Trips SET title = ?, start_date = ?, end_date = ?, cover_image_url = ?, default_city_id = ?, currencies = ?, is_public = ?, updated_at = ? WHERE id = ?`).bind(title, start_date, end_date, cover_image_url, default_city_id, JSON.stringify(currencies || ['TWD']), finalIsPublic, Date.now(), id).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.delete('/api/trips/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(id), 'admin');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);
    await c.env.DB.prepare('DELETE FROM Trips WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.get('/api/trips/:id/weather', async (c) => {
  const tripId = c.req.param('id');
  const date = c.req.query('date');
  try {
    if (date) {
      const weatherData = await getWeatherForDate(Number(tripId), date, c.env);
      if (!weatherData) return c.json({ message: 'No weather data available' }, 404);
      return c.json(weatherData);
    } else {
      const todayStr = new Date().toISOString().split('T')[0];
      const weatherData = await c.env.KV.get(`weather:trip:${tripId}:${todayStr}`, 'json');
      if (!weatherData) return c.json({ message: 'Weather data will be updated soon' }, 202);
      return c.json(weatherData);
    }
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// --- Bookings (Unified) ---
app.get('/api/trips/:id/bookings', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Bookings WHERE trip_id = ? ORDER BY start_date, start_time').bind(tripId).all();
    const parsedResults = results.map((r: any) => ({ ...r, details: r.details ? JSON.parse(r.details) : {} }));
    return c.json(parsedResults);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips/:id/bookings', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const b = await c.req.json();
    const detailsJson = JSON.stringify(b.details || {});
    
    let imageUrl = b.image_url;
    if ((b.category === 'HOTEL' || b.category === 'RENTAL') && !imageUrl) {
      imageUrl = await searchUnsplash(b.title, c.env);
    }

    const info = await c.env.DB.prepare(`
      INSERT INTO Bookings (trip_id, category, title, provider, order_id, start_date, start_time, end_date, end_time, start_location, end_location, notes, image_url, details, city_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tripId, b.category, b.title, b.provider || null, b.order_id || null, 
      b.start_date, b.start_time, b.end_date, b.end_time, 
      b.start_location, b.end_location || null, b.notes || null, imageUrl || null, detailsJson, b.city_id || null
    ).run();
    
    // @ts-ignore
    const bookingId = info.meta.last_row_id;

    if (b.category === 'HOTEL') {
      const desiredItems = generateDesiredAccommodationItems({ ...b, check_in_date: b.start_date, check_out_date: b.end_date, check_in_time: b.start_time, check_out_time: b.end_time, hotel_name: b.title, name: b.title, daily_start_time: b.details?.daily_start_time, daily_end_time: b.details?.daily_end_time }, bookingId, imageUrl || '');
      for (const item of desiredItems) {
        await c.env.DB.prepare(`INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(tripId, item.date, item.start_time, item.end_time, item.title, 'ACCOMMODATION', bookingId, item.notes, item.image_url).run();
      }
    } else if (b.category === 'RENTAL') {
      const desiredItems = generateDesiredRentalItems(b, bookingId, imageUrl || '');
      for (const item of desiredItems) {
        await c.env.DB.prepare(`INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(tripId, item.date, item.start_time, item.end_time, item.title, 'RENTAL', bookingId, item.notes, item.image_url).run();
      }
    } else {
      const depDateTime = new Date(`${b.start_date}T${b.start_time || '00:00'}:00`); 
      const depBuffer = b.details?.dep_buffer ?? -120;
      depDateTime.setMinutes(depDateTime.getMinutes() + depBuffer);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const checkInDate = `${depDateTime.getFullYear()}-${pad(depDateTime.getMonth() + 1)}-${pad(depDateTime.getDate())}`;
      const checkInTime = depDateTime.toTimeString().substring(0, 5);

      const arrDateTime = new Date(`${b.end_date || b.start_date}T${b.end_time || '23:59'}:00`);
      const arrBuffer = b.details?.arr_buffer ?? 60;
      arrDateTime.setMinutes(arrDateTime.getMinutes() + arrBuffer);
      const exitTime = arrDateTime.toTimeString().substring(0, 5);

      await c.env.DB.prepare(`INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(tripId, checkInDate, checkInTime, exitTime, b.title, 'TRANSPORTATION', bookingId, b.notes || '').run();
    }
    return c.json({ success: true, id: bookingId });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/trips/:id/bookings/:bookingId', async (c) => {
  const tripId = c.req.param('id');
  const bookingId = c.req.param('bookingId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const b = await c.req.json();
    const detailsJson = JSON.stringify(b.details || {});
    let imageUrl = b.image_url;
    if ((b.category === 'HOTEL' || b.category === 'RENTAL') && !imageUrl) {
      imageUrl = await searchUnsplash(b.title, c.env);
    }

    await c.env.DB.prepare(`
      UPDATE Bookings SET category = ?, title = ?, provider = ?, order_id = ?, start_date = ?, start_time = ?, end_date = ?, end_time = ?, start_location = ?, end_location = ?, notes = ?, image_url = ?, details = ?, city_id = ? 
      WHERE id = ? AND trip_id = ?
    `).bind(
      b.category, b.title, b.provider || null, b.order_id || null, 
      b.start_date, b.start_time, b.end_date, b.end_time, 
      b.start_location, b.end_location || null, b.notes || null, imageUrl || null, detailsJson, b.city_id || null,
      bookingId, tripId
    ).run();

    if (b.category === 'HOTEL') {
      const desiredItems = generateDesiredAccommodationItems({ ...b, check_in_date: b.start_date, check_out_date: b.end_date, check_in_time: b.start_time, check_out_time: b.end_time, hotel_name: b.title, name: b.title, daily_start_time: b.details?.daily_start_time, daily_end_time: b.details?.daily_end_time }, bookingId, imageUrl || '');
      const { results: existingItems } = await c.env.DB.prepare("SELECT * FROM Itineraries WHERE related_id = ? AND trip_id = ? AND type = 'ACCOMMODATION'").bind(bookingId, tripId).all();
      const existingPool = [...existingItems] as any[];

      for (const item of desiredItems) {
        const matchIndex = existingPool.findIndex(e =>
          e.date === item.date &&
          ((item.matchType === 'Check-in' && e.title.includes('Check-in')) ||
           (item.matchType === 'Check-out' && e.title.includes('Check-out')) ||
           (item.matchType === 'Back to Hotel' && e.title.includes('Back')) ||
           (item.matchType === 'Leave Hotel' && e.title.includes('Leave')))
        );

        if (matchIndex !== -1) {
          const match = existingPool[matchIndex];
          existingPool.splice(matchIndex, 1);
          let finalStartTime = match.start_time;
          let finalEndTime = match.end_time;
          let finalTitle = match.title;
          if (item.matchType === 'Check-in' || item.matchType === 'Check-out') {
             finalStartTime = item.start_time;
             finalEndTime = item.end_time;
             finalTitle = item.title;
          }
          await c.env.DB.prepare(`UPDATE Itineraries SET date = ?, start_time = ?, end_time = ?, title = ?, image_url = ? WHERE id = ?`).bind(item.date, finalStartTime, finalEndTime, finalTitle, imageUrl || match.image_url || '', match.id).run();
        } else {
          await c.env.DB.prepare(`INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(tripId, item.date, item.start_time, item.end_time, item.title, 'ACCOMMODATION', bookingId, item.notes, item.image_url).run();
        }
      }
      for (const leftover of existingPool) {
        await c.env.DB.prepare("DELETE FROM Itineraries WHERE id = ?").bind(leftover.id).run();
      }

    } else if (b.category === 'RENTAL') {
      const desiredItems = generateDesiredRentalItems(b, bookingId, imageUrl || '');
      const { results: existingItems } = await c.env.DB.prepare("SELECT * FROM Itineraries WHERE related_id = ? AND trip_id = ? AND type = 'RENTAL'").bind(bookingId, tripId).all();
      const existingPool = [...existingItems] as any[];

      for (const item of desiredItems) {
        const matchIndex = existingPool.findIndex(e =>
          (item.matchType === 'Pick-up' && e.title.includes('Pick-up')) ||
          (item.matchType === 'Return' && e.title.includes('Return'))
        );

        if (matchIndex !== -1) {
          const match = existingPool[matchIndex];
          existingPool.splice(matchIndex, 1);
          await c.env.DB.prepare(`UPDATE Itineraries SET date = ?, start_time = ?, end_time = ?, title = ?, image_url = ? WHERE id = ?`).bind(item.date, item.start_time, item.end_time, item.title, imageUrl || match.image_url || '', match.id).run();
        } else {
          await c.env.DB.prepare(`INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(tripId, item.date, item.start_time, item.end_time, item.title, 'RENTAL', bookingId, item.notes, item.image_url).run();
        }
      }
      for (const leftover of existingPool) {
        await c.env.DB.prepare("DELETE FROM Itineraries WHERE id = ?").bind(leftover.id).run();
      }
    } else {
      await c.env.DB.prepare("DELETE FROM Itineraries WHERE related_id = ? AND trip_id = ? AND type = 'TRANSPORTATION'").bind(bookingId, tripId).run();
      
      const depDateTime = new Date(`${b.start_date}T${b.start_time || '00:00'}:00`); 
      const depBuffer = b.details?.dep_buffer ?? -120;
      depDateTime.setMinutes(depDateTime.getMinutes() + depBuffer);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const checkInDate = `${depDateTime.getFullYear()}-${pad(depDateTime.getMonth() + 1)}-${pad(depDateTime.getDate())}`;
      const checkInTime = depDateTime.toTimeString().substring(0, 5);

      const arrDateTime = new Date(`${b.end_date || b.start_date}T${b.end_time || '23:59'}:00`);
      const arrBuffer = b.details?.arr_buffer ?? 60;
      arrDateTime.setMinutes(arrDateTime.getMinutes() + arrBuffer);
      const exitTime = arrDateTime.toTimeString().substring(0, 5);

      await c.env.DB.prepare(`INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(tripId, checkInDate, checkInTime, exitTime, b.title, 'TRANSPORTATION', bookingId, b.notes || '').run();
    }
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.delete('/api/trips/:id/bookings/:bookingId', async (c) => {
  const tripId = c.req.param('id');
  const bookingId = c.req.param('bookingId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);
    
    await c.env.DB.prepare('DELETE FROM Bookings WHERE id = ? AND trip_id = ?').bind(bookingId, tripId).run();
    await c.env.DB.prepare("DELETE FROM Itineraries WHERE related_id = ? AND trip_id = ? AND type IN ('TRANSPORTATION', 'ACCOMMODATION', 'RENTAL')").bind(bookingId, tripId).run();
    
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// --- Itineraries ---
app.get('/api/trips/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare(`SELECT i.*, c.name as city_name FROM Itineraries i LEFT JOIN Cities c ON i.city_id = c.id WHERE i.trip_id = ? ORDER BY date, start_time`).bind(tripId).all();
    const parsedResults = results.map((item: any) => ({ ...item, tags: item.tags ? JSON.parse(item.tags) : [] }));
    return c.json(parsedResults);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const b = await c.req.json();
    const info = await c.env.DB.prepare(`INSERT INTO Itineraries (trip_id, city_id, date, start_time, end_time, title, address, image_url, notes, tags, sub_items, stay_duration, type, related_id, icon, next_transport_mode, next_transport_time, next_transport_auto_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      tripId, b.city_id, b.date, b.start_time, b.end_time, b.title, b.address || '', b.image_url || '', b.notes || '', JSON.stringify(b.tags || []), b.sub_items || '[]', b.stay_duration || '', b.type || 'GENERAL', b.related_id || null, b.icon || '', b.next_transport_mode || '', b.next_transport_time || '', b.next_transport_auto_time || ''
    ).run();
    return c.json({ success: true, id: info.meta.last_row_id });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/trips/:id/itineraries/:itemId', async (c) => {
  const tripId = c.req.param('id');
  const itemId = c.req.param('itemId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const b = await c.req.json();
    await c.env.DB.prepare(`UPDATE Itineraries SET city_id = ?, date = ?, start_time = ?, end_time = ?, title = ?, address = ?, image_url = ?, notes = ?, tags = ?, sub_items = ?, stay_duration = ?, icon = ?, next_transport_mode = ?, next_transport_time = ?, next_transport_auto_time = ? WHERE id = ? AND trip_id = ?`).bind(
      b.city_id, b.date, b.start_time, b.end_time, b.title, b.address || '', b.image_url || '', b.notes || '', JSON.stringify(b.tags || []), b.sub_items || '[]', b.stay_duration || '', b.icon || '', b.next_transport_mode || '', b.next_transport_time || '', b.next_transport_auto_time || '', itemId, tripId
    ).run();

    if (b.type === 'ACCOMMODATION' && b.related_id) {
       if (b.title.includes('Check-in')) {
          await c.env.DB.prepare('UPDATE Bookings SET start_time = ? WHERE id = ? AND trip_id = ?').bind(b.start_time, b.related_id, tripId).run();
       } else if (b.title.includes('Check-out')) {
          await c.env.DB.prepare('UPDATE Bookings SET end_time = ? WHERE id = ? AND trip_id = ?').bind(b.start_time, b.related_id, tripId).run();
       }
    } else if (b.type === 'RENTAL' && b.related_id) {
       const bookingRecord = await c.env.DB.prepare('SELECT details FROM Bookings WHERE id = ? AND trip_id = ?').bind(b.related_id, tripId).first();
       if (bookingRecord) {
         const details = typeof bookingRecord.details === 'string' ? JSON.parse(bookingRecord.details) : (bookingRecord.details || {});
         
         const startD = new Date(`1970-01-01T${b.start_time}:00`);
         let endD = new Date(`1970-01-01T${b.end_time}:00`);
         if (endD < startD) endD.setDate(endD.getDate() + 1);
         const diffMins = Math.round((endD.getTime() - startD.getTime()) / 60000);

         if (b.title.includes('Pick-up')) {
            details.dep_buffer = diffMins; 
            await c.env.DB.prepare('UPDATE Bookings SET start_time = ?, details = ? WHERE id = ? AND trip_id = ?').bind(b.start_time, JSON.stringify(details), b.related_id, tripId).run();
         } else if (b.title.includes('Return')) {
            details.arr_buffer = diffMins;
            await c.env.DB.prepare('UPDATE Bookings SET end_time = ?, details = ? WHERE id = ? AND trip_id = ?').bind(b.start_time, JSON.stringify(details), b.related_id, tripId).run();
         }
       }
    }

    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.delete('/api/trips/:id/itineraries/:itemId', async (c) => {
  const tripId = c.req.param('id');
  const itemId = c.req.param('itemId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);
    await c.env.DB.prepare('DELETE FROM Itineraries WHERE id = ? AND trip_id = ?').bind(itemId, tripId).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.get('/api/trips/:id/members', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare(`SELECT u.id, u.name, u.avatar_url, tm.role FROM TripMembers tm JOIN Users u ON tm.user_id = u.id WHERE tm.trip_id = ?`).bind(tripId).all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips/:id/members', async (c) => {
  const tripId = c.req.param('id');
  try {
    const isAdmin = await checkTripAccess(c, Number(tripId), 'admin');
    if (!isAdmin) return c.json({ error: 'Only Admins can manage members' }, 403);
    const { userIds } = await c.req.json();
    await c.env.DB.prepare('DELETE FROM TripMembers WHERE trip_id = ?').bind(tripId).run();
    for (const userId of userIds) {
      await c.env.DB.prepare('INSERT INTO TripMembers (trip_id, user_id) VALUES (?, ?)').bind(tripId, userId).run();
    }
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.get('/api/itineraries/:itineraryId/sub-items', async (c) => {
  const itineraryId = c.req.param('itineraryId');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Sub_Itineraries WHERE itinerary_id = ? ORDER BY start_time').bind(itineraryId).all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/itineraries/:itineraryId/sub-items', async (c) => {
  const itineraryId = c.req.param('itineraryId');
  try {
    const b = await c.req.json();
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO Sub_Itineraries (id, itinerary_id, start_time, end_time, title, tags, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, itineraryId, b.start_time, b.end_time, b.title, b.tags || '', b.notes || '').run();
    return c.json({ success: true, id });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/sub-items/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const b = await c.req.json();
    await c.env.DB.prepare(`UPDATE Sub_Itineraries SET start_time = ?, end_time = ?, title = ?, tags = ?, notes = ? WHERE id = ?`).bind(b.start_time, b.end_time, b.title, b.tags || '', b.notes || '', id).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.delete('/api/sub-items/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM Sub_Itineraries WHERE id = ?').bind(id).run();
    return c.json({ success: true });
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
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);
    const b = await c.req.json();
    const info = await c.env.DB.prepare(`INSERT INTO Expenses (trip_id, item_name, amount, currency, date, payer_id, split_members, notes, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(tripId, b.item_name, b.amount, b.currency, b.date, b.payer_id, JSON.stringify(b.split_members), b.notes, b.category || 'other', Date.now(), Date.now()).run();
    return c.json({ success: true, id: info.meta.last_row_id });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/trips/:id/expenses/:expenseId', async (c) => {
  const tripId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);
    const b = await c.req.json();
    await c.env.DB.prepare(`UPDATE Expenses SET item_name = ?, amount = ?, currency = ?, date = ?, payer_id = ?, split_members = ?, notes = ?, category = ?, updated_at = ? WHERE id = ? AND trip_id = ?`).bind(b.item_name, b.amount, b.currency, b.date, b.payer_id, JSON.stringify(b.split_members), b.notes, b.category || 'other', Date.now(), expenseId, tripId).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.delete('/api/trips/:id/expenses/:expenseId', async (c) => {
  const tripId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);
    await c.env.DB.prepare('DELETE FROM Expenses WHERE id = ? AND trip_id = ?').bind(expenseId, tripId).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.get('/api/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM App_Settings').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.get('/api/settings/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Categories ORDER BY is_default DESC, created_at').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/settings/categories', async (c) => {
  try {
    const { name, icon, color } = await c.req.json();
    await c.env.DB.prepare('INSERT INTO Categories (name, icon, color, is_default, created_at) VALUES (?, ?, ?, 0, ?)').bind(name, icon, color, Date.now()).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/settings/categories/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const { name, icon, color } = await c.req.json();
    await c.env.DB.prepare('UPDATE Categories SET name = ?, icon = ?, color = ? WHERE id = ? AND is_default = 0').bind(name, icon, color, id).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.delete('/api/settings/categories/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM Categories WHERE id = ? AND is_default = 0').bind(id).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const normalizedPath = url.pathname.replace(/\/+/g, '/').toLowerCase();
    if (normalizedPath.startsWith('/api') || normalizedPath === '/health-check') {
      try {
        const response = await app.fetch(request, env, ctx);
        if (response.status === 404 && !response.headers.get('Content-Type')?.includes('json')) {
          return new Response(JSON.stringify({ error: 'Not Found', path: url.pathname }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }
        return response;
      } catch (e: any) { return new Response(JSON.stringify({ error: 'Error', message: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } }); }
    }
    try {
      let assetManifest = {};
      try { assetManifest = JSON.parse(manifestJSON); } catch (e) {}
      return await getAssetFromKV({ request, waitUntil: ctx.waitUntil.bind(ctx) }, { ASSET_NAMESPACE: env.__STATIC_CONTENT, ASSET_MANIFEST: assetManifest });
    } catch (e: any) {
      try {
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        let assetManifest = {};
        try { assetManifest = JSON.parse(manifestJSON); } catch (e) {}
        return await getAssetFromKV({ request: indexRequest, waitUntil: ctx.waitUntil.bind(ctx) }, { ASSET_NAMESPACE: env.__STATIC_CONTENT, ASSET_MANIFEST: assetManifest });
      } catch (fallbackError: any) { return new Response('Not Found', { status: 404 }); }
    }
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const { results: activeTrips } = await env.DB.prepare(`SELECT id FROM Trips WHERE end_date >= date('now')`).all();
        if (activeTrips.length === 0) return;
        for (const trip of activeTrips as any[]) await getWeatherForDate(trip.id, todayStr, env, true);
      } catch (error) { console.error("Cron job failed:", error); }
    })());
  }
};