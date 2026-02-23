import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAssetFromKV, serveSinglePageApp } from '@cloudflare/kv-asset-handler';
// @ts-ignore
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
const assetManifest = JSON.parse(manifestJSON);

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  __STATIC_CONTENT: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  PASSWORD_SALT: string;
  VITE_WORKER_URL: string; // Add VITE_WORKER_URL to Bindings;
}

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
    const user = await c.env.DB.prepare('SELECT * FROM Users WHERE id = ?').bind(username).first<any>();
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // 2. Verify password_hash with SHA-256
    const passwordWithSalt = password + c.env.PASSWORD_SALT;
    const passwordBuffer = new TextEncoder().encode(passwordWithSalt);
    const passwordHashBuffer = await crypto.subtle.digest('SHA-256', passwordBuffer);
    const passwordHash = Array.from(new Uint8Array(passwordHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    console.log("環境變數的 SALT:", c.env.PASSWORD_SALT);
    console.log("DB裡的 Hash:", user.password_hash);
    console.log("系統算出的 Hash:", passwordHash);
    
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
    const { results } = await c.env.DB.prepare('SELECT * FROM App_Settings').all();
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
  try {
    const page = await getAssetFromKV(
      {
        request: c.req.raw,
        waitUntil: c.executionCtx.waitUntil.bind(c.executionCtx),
      },
      {
        ASSET_NAMESPACE: c.env.__STATIC_CONTENT,
        ASSET_MANIFEST: assetManifest,
        mapRequestToAsset: serveSinglePageApp,
      }
    );

    let response = new Response(page.body, page);

    // Inject worker URL into index.html for client-side use
    if (c.req.url.endsWith('/index.html') || c.req.url.endsWith('/')) {
      let html = await response.text();
      html = html.replace('__WORKER_URL__', c.env.VITE_WORKER_URL);
      response = new Response(html, response);
    }

    return response;
  } catch (e: any) {
    // If asset not found, return 404 or index.html if it's a route
    // But serveSinglePageApp should handle routes.
    // If it fails, it's likely a missing file or config error.
    return c.text('Static assets error: ' + e.message, 500);
  }
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
