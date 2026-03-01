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
  __STATIC_CONTENT: any;
  __STATIC_CONTENT_MANIFEST: string;
}

type Variables = { user: { id: number; role: string; name: string } };
export const app = new Hono<{ Bindings: Env; Variables: Variables }>();
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
    // 9. Update Flights table schema
    // Check if flight_code exists, if not, we might need to migrate or create
    const flightInfo = await db.prepare("PRAGMA table_info(Flights)").all();
    const hasFlightCode = flightInfo.results.some((col: any) => col.name === 'flight_code');
    
    if (!hasFlightCode) {
      // If table exists but no flight_code, it's the old schema.
      // Since SQLite ALTER TABLE is limited, and we want to change ID type too (TEXT -> INTEGER),
      // we'll rename the old table and create a new one, then copy data if possible.
      // However, for simplicity in this dev environment, we'll just create if not exists with new schema,
      // or if it exists with old schema, we'll try to add columns or just let it be (but user asked for change).
      // Let's try to add columns if missing, but ID change is hard.
      // User said "改用數字 ID" (Change to number ID).
      // If we can drop the table, it's easiest. But we lose data.
      // Let's try to create the new table structure if it doesn't exist.
      
      // We will use a migration strategy:
      // 1. Rename old table
      // 2. Create new table
      // 3. Copy data (mapping flight_number -> flight_code)
      // 4. Drop old table
      
      const hasFlightsTable = flightInfo.results.length > 0;
      if (hasFlightsTable) {
        await db.prepare("ALTER TABLE Flights RENAME TO Flights_Old").run();
      }

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS Flights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL,
            airline TEXT NOT NULL,
            flight_code TEXT NOT NULL,
            departure_date TEXT NOT NULL,
            departure_time TEXT NOT NULL,
            departure_airport TEXT,
            departure_terminal TEXT,
            arrival_date TEXT NOT NULL,
            arrival_time TEXT NOT NULL,
            arrival_airport TEXT,
            arrival_terminal TEXT,
            notes TEXT,
            FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
        )
      `).run();

      if (hasFlightsTable) {
        // Migrate data
        // Old schema: id (TEXT), trip_id, airline, flight_number, departure_date, departure_time, departure_airport, departure_terminal, arrival_date, arrival_time, arrival_airport, arrival_terminal, notes
        // New schema: id (INTEGER), ... flight_code ...
        // We can't keep text IDs in integer column. So we'll let ID auto-increment.
        await db.prepare(`
          INSERT INTO Flights (trip_id, airline, flight_code, departure_date, departure_time, departure_airport, departure_terminal, arrival_date, arrival_time, arrival_airport, arrival_terminal, notes)
          SELECT trip_id, airline, flight_number, departure_date, departure_time, departure_airport, departure_terminal, arrival_date, arrival_time, arrival_airport, arrival_terminal, notes
          FROM Flights_Old
        `).run();
        await db.prepare("DROP TABLE Flights_Old").run();
      }
    }
  } catch (e) {
    console.error('Flights schema update failed', e);
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
        // Migrate data
        // Old schema: id (TEXT), trip_id, check_in_date, check_out_date, name, address, notes
        // New schema: id (INTEGER), ... hotel_name ...
        await db.prepare(`
          INSERT INTO Accommodations (trip_id, hotel_name, address, check_in_date, check_out_date, notes)
          SELECT trip_id, name, address, check_in_date, check_out_date, notes
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
    // 12. Add durations to Flights
    await db.prepare("ALTER TABLE Flights ADD COLUMN checkin_duration INTEGER DEFAULT 120").run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE Flights ADD COLUMN exit_duration INTEGER DEFAULT 60").run();
  } catch (e) {}
  try {
    await db.prepare("ALTER TABLE Flights ADD COLUMN stay_duration INTEGER DEFAULT 0").run();
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

// --- Flights & Accommodations ---
app.get('/api/trips/:id/flights', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Flights WHERE trip_id = ? ORDER BY departure_date, departure_time').bind(tripId).all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.post('/api/trips/:id/flights', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const b = await c.req.json();
    // id is AUTOINCREMENT, so we don't bind it.
    const info = await c.env.DB.prepare(`
      INSERT INTO Flights (trip_id, airline, flight_code, departure_date, departure_time, departure_airport, departure_terminal, arrival_date, arrival_time, arrival_airport, arrival_terminal, checkin_duration, exit_duration, stay_duration, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tripId, b.airline, b.flight_code, b.departure_date, b.departure_time, b.departure_airport, b.departure_terminal, b.arrival_date, b.arrival_time, b.arrival_airport, b.arrival_terminal, b.checkin_duration || 120, b.exit_duration || 60, b.stay_duration || 0, b.notes).run();
    
    // @ts-ignore
    const flightId = info.meta.last_row_id;

    // Create Itinerary Item for Flight
    // Calculate Check-in Time (Departure - checkin_duration)
    const depDateTime = new Date(`${b.departure_date}T${b.departure_time}`);
    const checkinDuration = b.checkin_duration || 120; // Default 120 mins
    depDateTime.setMinutes(depDateTime.getMinutes() - checkinDuration);
    const checkInDate = depDateTime.toISOString().split('T')[0];
    const checkInTime = depDateTime.toTimeString().substring(0, 5);

    // Calculate Stay End Time (Arrival + exit_duration + stay_duration)
    const arrDateTime = new Date(`${b.arrival_date}T${b.arrival_time}`);
    const exitDuration = b.exit_duration || 60; // Default 60 mins
    const stayDuration = b.stay_duration || 0;
    arrDateTime.setMinutes(arrDateTime.getMinutes() + exitDuration + stayDuration);
    // const stayEndDate = arrDateTime.toISOString().split('T')[0]; 
    const stayEndTime = arrDateTime.toTimeString().substring(0, 5);

    // Calculate duration for display? Or just let UI handle it.
    // We'll insert the itinerary record.
    await c.env.DB.prepare(`
      INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tripId,
      checkInDate,
      checkInTime,
      stayEndTime,
      `Flight: ${b.airline} ${b.flight_code}`,
      'FLIGHT',
      flightId,
      b.notes || ''
    ).run();

    return c.json({ success: true, id: flightId });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

app.put('/api/trips/:id/flights/:flightId', async (c) => {
  const tripId = c.req.param('id');
  const flightId = c.req.param('flightId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const b = await c.req.json();
    
    await c.env.DB.prepare(`
      UPDATE Flights 
      SET airline = ?, flight_code = ?, departure_date = ?, departure_time = ?, departure_airport = ?, departure_terminal = ?, arrival_date = ?, arrival_time = ?, arrival_airport = ?, arrival_terminal = ?, checkin_duration = ?, exit_duration = ?, stay_duration = ?, notes = ?
      WHERE id = ? AND trip_id = ?
    `).bind(b.airline, b.flight_code, b.departure_date, b.departure_time, b.departure_airport, b.departure_terminal, b.arrival_date, b.arrival_time, b.arrival_airport, b.arrival_terminal, b.checkin_duration || 120, b.exit_duration || 60, b.stay_duration || 0, b.notes, flightId, tripId).run();

    // Update Itinerary Item
    // Calculate Check-in Time
    const depDateTime = new Date(`${b.departure_date}T${b.departure_time}`);
    const checkinDuration = b.checkin_duration || 120; 
    depDateTime.setMinutes(depDateTime.getMinutes() - checkinDuration);
    const checkInDate = depDateTime.toISOString().split('T')[0];
    const checkInTime = depDateTime.toTimeString().substring(0, 5);

    // Calculate Stay End Time
    const arrDateTime = new Date(`${b.arrival_date}T${b.arrival_time}`);
    const exitDuration = b.exit_duration || 60;
    const stayDuration = b.stay_duration || 0;
    arrDateTime.setMinutes(arrDateTime.getMinutes() + exitDuration + stayDuration);
    const stayEndTime = arrDateTime.toTimeString().substring(0, 5);

    await c.env.DB.prepare(`
      UPDATE Itineraries 
      SET date = ?, start_time = ?, end_time = ?, title = ?, notes = ?
      WHERE type = 'FLIGHT' AND related_id = ? AND trip_id = ?
    `).bind(
      checkInDate,
      checkInTime,
      stayEndTime,
      `Flight: ${b.airline} ${b.flight_code}`,
      b.notes || '',
      flightId,
      tripId
    ).run();

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

    // Create Itinerary Items for Accommodation
    const startDate = new Date(b.check_in_date);
    const endDate = new Date(b.check_out_date);
    const checkInTime = b.check_in_time || '16:00';
    const checkOutTime = b.check_out_time || '11:00';
    const dailyStartTime = b.daily_start_time || '08:00';
    const dailyEndTime = b.daily_end_time || '22:00';

    const currentDate = new Date(startDate);
    
    // Loop through dates
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const isCheckInDay = dateStr === b.check_in_date;
      const isCheckOutDay = dateStr === b.check_out_date;

      if (isCheckInDay) {
        // Check-in Item
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, checkInTime, '', `Check-in: ${b.hotel_name}`, 'ACCOMMODATION', accId, b.notes || '').run();
        
        // Return to Hotel Item (if not also checkout day, which is unlikely for 1 day stay but possible)
        if (!isCheckOutDay) {
             await c.env.DB.prepare(`
              INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(tripId, dateStr, dailyEndTime, '', `Back to Hotel`, 'ACCOMMODATION', accId, '').run();
        }
      } else if (isCheckOutDay) {
        // Check-out Item
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, checkOutTime, '', `Check-out: ${b.hotel_name}`, 'ACCOMMODATION', accId, '').run();
      } else {
        // Intermediate Day
        // Leave Hotel
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, dailyStartTime, '', `Leave Hotel`, 'ACCOMMODATION', accId, '').run();

        // Return to Hotel
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, dailyEndTime, '', `Back to Hotel`, 'ACCOMMODATION', accId, '').run();
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

    // Delete existing Itinerary Items
    await c.env.DB.prepare("DELETE FROM Itineraries WHERE type = 'ACCOMMODATION' AND related_id = ? AND trip_id = ?").bind(accId, tripId).run();

    // Recreate Itinerary Items
    const startDate = new Date(b.check_in_date);
    const endDate = new Date(b.check_out_date);
    const checkInTime = b.check_in_time || '16:00';
    const checkOutTime = b.check_out_time || '11:00';
    const dailyStartTime = b.daily_start_time || '08:00';
    const dailyEndTime = b.daily_end_time || '22:00';

    const currentDate = new Date(startDate);
    
    // Loop through dates
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const isCheckInDay = dateStr === b.check_in_date;
      const isCheckOutDay = dateStr === b.check_out_date;

      if (isCheckInDay) {
        // Check-in Item
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, checkInTime, '', `Check-in: ${b.hotel_name}`, 'ACCOMMODATION', accId, b.notes || '').run();
        
        // Return to Hotel Item (if not also checkout day)
        if (!isCheckOutDay) {
             await c.env.DB.prepare(`
              INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(tripId, dateStr, dailyEndTime, '', `Back to Hotel`, 'ACCOMMODATION', accId, '').run();
        }
      } else if (isCheckOutDay) {
        // Check-out Item
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, checkOutTime, '', `Check-out: ${b.hotel_name}`, 'ACCOMMODATION', accId, '').run();
      } else {
        // Intermediate Day
        // Leave Hotel
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, dailyStartTime, '', `Leave Hotel`, 'ACCOMMODATION', accId, '').run();

        // Return to Hotel
        await c.env.DB.prepare(`
          INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, type, related_id, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(tripId, dateStr, dailyEndTime, '', `Back to Hotel`, 'ACCOMMODATION', accId, '').run();
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

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
