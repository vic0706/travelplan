import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS Configuration
app.use('*', cors({
  origin: '*', // In production, restrict to your domain
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// --- API Routes ---

// Auth
app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json();

    // 1. Fetch user from DB
    const user = await c.env.DB.prepare('SELECT * FROM Users WHERE username = ?').bind(username).first<any>();
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // 2. Verify password_hash with SHA-256
    const passwordBuffer = new TextEncoder().encode(password);
    const passwordHashBuffer = await crypto.subtle.digest('SHA-256', passwordBuffer);
    const passwordHash = Array.from(new Uint8Array(passwordHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (passwordHash !== user.password_hash) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // 3. Generate Session Token and store in KV
    const sessionToken = crypto.randomUUID();
    await c.env.KV.put(`session:${sessionToken}`, JSON.stringify({ userId: user.id, role: user.role }), { expirationTtl: 86400 }); // 24h

    const { password_hash, ...userWithoutPassword } = user;

    return c.json({ token: sessionToken, user: userWithoutPassword });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Settings
app.get('/api/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM AppSettings').all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Users
app.get('/api/users', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Users').all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Trips
app.get('/api/trips', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Trips WHERE visible_status = 1').all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get('/api/trips/:tripId', async (c) => {
  try {
    const tripId = c.req.param('tripId');
    const trip = await c.env.DB.prepare('SELECT * FROM Trips WHERE id = ?').bind(tripId).first();
    if (!trip) return c.json({ error: 'Trip not found' }, 404);
    return c.json(trip);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Itineraries
app.get('/api/trips/:tripId/itineraries', async (c) => {
  try {
    const tripId = c.req.param('tripId');
    const { results } = await c.env.DB.prepare('SELECT * FROM Itineraries WHERE trip_id = ? ORDER BY date, start_time').bind(tripId).all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Expenses
app.get('/api/trips/:tripId/expenses', async (c) => {
  try {
    const tripId = c.req.param('tripId');
    const { results } = await c.env.DB.prepare('SELECT * FROM Expenses WHERE trip_id = ? ORDER BY date').bind(tripId).all();
    return c.json(results);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- Static Assets Fallback ---
// Any request that doesn't match the /api routes will be served from the static assets
app.get('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

// --- Cron Job (Scheduled Task) ---
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    // Triggered daily at 6:00 AM (configured in wrangler.toml)
    ctx.waitUntil(runDailyTasks(env));
  }
};

async function runDailyTasks(env: Bindings) {
  console.log('Running daily cron job: Fetching Weather & Google Maps Transit Times');
  // 1. Query Trips that are currently active or in the future
  // 2. For each trip, fetch itineraries for today
  // 3. Fetch weather data and store in KV
  // 4. Calculate transit times between itineraries using Google Maps API and store in KV
}
