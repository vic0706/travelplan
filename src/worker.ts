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

const app = new Hono<{ Bindings: Env }>();

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

// 2.1 Get all users (Admin only)
app.get('/api/users', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT id, name, avatar_url, role, allow_login FROM Users').all();
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 2.1.1 Create User API (Admin only)
app.post('/api/users', async (c) => {
  try {
    const { name, password, role, allow_login } = await c.req.json();
    
    // Basic validation
    if (!name || !password) {
      return c.json({ error: 'Name and password are required' }, 400);
    }

    const salt = c.env.PASSWORD_SALT || 'default_salt';
    const passwordHash = await generateHash(password, salt);
    
    // Default avatar based on name (using UI Avatars service or similar, or just null)
    const avatar_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    const result = await c.env.DB.prepare(`
      INSERT INTO Users (name, password_hash, role, avatar_url, allow_login, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
    `).bind(name, passwordHash, role || 'Member', avatar_url, allow_login !== undefined ? allow_login : 1, Date.now(), Date.now()).all();

    const id = result.results[0].id;

    return c.json({ id, name, role, avatar_url });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});



// 3. Login API: Authenticate using username and password

app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (!username || !password) {
      return c.json({ error: 'Missing username or password' }, 400);
    }

    // 同時檢查 id 或 name，並使用 COLLATE NOCASE 確保大小寫不敏感
    const { results } = await c.env.DB.prepare('SELECT * FROM Users WHERE (id = ? OR name = ?) AND allow_login = 1 COLLATE NOCASE').bind(username, username).all();
    const user = results[0] as any;

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    const salt = c.env.PASSWORD_SALT;
    const passwordHash = await generateHash(password, salt);
    
    console.log("環境變數的 SALT:", c.env.PASSWORD_SALT);
    console.log("DB裡的 Hash:", user.password_hash);
    console.log("系統算出的 Hash:", passwordHash);    

    if (passwordHash !== user.password_hash) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const token = crypto.randomUUID();
    try {
      // Store token in KV, expiring in 7 days
      await c.env.KV.put(`token:${token}`, JSON.stringify(user), { expirationTtl: 60 * 60 * 24 * 7 });
    } catch (e) {
      console.error('Failed to save token to KV:', e);
      // Continue even if KV fails, though auth might fail later if we check KV
    }

    // Remove password_hash before sending
    const { password_hash, ...safeUser } = user;
    return c.json({ user: safeUser, token });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 4. Trips API: Get visible trips
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
    const { title, start_date, end_date, cover_image_url, visible_status } = await c.req.json();
    
    const { results } = await c.env.DB.prepare(`
      INSERT INTO Trips (title, start_date, end_date, cover_image_url, visible_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(title, start_date, end_date, cover_image_url, visible_status || 1, Date.now(), Date.now()).run();

    const idResult = await c.env.DB.prepare('SELECT last_insert_rowid() as id').first();
    const id = (idResult as any).id;

    const newTrip = await c.env.DB.prepare('SELECT * FROM Trips WHERE id = ?').bind(id).first();

    return c.json(newTrip);
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

    const result = await c.env.DB.prepare(`
      INSERT INTO Expenses (trip_id, item_name, amount, currency, date, payer_id, split_members, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `).bind(
      tripId, item_name, amount, currency, date, payer_id, 
      JSON.stringify(split_members), notes, Date.now(), Date.now()
    ).all();

    const id = result.results[0].id;

    return c.json({ success: true, id });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 8. Settings API
app.get('/api/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM App_Settings').all();
    const settings = results.reduce((acc: any, curr: any) => {
      acc[curr.key_name] = curr.value;
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
    const stmt = c.env.DB.prepare('INSERT OR REPLACE INTO App_Settings (id, key_name, value) VALUES (?, ?, ?)');
    const batch = Object.entries(settings).map(([key, value]) => stmt.bind(crypto.randomUUID(), key, value));
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

// Export default object with fetch and scheduled handlers
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    // 標準化路徑：移除多餘斜線，轉小寫進行判斷
    const normalizedPath = url.pathname.replace(/\/+/g, '/').toLowerCase();

    // 【鋼鐵規則】只要路徑以 /api 開頭，絕對不允許流向靜態資源
    if (normalizedPath.startsWith('/api')) {
      try {
        const response = await app.fetch(request, env, ctx);
        
        // 如果 Hono 回傳了 404 (例如路徑拼錯)，Hono 的 app.notFound 會處理成 JSON
        // 我們在這裡做最後一層保護，確保 Content-Type 是 JSON
        if (response.status === 404 && !response.headers.get('Content-Type')?.includes('json')) {
          return new Response(JSON.stringify({ 
            error: 'API Route Not Found', 
            path: url.pathname 
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        return response;
      } catch (e: any) {
        return new Response(JSON.stringify({ 
          error: 'Internal Server Error', 
          message: e.message 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // --- 以下僅處理網站靜態資源 ---
    try {
      const assetManifest = JSON.parse(manifestJSON);
      return await getAssetFromKV(
        {
          request,
          waitUntil: ctx.waitUntil.bind(ctx),
        },
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: assetManifest,
        }
      );
    } catch (e: any) {
      // SPA Fallback: 只有非 API 請求才回傳 index.html
      try {
        const assetManifest = JSON.parse(manifestJSON);
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        const indexResponse = await getAssetFromKV(
          {
            request: indexRequest,
            waitUntil: ctx.waitUntil.bind(ctx),
          },
          {
            ASSET_NAMESPACE: env.__STATIC_CONTENT,
            ASSET_MANIFEST: assetManifest,
          }
        );
        return new Response(indexResponse.body, { ...indexResponse, status: 200 });
      } catch (fallbackError) {
        return new Response('Not Found', { status: 404 });
      }
    }
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log(`Cron Job triggered at ${new Date().toISOString()}`);
  }
};
