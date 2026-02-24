import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  PASSWORD_SALT: string;
  __STATIC_CONTENT: any;
}

export const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Init API: Auto-create Admin if Users table is empty
app.post('/api/init', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT COUNT(*) as count FROM Users').all();
    const count = (results[0] as any).count;

    if (count === 0) {
      const salt = c.env.PASSWORD_SALT || 'default_salt';
      const passwordHash = await generateHash('123456', salt);
      
      await c.env.DB.prepare(
        `INSERT INTO Users (role, name, avatar_url, password_hash, allow_login) VALUES ('Admin', 'Admin', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin', ?, 1)`
      ).bind(passwordHash).run();

      return c.json({ success: true, message: 'Admin user created successfully.' });
    }
    return c.json({ success: false, message: 'Users table is not empty.' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Custom 404 for API
app.notFound((c) => {
  return c.json({ error: 'API route not found', path: c.req.path, method: c.req.method }, 404);
});

// Helper function: Generate SHA-256 Hash with Salt
async function generateHash(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- USER API ---
app.get('/api/users/login-list', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, avatar_url, role FROM Users WHERE allow_login = 1`
    ).all();
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.get('/api/users', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT id, name, avatar_url, role, allow_login FROM Users').all();
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (!username || !password) {
      return c.json({ error: 'Missing username or password' }, 400);
    }
    const { results } = await c.env.DB.prepare('SELECT * FROM Users WHERE (id = ? OR name = ?) AND allow_login = 1 COLLATE NOCASE').bind(username, username).all();
    const user = results[0] as any;
    if (!user) return c.json({ error: 'User not found' }, 404);

    const salt = c.env.PASSWORD_SALT;
    const passwordHash = await generateHash(password, salt);
    if (passwordHash !== user.password_hash) return c.json({ error: 'Invalid credentials' }, 401);

    const token = crypto.randomUUID();
    try {
      await c.env.KV.put(`token:${token}`, JSON.stringify(user), { expirationTtl: 60 * 60 * 24 * 7 });
    } catch (e) {}

    const { password_hash, ...safeUser } = user;
    return c.json({ user: safeUser, token });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// --- TRIP API ---
app.post('/api/trips', async (c) => {
  try {
    const { title, start_date, end_date, cover_image_url, visible_status, currencies } = await c.req.json();
    const { meta } = await c.env.DB.prepare(
      `INSERT INTO Trips (title, start_date, end_date, cover_image_url, visible_status, currencies) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(title, start_date, end_date, cover_image_url, visible_status, JSON.stringify(currencies)).run();
    return c.json({ id: meta.last_row_id });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.post('/api/trips/:id/members', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { userIds } = await c.req.json();
    if (!Array.isArray(userIds)) return c.json({ error: 'userIds must be an array' }, 400);
    
    const statements = userIds.map(userId => 
      c.env.DB.prepare('INSERT INTO TripMembers (trip_id, user_id, role) VALUES (?, ?, ?)')
              .bind(tripId, userId, 'Member')
    );
    
    await c.env.DB.batch(statements);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
