import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import { createClient } from '@supabase/supabase-js';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  PASSWORD_SALT: string;
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  UNSPLASH_ACCESS_KEY: string;
  FLIGHT_API_KEY: string;
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

// GET /api/images/search?query=...&type=trip|activity
app.get('/api/images/search', async (c) => {
  const query = c.req.query('query');
  const type = c.req.query('type') || 'trip';
  if (!query) return c.json({ error: 'Missing query' }, 400);

  // Optimize search query for travel covers
  const searchQuery = type === 'trip' 
    ? `${query} Landmark Travel Cityscape` 
    : query;
  
  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=12&orientation=landscape`,
      {
        headers: {
          'Authorization': `Client-ID ${c.env.UNSPLASH_ACCESS_KEY}`
        }
      }
    );

    if (!response.ok) {
      console.error('Unsplash API error:', response.status, response.statusText);
      return c.json({ error: 'Failed to fetch images from Unsplash' }, response.status as any);
    }

    const data = await response.json() as any;
    
    // Return clean data
    const photos = (data.results || []).map((p: any) => ({
      id: p.id,
      url: p.urls.regular,
      thumb: p.urls.thumb,
      attribution: p.user.name,
      attribution_url: p.user.links.html
    }));

    return c.json(photos);
  } catch (error) {
    console.error('Unsplash fetch error:', error);
    return c.json({ error: 'Internal server error fetching images' }, 500);
  }
});

// GET /api/flights/lookup?code=BR192
app.get('/api/flights/lookup', async (c) => {
  const inputCode = c.req.query('code') || '';
  
  // 💡 智慧過濾：移除中文或英文名稱，只留下 IATA 代碼 (例如 BR192)
  const code = inputCode.replace(/[\u4e00-\u9fa5a-zA-Z\s]+(?=[A-Z]{2}\d+)/g, '').trim().replace(/\s+/g, '');
  
  if (!code) return c.json({ error: '請輸入正確的航班編號' }, 400);

  // 呼叫 AviationStack (需在環境變數設定 FLIGHT_API_KEY)
  const response = await fetch(
    `http://api.aviationstack.com/v1/flights?access_key=${c.env.FLIGHT_API_KEY}&flight_iata=${code}`
  );

  const data = await response.json() as any;
  
  if (!data.data || data.data.length === 0) {
    return c.json({ error: '找不到該航班資訊' }, 404);
  }

  // 取得最新的一筆航班紀錄
  const f = data.data[0];

  return c.json({
    airline: f.airline.name,
    flight_number: f.flight.iata,
    departure_airport: f.departure.iata,
    departure_terminal: f.departure.terminal,
    departure_date: f.departure.scheduled.split('T')[0],
    departure_time: f.departure.scheduled.split('T')[1].substring(0, 5),
    arrival_airport: f.arrival.iata,
    arrival_terminal: f.arrival.terminal,
    arrival_date: f.arrival.scheduled.split('T')[0],
    arrival_time: f.arrival.scheduled.split('T')[1].substring(0, 5),
  });
});

// Health Check
app.get('/', (c) => c.text('Worker is running!'));
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

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
const decodeUserMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const userData = await c.env.KV.get(`session:${token}`, 'json');
      if (userData) {
        c.set('user', userData);
      }
    } catch (e) {
      // Ignore KV errors (e.g., malformed JSON)
    }
  }
  await next();
};

