import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  PASSWORD_SALT: string;
  __STATIC_CONTENT: any;
  __STATIC_CONTENT_MANIFEST: string;
}

export const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

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

// 1. Init API: Auto-create Admin if Users table is empty
app.post('/api/init', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT COUNT(*) as count FROM Users').all();
    const count = (results[0] as any).count;

    if (count === 0) {
      const salt = c.env.PASSWORD_SALT || 'default_salt';
      const passwordHash = await generateHash('123456', salt);
      
      await c.env.DB.prepare(`
        INSERT INTO Users (role, name, avatar_url, password_hash, allow_login) 
        VALUES ('Admin', 'Admin', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin', ?, 1)
      `).bind(passwordHash).run();

      return c.json({ success: true, message: 'Admin user created successfully.' });
    }
    return c.json({ success: false, message: 'Users table is not empty.' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 2. Avatar Login List API
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

// 2.1 Get all users
app.get('/api/users', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT id, name, avatar_url, role, allow_login FROM Users').all();
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 2.1.1 Create User API
app.post('/api/users', async (c) => {
  try {
    const { name, password, role, allow_login } = await c.req.json();
    if (!name || !password) {
      return c.json({ error: 'Name and password are required' }, 400);
    }
    const salt = c.env.PASSWORD_SALT || 'default_salt';
    const passwordHash = await generateHash(password, salt);
    const avatar_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    const { meta } = await c.env.DB.prepare(`
      INSERT INTO Users (name, password_hash, role, avatar_url, allow_login, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(name, passwordHash, role || 'Member', avatar_url, allow_login !== undefined ? allow_login : 1, Date.now(), Date.now()).run();

    return c.json({ id: meta.last_row_id, name, role, avatar_url });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 2.2 Get Settings
app.get('/api/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Settings').all();
    const settings = results.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    return c.json(settings);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 3. Login API
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

// 4. Trips API
app.get('/api/trips', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, title, cover_image_url, start_date, end_date, visible_status 
      FROM Trips 
      WHERE visible_status = 1 
      ORDER BY start_date DESC
    `).all();
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 4.1 Create Trip API
app.post('/api/trips', async (c) => {
  try {
    const { title, start_date, end_date, cover_image_url, visible_status, currencies } = await c.req.json();
    const { meta } = await c.env.DB.prepare(`
      INSERT INTO Trips (title, start_date, end_date, cover_image_url, visible_status, currencies, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(title, start_date, end_date, cover_image_url, visible_status || 1, JSON.stringify(currencies || ["TWD"]), Date.now(), Date.now()).run();
    return c.json({ id: meta.last_row_id, title, start_date, end_date, cover_image_url, visible_status });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 4.2 Get Trip Members
app.get('/api/trips/:id/members', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT u.id, u.name, u.avatar_url, u.role
      FROM TripMembers tm
      JOIN Users u ON tm.user_id = u.id
      WHERE tm.trip_id = ?
    `).bind(tripId).all();
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 4.3 Add Trip Members
app.post('/api/trips/:id/members', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { userIds } = await c.req.json();
    if (!Array.isArray(userIds)) return c.json({ error: 'userIds must be an array' }, 400);
    const stmt = c.env.DB.prepare('INSERT INTO TripMembers (trip_id, user_id, role) VALUES (?, ?, ?)');
    const batch = userIds.map((userId: number) => stmt.bind(tripId, userId, 'Member'));
    await c.env.DB.batch(batch);
    return c.json({ success: true });
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
    const trip = results[0] as any;
    if (trip.currencies && typeof trip.currencies === 'string') {
      try { trip.currencies = JSON.parse(trip.currencies); } catch (e) { trip.currencies = ["TWD"]; }
    }
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
    const parsedResults = results.map((item: any) => ({
      ...item,
      split_members: item.split_members ? JSON.parse(item.split_members) : []
    }));
    return c.json(parsedResults);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 7.1 Add Expense API
app.post('/api/trips/:id/expenses', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { item_name, amount, currency, date, payer_id, split_members, notes } = await c.req.json();
    const { meta } = await c.env.DB.prepare(`
      INSERT INTO Expenses (trip_id, item_name, amount, currency, date, payer_id, split_members, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(tripId, item_name, amount, currency, date, payer_id, JSON.stringify(split_members), notes, Date.now(), Date.now()).run();
    return c.json({ success: true, id: meta.last_row_id });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 8. Settings API
app.get('/api/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Settings').all();
    const settings = results.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    return c.json(settings);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 8.1 Update Settings API
app.put('/api/settings', async (c) => {
  try {
    const settings = await c.req.json();
    const stmt = c.env.DB.prepare('INSERT OR REPLACE INTO Settings (key, value, updated_at) VALUES (?, ?, ?)');
    const batch = Object.entries(settings).map(([key, value]) => stmt.bind(key, value, Date.now()));
    await c.env.DB.batch(batch);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 9. Update User API
app.put('/api/users/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const { name, role, allow_login, password } = await c.req.json();
    let query = 'UPDATE Users SET name = ?, role = ?, allow_login = ?, updated_at = ?';
    const params: any[] = [name, role, allow_login, Date.now()];
    if (password) {
      const salt = c.env.PASSWORD_SALT || 'default_salt';
      const passwordHash = await generateHash(password, salt);
      query += ', password_hash = ?';
      params.push(passwordHash);
    }
    query += ' WHERE id = ?';
    params.push(id);
    await c.env.DB.prepare(query).bind(...params).run();
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
