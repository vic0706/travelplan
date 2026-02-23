import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  DB: D1Database;
  PASSWORD_SALT: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors());

// Helper function: Generate SHA-256 Hash with Salt
async function generateHash(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 1. Init API: Auto-create Admin if Users table is empty
app.post('/api/init', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT COUNT(*) as count FROM Users').all();
    const count = (results[0] as any).count;

    if (count === 0) {
      const salt = c.env.PASSWORD_SALT || 'default_salt';
      const passwordHash = await generateHash('123456', salt);
      const adminId = crypto.randomUUID();

      await c.env.DB.prepare(`
        INSERT INTO Users (id, role, name, avatar_url, password_hash, allow_login) 
        VALUES (?, 'Admin', 'Admin', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin', ?, 1)
      `).bind(adminId, passwordHash).run();

      return c.json({ success: true, message: 'Admin user created successfully.' });
    }
    return c.json({ success: false, message: 'Users table is not empty.' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 2. Avatar Login List API: Fetch users with allow_login = 1
app.get('/api/users/login-list', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, avatar_url, role 
      FROM Users 
      WHERE allow_login = 1
    `).all();
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 3. Login API: Authenticate using userId and password (numeric pad)
app.post('/api/auth/login', async (c) => {
  try {
    const { userId, password } = await c.req.json();
    if (!userId || !password) {
      return c.json({ error: 'Missing userId or password' }, 400);
    }

    const { results } = await c.env.DB.prepare('SELECT * FROM Users WHERE id = ?').bind(userId).all();
    const user = results[0] as any;

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    const salt = c.env.PASSWORD_SALT || 'default_salt';
    const passwordHash = await generateHash(password, salt);

    if (passwordHash !== user.password_hash) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Remove password_hash before sending
    const { password_hash, ...safeUser } = user;
    return c.json({ user: safeUser });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 4. Trips API: Get visible trips
app.get('/api/trips', async (c) => {
  try {
    // For Guest/User, only show visible_status = 1.
    // In a real app, we'd check the Authorization header to see if they are Admin.
    // For now, we return visible trips.
    const { results } = await c.env.DB.prepare(`
      SELECT id, title, cover_image_url, start_date, end_date, timezone, visible_status 
      FROM Trips 
      WHERE visible_status = 1 
      ORDER BY start_date DESC
    `).all();
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 5. Trip Details API
app.get('/api/trips/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Trips WHERE id = ?').bind(id).all();
    if (results.length === 0) return c.json({ error: 'Trip not found' }, 404);
    
    // Parse JSON fields
    const trip = results[0] as any;
    if (trip.currencies) trip.currencies = JSON.parse(trip.currencies);
    
    return c.json(trip);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 6. Itineraries API
app.get('/api/trips/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Itineraries WHERE trip_id = ? ORDER BY date, start_time').bind(tripId).all();
    
    // Parse JSON tags
    const parsedResults = results.map((item: any) => ({
      ...item,
      tags: item.tags ? JSON.parse(item.tags) : []
    }));
    
    return c.json(parsedResults);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 7. Expenses API
app.get('/api/trips/:id/expenses', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Expenses WHERE trip_id = ? ORDER BY date').bind(tripId).all();
    
    // Parse JSON split_members
    const parsedResults = results.map((item: any) => ({
      ...item,
      split_members: item.split_members ? JSON.parse(item.split_members) : []
    }));
    
    return c.json(parsedResults);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Export default object with fetch and scheduled handlers
export default {
  fetch: app.fetch,
  
  // Cron Job Handler for Weather & Transport
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log(`Cron Job triggered at ${new Date().toISOString()}`);
    // TODO: Implement daily 6:00 AM logic to fetch weather summary for ongoing trips
    // 1. Query DB for ongoing trips (start_date <= today <= end_date)
    // 2. Fetch weather from external API (e.g., OpenWeatherMap)
    // 3. Store results in Cloudflare KV or D1 cache table
  }
};