const requireAuthMiddleware = async (c: any, next: any) => {
  if (!c.get('user')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

// Helper: Check Trip Access
async function checkTripAccess(c: any, tripId: number, level: 'view' | 'edit' | 'admin') {
  const user = c.get('user');
  
  // 1. Admin always has access (except maybe for specific business logic, but generally yes)
  if (user && user.role === 'Admin') return true;

  // 2. Fetch Trip
  const trip = await c.env.DB.prepare('SELECT is_public FROM Trips WHERE id = ?').bind(tripId).first();
  if (!trip) return false; // Trip not found

  // 3. Check Membership
  let isMember = false;
  if (user) {
    const memberRecord = await c.env.DB.prepare('SELECT 1 FROM TripMembers WHERE trip_id = ? AND user_id = ?').bind(tripId, user.id).first();
    isMember = !!memberRecord;
  }

  // 4. Evaluate based on level
  if (level === 'admin') {
    return user?.role === 'Admin';
  }

  if (level === 'edit') {
    return isMember; // Admin handled above
  }

  if (level === 'view') {
    return trip.is_public === 1 || isMember;
  }

  return false;
}

// Helper: Ensure Database Schema and Data Consistency
async function ensureSchema(db: D1Database) {
  try {
    // 1. Ensure is_public column exists in Trips table
    await db.prepare('ALTER TABLE Trips ADD COLUMN is_public INTEGER DEFAULT 0').run();
  } catch (e) {}

  try {
    // 2. Normalize roles to Title Case (Admin, Member, Guest)
    await db.prepare("UPDATE Users SET role = 'Admin' WHERE role = 'admin'").run();
    await db.prepare("UPDATE Users SET role = 'Member' WHERE role = 'member'").run();
    await db.prepare("UPDATE Users SET role = 'Guest' WHERE role = 'guest'").run();
  } catch (e) {}

  try {
    // 3. Add payment_info to Users
    await db.prepare("ALTER TABLE Users ADD COLUMN payment_info TEXT DEFAULT '{}'").run();
  } catch (e) {}

  try {
    // 4. Add category to Expenses
    await db.prepare("ALTER TABLE Expenses ADD COLUMN category TEXT DEFAULT 'other'").run();
  } catch (e) {}

  try {
    // 5. Create ExpenseCategories table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ExpenseCategories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'circle',
        color TEXT DEFAULT '#808080',
        is_default INTEGER DEFAULT 0,
        created_at INTEGER
      )
    `).run();

    // Seed default categories
    const { count } = await db.prepare('SELECT COUNT(*) as count FROM ExpenseCategories').first() as any;
    if (count === 0) {
      const defaults = [
        { name: 'Food', icon: 'Utensils', color: '#F97316' },
        { name: 'Transport', icon: 'Car', color: '#3B82F6' },
        { name: 'Hotel', icon: 'Bed', color: '#8B5CF6' },
        { name: 'Fun', icon: 'PartyPopper', color: '#EC4899' },
        { name: 'Shop', icon: 'ShoppingBag', color: '#F59E0B' },
        { name: 'Other', icon: 'Package', color: '#6B7280' },
      ];
      for (const cat of defaults) {
        await db.prepare('INSERT INTO ExpenseCategories (name, icon, color, is_default, created_at) VALUES (?, ?, ?, 1, ?)').bind(cat.name, cat.icon, cat.color, Date.now()).run();
      }
    }
  } catch (e) {
    console.error('Schema update failed:', e);
  }
  try {
    // 6. Add sub_items to Itineraries
    await db.prepare("ALTER TABLE Itineraries ADD COLUMN sub_items TEXT DEFAULT '[]'").run();
  } catch (e) {}

  try {
    // 7. Add stay_duration to Itineraries
    await db.prepare("ALTER TABLE Itineraries ADD COLUMN stay_duration TEXT DEFAULT ''").run();
  } catch (e) {}

  try {
    // 9. Update Transportations table schema (formerly Flights)
    const transportInfo = await db.prepare("PRAGMA table_info(Transportations)").all();
    const hasTransportTable = transportInfo.results.length > 0;
    
    if (!hasTransportTable) {
      // Check if old Flights table exists
      const flightInfo = await db.prepare("PRAGMA table_info(Flights)").all();
      const hasFlightsTable = flightInfo.results.length > 0;

      if (hasFlightsTable) {
        // Rename Flights to Transportations_Old to migrate data
        await db.prepare("ALTER TABLE Flights RENAME TO Transportations_Old").run();
      }

      // Create new Transportations table
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS Transportations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL,
            type TEXT NOT NULL DEFAULT 'FLIGHT',
            provider TEXT NOT NULL,
            transport_code TEXT NOT NULL,
            departure_date TEXT NOT NULL,
            departure_time TEXT NOT NULL,
            departure_station TEXT,
            departure_terminal TEXT,
            checkin_duration INTEGER DEFAULT 120,
            arrival_date TEXT NOT NULL,
            arrival_time TEXT NOT NULL,
            arrival_station TEXT,
            arrival_terminal TEXT,
            exit_duration INTEGER DEFAULT 60,
            stay_duration INTEGER DEFAULT 0,
            notes TEXT,
            FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
        )
      `).run();

      if (hasFlightsTable) {
        // Migrate data from Transportations_Old (which was Flights)
        // Map: airline -> provider, flight_code -> transport_code, departure_airport -> departure_station, arrival_airport -> arrival_station
        // We need to check if Transportations_Old has the duration columns. If not, we use defaults.
        // However, the previous code added them. If this runs on a fresh DB, Transportations_Old won't exist.
        // If it runs on an existing DB, Flights might or might not have them depending on when it was last run.
        // To be safe, we select what we can.
        
        const oldCols = (await db.prepare("PRAGMA table_info(Transportations_Old)").all()).results.map((c: any) => c.name);
        
        const selectCols = [
          'id', 'trip_id', "'FLIGHT'", 'airline', 'flight_code', 'departure_date', 'departure_time', 'departure_airport', 'departure_terminal',
          oldCols.includes('checkin_duration') ? 'checkin_duration' : '120',
          'arrival_date', 'arrival_time', 'arrival_airport', 'arrival_terminal',
          oldCols.includes('exit_duration') ? 'exit_duration' : '60',
          oldCols.includes('stay_duration') ? 'stay_duration' : '0',
          'notes'
        ];

        await db.prepare(`
          INSERT INTO Transportations (id, trip_id, type, provider, transport_code, departure_date, departure_time, departure_station, departure_terminal, checkin_duration, arrival_date, arrival_time, arrival_station, arrival_terminal, exit_duration, stay_duration, notes)
          SELECT ${selectCols.join(', ')}
          FROM Transportations_Old
        `).run();
        
        await db.prepare("DROP TABLE Transportations_Old").run();
      }
    }
  } catch (e) {
    console.error('Transportations schema update failed', e);
  }

  try {
    // 10. Update Accommodations table schema
    const accInfo = await db.prepare("PRAGMA table_info(Accommodations)").all();
    const hasHotelName = accInfo.results.some((col: any) => col.name === 'hotel_name');
    
    if (!hasHotelName) {
      const hasAccTable = accInfo.results.length > 0;
      if (hasAccTable) {
        await db.prepare("ALTER TABLE Accommodations RENAME TO Accommodations_Old").run();
      }

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS Accommodations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL,
            hotel_name TEXT NOT NULL,
            address TEXT,
            check_in_date TEXT NOT NULL,
            check_out_date TEXT NOT NULL,
            order_id TEXT,
            notes TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
            FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
        )
      `).run();

      if (hasAccTable) {
        // Check columns in old table to avoid errors during migration
        const oldCols = (await db.prepare("PRAGMA table_info(Accommodations_Old)").all()).results.map((c: any) => c.name);
        
        const selectCols = [
          'trip_id',
          oldCols.includes('hotel_name') ? 'hotel_name' : (oldCols.includes('name') ? 'name' : "'Unknown'"),
          'address',
          'check_in_date',
          'check_out_date',
          oldCols.includes('order_id') ? 'order_id' : "''",
          'notes'
        ];

        await db.prepare(`
          INSERT INTO Accommodations (trip_id, hotel_name, address, check_in_date, check_out_date, order_id, notes)
          SELECT ${selectCols.join(', ')}
          FROM Accommodations_Old
        `).run();
        await db.prepare("DROP TABLE Accommodations_Old").run();
      }
    }
  } catch (e) {
    console.error('Accommodations schema update failed', e);
  }
  try {
    // 11. Add type and related_id to Itineraries
    await db.prepare("ALTER TABLE Itineraries ADD COLUMN type TEXT DEFAULT 'GENERAL'").run();
  } catch (e) {}

  try {
    await db.prepare("ALTER TABLE Itineraries ADD COLUMN related_id INTEGER").run();
  } catch (e) {}

  try {
    // 12. Add durations to Transportations (already handled in creation, but for safety if table existed before)
    // We can skip this as the new table creation includes them.
  } catch (e) {}

  try {
    // 13. Add times to Accommodations
    await db.prepare("ALTER TABLE Accommodations ADD COLUMN check_in_time TEXT DEFAULT '15:00'").run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE Accommodations ADD COLUMN check_out_time TEXT DEFAULT '11:00'").run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE Accommodations ADD COLUMN daily_start_time TEXT DEFAULT '08:00'").run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE Accommodations ADD COLUMN daily_end_time TEXT DEFAULT '22:00'").run();
  } catch (e) {}
}

// Helper: Get Weather for a specific date
async function getWeatherForDate(tripId: number, dateStr: string, env: Env) {
  const cacheKey = `weather:trip:${tripId}:${dateStr}`;
  const cached = await env.KV.get(cacheKey, 'json');
  if (cached) return cached;

  const { results: tripResults } = await env.DB.prepare(`
    SELECT t.id, c.name as default_city, c.lat as default_lat, c.lng as default_lng 
    FROM Trips t 
    JOIN Cities c ON t.default_city_id = c.id 
    WHERE t.id = ?
  `).bind(tripId).all();

  if (tripResults.length === 0) return null;
  const trip = tripResults[0] as any;

  const targetHours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'];

  const { results: itineraries } = await env.DB.prepare(`
    SELECT i.start_time, i.end_time, c.name as city, c.lat, c.lng 
    FROM Itineraries i 
    JOIN Cities c ON i.city_id = c.id 
    WHERE i.trip_id = ? AND i.date = ?
  `).bind(trip.id, dateStr).all();

  const intervals = [];
  const uniqueCoords = new Map();

  // Calculate next day string for 24:00 (which is next day 00:00)
  const nextDate = new Date(dateStr);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split('T')[0];

  for (const hour of targetHours) {
    let currentLat = trip.default_lat;
    let currentLng = trip.default_lng;
    let currentCity = trip.default_city;

    // Use current day itineraries for 24:00 as well (or maybe check next day's? For now, stick to current day's last location or default)
    // Actually, 24:00 usually implies the end of the current day, so the location should be where the user is at the end of the day.
    // We'll use the latest itinerary of the current day for 24:00 if available.
    
    let checkHour = hour;
    if (hour === '24:00') checkHour = '23:59';

    for (const item of itineraries as any[]) {
      if (item.start_time && item.end_time && checkHour >= item.start_time && checkHour <= item.end_time) {
        currentLat = item.lat;
        currentLng = item.lng;
        currentCity = item.city;
        break;
      }
    }

    const coordKey = `${currentLat},${currentLng}`;
    
    if (!uniqueCoords.has(coordKey)) {
      // Fetch 2 days to cover 24:00 (which is next day 00:00)
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${currentLat}&longitude=${currentLng}&hourly=temperature_2m,precipitation_probability,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&start_date=${dateStr}&end_date=${nextDateStr}`;
      const res = await fetch(url);
      if (res.ok) uniqueCoords.set(coordKey, await res.json());
    }

    const weatherData = uniqueCoords.get(coordKey);
    
    if (weatherData) {
      let timeString;
      if (hour === '24:00') {
        timeString = `${nextDateStr}T00:00`;
      } else {
        timeString = `${dateStr}T${hour}`;
      }
      
      const index = weatherData.hourly.time.indexOf(timeString);
      intervals.push({
        time: hour === '24:00' ? '00:00 (+1)' : hour,
        city: currentCity,
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
       summary = {
         max_temp: Math.round(mainWeather.daily.temperature_2m_max[0]),
         min_temp: Math.round(mainWeather.daily.temperature_2m_min[0]),
         weather_code: mainWeather.daily.weathercode[0]
       };
     }
  }

  const finalJSON = { date: dateStr, summary, intervals };
  // Cache for 1 hour to allow updates but prevent spam
  await env.KV.put(cacheKey, JSON.stringify(finalJSON), { expirationTtl: 3600 });
  return finalJSON;
}

