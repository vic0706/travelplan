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
  const { username, password } = await c.req.json();
  // TODO: Verify password_hash from DB.Users
  // TODO: Generate Session Token and store in KV
  return c.json({ token: 'mock-token', user: { id: '1', role: 'Admin', name: 'Admin User' } });
});

// Trips
app.get('/api/trips', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Trips WHERE visible_status = 1').all();
  return c.json(results);
});

// Itineraries
app.get('/api/trips/:tripId/itineraries', async (c) => {
  const tripId = c.req.param('tripId');
  const { results } = await c.env.DB.prepare('SELECT * FROM Itineraries WHERE trip_id = ? ORDER BY date, start_time').bind(tripId).all();
  return c.json(results);
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
