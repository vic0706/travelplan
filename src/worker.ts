import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

// @ts-ignore
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

export interface Env {
  DB: D1Database;
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

// 3. Login API: Authenticate using username and password

app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (!username || !password) {
      return c.json({ error: 'Missing username or password' }, 400);
    }

    const { results } = await c.env.DB.prepare('SELECT * FROM Users WHERE id = ?').bind(username).all();
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

// 8. Settings API
app.get('/api/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM App_Settings').all();
    return c.json(results);
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