// Helper: Search Unsplash (Internal)
async function searchUnsplash(query: string, env: Env): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { 'Authorization': `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } }
    );
    if (!response.ok) return null;
    const data = await response.json() as any;
    if (data.results && data.results.length > 0) {
      return data.results[0].urls.regular;
    }
    return null;
  } catch (e) {
    console.error('Unsplash internal search error:', e);
    return null;
  }
}

// Helper: Sync Weather for a Trip (Legacy Cron use)
async function syncWeatherForTrip(tripId: number, env: Env) {
  const todayStr = new Date().toISOString().split('T')[0];
  return getWeatherForDate(tripId, todayStr, env);
}

// ==========================================
// 🔓 Public API
// ==========================================
app.post('/api/init', async (c) => {
  try {
    // Ensure is_public column exists in Trips table
    await ensureSchema(c.env.DB);

    const { results } = await c.env.DB.prepare('SELECT COUNT(*) as count FROM Users').all();
    if ((results[0] as any).count === 0) {
      const salt = c.env.PASSWORD_SALT || 'default_salt';
      const passwordHash = await generateHash('123456', salt);
      await c.env.DB.prepare(`
        INSERT INTO Users (role, name, avatar_url, password_hash, allow_login, created_at, updated_at) 
        VALUES ('Admin', '超級管理員', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin', ?, 1, ?, ?)
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
// Decode user for all API routes
app.use('/api/*', decodeUserMiddleware);

// Apply strict auth only where needed
app.use('/api/users', requireAuthMiddleware);
app.use('/api/users/*', requireAuthMiddleware);
app.use('/api/settings', requireAuthMiddleware);
app.use('/api/sync', requireAuthMiddleware);
app.use('/api/upload', requireAuthMiddleware);

// Trip mutations require auth
app.post('/api/trips', requireAuthMiddleware);
app.post('/api/trips/*', requireAuthMiddleware);
app.put('/api/trips/*', requireAuthMiddleware);
app.delete('/api/trips/*', requireAuthMiddleware);

// Upload Proxy
app.post('/api/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file']; 
    const folder = body['folder'] || 'trips'; // Default to 'trips' if not specified

    if (!file || !(file instanceof File)) return c.json({ error: 'No file uploaded' }, 400);

    const supabaseUrl = c.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = c.env.VITE_SUPABASE_ANON_KEY;
    const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceKey)) {
      return c.json({ error: 'Supabase not configured in worker' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    
    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();
    
    const { data, error } = await supabase.storage
      .from('travelplan') // Bucket name
      .upload(fileName, arrayBuffer, {
        contentType: file.type,
        upsert: false
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('travelplan')
      .getPublicUrl(fileName);

    return c.json({ publicUrl });
  } catch (e: any) {
    console.error('Upload error:', e);
    return c.json({ error: e.message }, 500);
  }
});

// GET routes for trips and cities are public but can be enhanced by knowing the user

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
    const { name, role, allow_login, password, avatar_url, payment_info } = await c.req.json();
    
    let query = 'UPDATE Users SET updated_at = ?';
    const params: any[] = [Date.now()];

    if (name !== undefined) { query += ', name = ?'; params.push(name); }
    if (role !== undefined) { query += ', role = ?'; params.push(role); }
    if (allow_login !== undefined) { query += ', allow_login = ?'; params.push(allow_login); }
    if (avatar_url !== undefined) { query += ', avatar_url = ?'; params.push(avatar_url); }
    if (payment_info !== undefined) { 
      query += ', payment_info = ?'; 
      params.push(typeof payment_info === 'string' ? payment_info : JSON.stringify(payment_info)); 
    }
    
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
    // Ensure is_public column exists (migration)
    await ensureSchema(c.env.DB);

    const user = c.get('user');
    let query = 'SELECT id, title, cover_image_url, start_date, end_date, default_city_id, is_public FROM Trips WHERE is_public = 1';
    const params: any[] = [];

    if (user) {
      // If user is logged in, also show trips they are a member of
      query += ' OR id IN (SELECT trip_id FROM TripMembers WHERE user_id = ?)';
      params.push(user.id);

      // Admins can see all trips
      if (user.role === 'Admin') {
        query = 'SELECT id, title, cover_image_url, start_date, end_date, default_city_id, is_public FROM Trips';
        params.length = 0; // Clear params as admin query doesn't need them
      }
    }
    query += ' ORDER BY start_date DESC';

    const { results } = await c.env.DB.prepare(query).bind(...params).all();

    const tripsWithMembers = await Promise.all(results.map(async (trip: any) => {
      const { results: members } = await c.env.DB.prepare('SELECT user_id, role FROM TripMembers WHERE trip_id = ?').bind(trip.id).all();
      return { ...trip, members: members || [] };
    }));

    return c.json(tripsWithMembers);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips', async (c) => {
  try {
    const user = c.get('user');
    if (!user || user.role !== 'Admin') return c.json({ error: 'Only Admins can create trips' }, 403);

    await ensureSchema(c.env.DB);
    const { title, start_date, end_date, cover_image_url, default_city_id, is_public } = await c.req.json();
    const info = await c.env.DB.prepare(`
      INSERT INTO Trips (title, start_date, end_date, cover_image_url, default_city_id, created_at, updated_at, currencies, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(title, start_date, end_date, cover_image_url || '', default_city_id, Date.now(), Date.now(), JSON.stringify(['TWD']), is_public || 0).run();
    
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
  const user = c.get('user');
  try {
    await ensureSchema(c.env.DB);
    const { results } = await c.env.DB.prepare('SELECT * FROM Trips WHERE id = ?').bind(id).all();
    if (results.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = results[0] as any;

    // Access Control for single trip
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

    await ensureSchema(c.env.DB);
    const { title, start_date, end_date, cover_image_url, default_city_id, currencies, is_public } = await c.req.json();
    
    // Only Admin can change is_public
    let finalIsPublic = is_public;
    if (is_public !== undefined && user.role !== 'Admin') {
       // Fetch existing to preserve
       const existing = await c.env.DB.prepare('SELECT is_public FROM Trips WHERE id = ?').bind(id).first();
       finalIsPublic = existing.is_public;
    }

    await c.env.DB.prepare(`
      UPDATE Trips 
      SET title = ?, start_date = ?, end_date = ?, cover_image_url = ?, default_city_id = ?, currencies = ?, is_public = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      title, start_date, end_date, cover_image_url, default_city_id, JSON.stringify(currencies || ['TWD']), finalIsPublic, Date.now(), id
    ).run();
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

// Weather API
app.get('/api/trips/:id/weather', async (c) => {
  const tripId = c.req.param('id');
  const date = c.req.query('date');
  try {
    if (date) {
      const weatherData = await getWeatherForDate(Number(tripId), date, c.env);
      if (!weatherData) return c.json({ message: 'No weather data available' }, 404);
      return c.json(weatherData);
    } else {
      // Fallback to today's cached weather (legacy)
      const todayStr = new Date().toISOString().split('T')[0];
      const weatherData = await c.env.KV.get(`weather:trip:${tripId}:${todayStr}`, 'json');
      if (!weatherData) return c.json({ message: 'Weather data will be updated soon' }, 202);
      return c.json(weatherData);
    }
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips/:id/weather/sync', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const weatherData = await syncWeatherForTrip(Number(tripId), c.env);
    if (!weatherData) return c.json({ error: 'Failed to sync weather' }, 500);
    return c.json(weatherData);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// --- Transportations & Accommodations ---
app.get('/api/trips/:id/transportations', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Transportations WHERE trip_id = ? ORDER BY dep_date, dep_time').bind(tripId).all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips/:id/transportations', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const b = await c.req.json();
    // id is AUTOINCREMENT
    const info = await c.env.DB.prepare(`
      INSERT INTO Transportations (trip_id, type, provider, code, dep_station, dep_date, dep_time, dep_terminal, checkin_duration, arr_station, arr_date, arr_time, arr_terminal, exit_duration, order_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tripId, 
      b.type || 'FLIGHT', 
      b.provider, 
      b.code, 
      b.dep_station, 
      b.dep_date,
      b.dep_time,
      b.dep_terminal,
      b.checkin_duration || b.dep_checkin_buffer || 120,
      b.arr_station, 
      b.arr_date,
      b.arr_time,
      b.arr_terminal,
      b.exit_duration || b.arr_exit_buffer || 60,
      b.order_id, 
      b.notes
    ).run();
    
    // @ts-ignore
    const transportId = info.meta.last_row_id;

    // Create Itinerary Item for Transportation
    // Calculate Check-in Time (Departure - checkin_buffer)
    const depDateTime = new Date(`${b.dep_date}T${b.dep_time}`); 
    const checkinBuffer = b.dep_checkin_buffer || 120; 
    depDateTime.setMinutes(depDateTime.getMinutes() - checkinBuffer);
    const checkInDate = depDateTime.toISOString().split('T')[0];
    const checkInTime = depDateTime.toTimeString().substring(0, 5);

    // Calculate Exit End Time (Arrival + exit_buffer)
    const arrDateTime = new Date(`${b.arr_date}T${b.arr_time}`);
    const exitBuffer = b.arr_exit_buffer || 60; 
    arrDateTime.setMinutes(arrDateTime.getMinutes() + exitBuffer);
    const exitEndTime = arrDateTime.toTimeString().substring(0, 5);

    await c.env.DB.prepare(`
      INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tripId,
      checkInDate,
      checkInTime,
      exitEndTime,
      `${b.type || 'Transport'}: ${b.provider} ${b.code}`,
      'TRANSPORTATION',
      transportId,
      b.notes || ''
    ).run();

    return c.json({ success: true, id: transportId });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/trips/:id/transportations/:transportId', async (c) => {
  const tripId = c.req.param('id');
  const transportId = c.req.param('transportId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const b = await c.req.json();
    
    await c.env.DB.prepare(`
      UPDATE Transportations 
      SET type = ?, provider = ?, code = ?, dep_station = ?, dep_date = ?, dep_time = ?, dep_terminal = ?, checkin_duration = ?, arr_station = ?, arr_date = ?, arr_time = ?, arr_terminal = ?, exit_duration = ?, order_id = ?, notes = ?
      WHERE id = ? AND trip_id = ?
    `).bind(
      b.type || 'FLIGHT', 
      b.provider, 
      b.code, 
      b.dep_station, 
      b.dep_date,
      b.dep_time,
      b.dep_terminal,
      b.checkin_duration || b.dep_checkin_buffer || 120,
      b.arr_station, 
      b.arr_date,
      b.arr_time,
      b.arr_terminal,
      b.exit_duration || b.arr_exit_buffer || 60,
      b.order_id, 
      b.notes, 
      transportId, 
      tripId
    ).run();

    // Update Itinerary Item
    const depDateTime = new Date(`${b.dep_date}T${b.dep_time}`);
    const checkinBuffer = b.dep_checkin_buffer || 120; 
    depDateTime.setMinutes(depDateTime.getMinutes() - checkinBuffer);
    const checkInDate = depDateTime.toISOString().split('T')[0];
    const checkInTime = depDateTime.toTimeString().substring(0, 5);

    const arrDateTime = new Date(`${b.arr_date}T${b.arr_time}`);
    const exitBuffer = b.arr_exit_buffer || 60;
    arrDateTime.setMinutes(arrDateTime.getMinutes() + exitBuffer);
    const exitEndTime = arrDateTime.toTimeString().substring(0, 5);

    await c.env.DB.prepare(`
      UPDATE Itineraries 
      SET date = ?, start_time = ?, end_time = ?, title = ?, notes = ?
      WHERE type = 'TRANSPORTATION' AND related_id = ? AND trip_id = ?
    `).bind(
      checkInDate,
      checkInTime,
      exitEndTime,
      `${b.type || 'Transport'}: ${b.provider} ${b.code}`,
      b.notes || '',
      transportId,
      tripId
    ).run();

    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.delete('/api/trips/:id/transportations/:transportId', async (c) => {
  const tripId = c.req.param('id');
  const transportId = c.req.param('transportId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    await c.env.DB.prepare('DELETE FROM Transportations WHERE id = ? AND trip_id = ?').bind(transportId, tripId).run();
    // Also delete associated itinerary
    await c.env.DB.prepare("DELETE FROM Itineraries WHERE type = 'TRANSPORTATION' AND related_id = ? AND trip_id = ?").bind(transportId, tripId).run();
    
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.get('/api/trips/:id/accommodations', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Accommodations WHERE trip_id = ? ORDER BY check_in_date').bind(tripId).all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips/:id/accommodations', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const b = await c.req.json();
    // id is AUTOINCREMENT
    const info = await c.env.DB.prepare(`
      INSERT INTO Accommodations (trip_id, hotel_name, address, check_in_date, check_out_date, check_in_time, check_out_time, daily_start_time, daily_end_time, order_id, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tripId, b.hotel_name, b.address, b.check_in_date, b.check_out_date, b.check_in_time || '15:00', b.check_out_time || '11:00', b.daily_start_time || '08:00', b.daily_end_time || '22:00', b.order_id, b.notes, Date.now()).run();
    
    // @ts-ignore
    const accId = info.meta.last_row_id;

    // Fetch Hotel Image
    const hotelImage = await searchUnsplash(b.hotel_name, c.env);

    // Create Itinerary Items for Accommodation
    const startDate = new Date(b.check_in_date);
    const endDate = new Date(b.check_out_date);
    const checkInTime = b.check_in_time || '16:00';
    const checkOutTime = b.check_out_time || '11:00';
    const dailyStartTime = b.daily_start_time || '08:00';
    const dailyEndTime = b.daily_end_time || '22:00';

    const currentDate = new Date(startDate);
    
    // Prepare Notes with Order ID
    const notesWithOrder = b.order_id ? `Order ID: ${b.order_id}\n${b.notes || ''}` : (b.notes || '');

    // Loop through dates
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const isCheckInDay = dateStr === b.check_in_date;
      const isCheckOutDay = dateStr === b.check_out_date;

      if (isCheckInDay) {
        // Check-in Item
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, checkInTime, '', `🏨 Check-in ${b.hotel_name}`, 'ACCOMMODATION', accId, notesWithOrder, hotelImage || '').run();
        
        // Return to Hotel Item (if not also checkout day, which is unlikely for 1 day stay but possible)
        if (!isCheckOutDay) {
             await c.env.DB.prepare(`
              INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes, image_url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(tripId, dateStr, dailyEndTime, '', `🏨 Back to Hotel ${b.hotel_name}`, 'ACCOMMODATION', accId, '', hotelImage || '').run();
        }
      } else if (isCheckOutDay) {
        // Check-out Item
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, checkOutTime, '', `🏨 Check-out ${b.hotel_name}`, 'ACCOMMODATION', accId, notesWithOrder, hotelImage || '').run();
      } else {
        // Intermediate Day
        // Leave Hotel
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, dailyStartTime, '', `🏨 Leave Hotel ${b.hotel_name}`, 'ACCOMMODATION', accId, '', hotelImage || '').run();

        // Return to Hotel
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, dailyEndTime, '', `🏨 Back to Hotel ${b.hotel_name}`, 'ACCOMMODATION', accId, '', hotelImage || '').run();
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return c.json({ success: true, id: accId });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/trips/:id/accommodations/:accId', async (c) => {
  const tripId = c.req.param('id');
  const accId = c.req.param('accId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const b = await c.req.json();
    
    await c.env.DB.prepare(`
      UPDATE Accommodations 
      SET hotel_name = ?, address = ?, check_in_date = ?, check_out_date = ?, check_in_time = ?, check_out_time = ?, daily_start_time = ?, daily_end_time = ?, order_id = ?, notes = ?
      WHERE id = ? AND trip_id = ?
    `).bind(b.hotel_name, b.address, b.check_in_date, b.check_out_date, b.check_in_time || '15:00', b.check_out_time || '11:00', b.daily_start_time || '08:00', b.daily_end_time || '22:00', b.order_id, b.notes, accId, tripId).run();

    // Smart Update Logic for Itinerary Items
    // 1. Fetch existing items
    const { results: existingItems } = await c.env.DB.prepare("SELECT * FROM Itineraries WHERE type = 'ACCOMMODATION' AND related_id = ? AND trip_id = ?").bind(accId, tripId).all();
    const existingPool = [...existingItems] as any[];

    // Fetch Hotel Image (if needed, or reuse existing if available in one of the items?)
    // To be safe and simple, we fetch again or use the one from the first existing item if hotel name hasn't changed much?
    // Let's just fetch to be sure we have a good one, or check if we can preserve.
    // Actually, if the hotel name changed, we definitely want a new image.
    const hotelImage = await searchUnsplash(b.hotel_name, c.env);

    // 2. Generate Desired Items
    const desiredItems = [];
    const startDate = new Date(b.check_in_date);
    const endDate = new Date(b.check_out_date);
    const checkInTime = b.check_in_time || '16:00';
    const checkOutTime = b.check_out_time || '11:00';
    const dailyStartTime = b.daily_start_time || '08:00';
    const dailyEndTime = b.daily_end_time || '22:00';

    const currentDate = new Date(startDate);
    
    // Prepare Notes with Order ID
    const notesWithOrder = b.order_id ? `Order ID: ${b.order_id}\n${b.notes || ''}` : (b.notes || '');

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const isCheckInDay = dateStr === b.check_in_date;
      const isCheckOutDay = dateStr === b.check_out_date;

      if (isCheckInDay) {
        desiredItems.push({
          date: dateStr,
          start_time: checkInTime,
          end_time: '',
          title: `🏨 Check-in ${b.hotel_name}`,
          notes: notesWithOrder,
          image_url: hotelImage || '',
          matchType: 'Check-in'
        });
        
        if (!isCheckOutDay) {
          desiredItems.push({
            date: dateStr,
            start_time: dailyEndTime,
            end_time: '',
            title: `🏨 Back to Hotel ${b.hotel_name}`,
            notes: '',
            image_url: hotelImage || '',
            matchType: 'Back to Hotel'
          });
        }
      } else if (isCheckOutDay) {
        desiredItems.push({
          date: dateStr,
          start_time: checkOutTime,
          end_time: '',
          title: `🏨 Check-out ${b.hotel_name}`,
          notes: notesWithOrder,
          image_url: hotelImage || '',
          matchType: 'Check-out'
        });
      } else {
        desiredItems.push({
          date: dateStr,
          start_time: dailyStartTime,
          end_time: '',
          title: `🏨 Leave Hotel ${b.hotel_name}`,
          notes: '',
          image_url: hotelImage || '',
          matchType: 'Leave Hotel'
        });
        desiredItems.push({
          date: dateStr,
          start_time: dailyEndTime,
          end_time: '',
          title: `🏨 Back to Hotel ${b.hotel_name}`,
          notes: '',
          image_url: hotelImage || '',
          matchType: 'Back to Hotel'
        });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // 3. Sync (Update, Create, Delete)
    for (const item of desiredItems) {
      // Find a match in existingPool
      // We match by date and "matchType" (derived from title prefix)
      // Note: The title format changed, so we need to be careful with matching if the user is updating from old format.
      // Old format: "Check-in: Hotel Name", New: "🏨 Check-in Hotel Name"
      // We can match by checking if title contains "Check-in" etc.
      const matchIndex = existingPool.findIndex(e => 
        e.date === item.date && 
        (
          (item.matchType === 'Check-in' && e.title.includes('Check-in')) ||
          (item.matchType === 'Check-out' && e.title.includes('Check-out')) ||
          (item.matchType === 'Back to Hotel' && e.title.includes('Back to Hotel')) ||
          (item.matchType === 'Leave Hotel' && e.title.includes('Leave Hotel'))
        )
      );

      if (matchIndex !== -1) {
        // Update existing
        const match = existingPool[matchIndex];
        existingPool.splice(matchIndex, 1); // Remove from pool

        // Use new image if found, otherwise keep existing if available, otherwise empty
        const finalImage = item.image_url || match.image_url || '';

        await c.env.DB.prepare(`
          UPDATE Itineraries 
          SET date = ?, start_time = ?, end_time = ?, title = ?, notes = ?, image_url = ?
          WHERE id = ?
        `).bind(item.date, item.start_time, item.end_time, item.title, item.notes, finalImage, match.id).run();
      } else {
        // Create new
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, item.date, item.start_time, item.end_time, item.title, 'ACCOMMODATION', accId, item.notes, item.image_url).run();
      }
    }

    // 4. Delete remaining in pool
    for (const leftover of existingPool) {
      await c.env.DB.prepare("DELETE FROM Itineraries WHERE id = ?").bind(leftover.id).run();
    }

    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.delete('/api/trips/:id/accommodations/:accId', async (c) => {
  const tripId = c.req.param('id');
  const accId = c.req.param('accId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    await c.env.DB.prepare('DELETE FROM Accommodations WHERE id = ? AND trip_id = ?').bind(accId, tripId).run();
    // Also delete associated itineraries
    await c.env.DB.prepare("DELETE FROM Itineraries WHERE type = 'ACCOMMODATION' AND related_id = ? AND trip_id = ?").bind(accId, tripId).run();
    
    return c.json({ success: true });
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
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const b = await c.req.json();
    const info = await c.env.DB.prepare(`
      INSERT INTO Itineraries (trip_id, city_id, date, start_time, end_time, title, address, image_url, notes, tags, sub_items, stay_duration, type, related_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tripId, 
      b.city_id, 
      b.date, 
      b.start_time, 
      b.end_time, 
      b.title, 
      b.address || '', 
      b.image_url || '', 
      b.notes || '', 
      JSON.stringify(b.tags || []),
      b.sub_items || '[]',
      b.stay_duration || '',
      b.type || 'GENERAL',
      b.related_id || null
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
    await c.env.DB.prepare(`
      UPDATE Itineraries 
      SET city_id = ?, date = ?, start_time = ?, end_time = ?, title = ?, address = ?, image_url = ?, notes = ?, tags = ?, sub_items = ?, stay_duration = ?
      WHERE id = ? AND trip_id = ?
    `).bind(
      b.city_id, 
      b.date, 
      b.start_time, 
      b.end_time, 
      b.title, 
      b.address || '', 
      b.image_url || '', 
      b.notes || '', 
      JSON.stringify(b.tags || []),
      b.sub_items || '[]',
      b.stay_duration || '',
      itemId,
      tripId
    ).run();
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

// Sub-Itineraries Endpoints
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
    await c.env.DB.prepare(`
      INSERT INTO Sub_Itineraries (id, itinerary_id, start_time, end_time, title, tags, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, itineraryId, b.start_time, b.end_time, b.title, b.tags || '', b.notes || '').run();
    return c.json({ success: true, id });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/sub-items/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const b = await c.req.json();
    await c.env.DB.prepare(`
      UPDATE Sub_Itineraries 
      SET start_time = ?, end_time = ?, title = ?, tags = ?, notes = ?
      WHERE id = ?
    `).bind(b.start_time, b.end_time, b.title, b.tags || '', b.notes || '', id).run();
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
    const info = await c.env.DB.prepare(`
      INSERT INTO Expenses (trip_id, item_name, amount, currency, date, payer_id, split_members, notes, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tripId, b.item_name, b.amount, b.currency, b.date, b.payer_id, JSON.stringify(b.split_members), b.notes, b.category || 'other', Date.now(), Date.now()).run();
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
    await c.env.DB.prepare(`
      UPDATE Expenses 
      SET item_name = ?, amount = ?, currency = ?, date = ?, payer_id = ?, split_members = ?, notes = ?, category = ?, updated_at = ?
      WHERE id = ? AND trip_id = ?
    `).bind(b.item_name, b.amount, b.currency, b.date, b.payer_id, JSON.stringify(b.split_members), b.notes, b.category || 'other', Date.now(), expenseId, tripId).run();
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

// --- Settings & Sync ---
app.get('/api/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM App_Settings').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// Categories Endpoints
app.get('/api/settings/categories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM ExpenseCategories ORDER BY is_default DESC, created_at').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/settings/categories', async (c) => {
  try {
    const { name, icon, color } = await c.req.json();
    await c.env.DB.prepare('INSERT INTO ExpenseCategories (name, icon, color, is_default, created_at) VALUES (?, ?, ?, 0, ?)').bind(name, icon, color, Date.now()).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/settings/categories/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const { name, icon, color } = await c.req.json();
    await c.env.DB.prepare('UPDATE ExpenseCategories SET name = ?, icon = ?, color = ? WHERE id = ? AND is_default = 0').bind(name, icon, color, id).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.delete('/api/settings/categories/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM ExpenseCategories WHERE id = ? AND is_default = 0').bind(id).run();
    return c.json({ success: true });
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
      const assetManifest = JSON.parse(env.__STATIC_CONTENT_MANIFEST);
      return await getAssetFromKV({ request, waitUntil: ctx.waitUntil.bind(ctx) }, { ASSET_NAMESPACE: env.__STATIC_CONTENT, ASSET_MANIFEST: assetManifest });
    } catch (e: any) {
      try {
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        const assetManifest = JSON.parse(env.__STATIC_CONTENT_MANIFEST);
        return await getAssetFromKV({ request: indexRequest, waitUntil: ctx.waitUntil.bind(ctx) }, { ASSET_NAMESPACE: env.__STATIC_CONTENT, ASSET_MANIFEST: assetManifest });
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
