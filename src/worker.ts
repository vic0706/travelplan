import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

// 引入所有路由模組
import authRoutes from './routes/auth';
import tripRoutes from './routes/trips';
import userRoutes from './routes/users';
import bookingRoutes from './routes/bookings';
import expenseRoutes from './routes/expenses';
import placeRoutes from './routes/places';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  PASSWORD_SALT: string;
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  UNSPLASH_ACCESS_KEY: string;
  GOOGLE_MAPS_API_KEY: string;
  __STATIC_CONTENT: any;
  __STATIC_CONTENT_MANIFEST: string;
}

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// 1. 全域 Middleware
app.use('*', cors());
app.use('/api/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const user = await c.env.KV.get(`session:${token}`, 'json');
      if (user) {
        c.set('user', user);
      }
    } catch (e) {
      console.error('Session lookup failed:', e);
    }
  }
  await next();
});

// 2. 路由分發
app.route('/api/auth', authRoutes);
app.route('/api/trips', tripRoutes);
app.route('/api/users', userRoutes);
app.route('/api/trips/:id/bookings', bookingRoutes);
app.route('/api/trips/:id/expenses', expenseRoutes);
app.route('/api/places', placeRoutes);

// 3. 基礎城市查詢
app.get('/api/cities', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Cities ORDER BY country, name').all();
  return c.json(results);
});

// 4. 健康檢查
app.get('/health-check', (c) => c.json({ status: 'ok', time: Date.now() }));

// 5. Cloudflare Worker 進入點
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // API 與健康檢查路由直接由 Hono 處理
    if (url.pathname.startsWith('/api') || url.pathname === '/health-check') {
      return app.fetch(request, env, ctx);
    }

    try {
      return await getAssetFromKV(
        { request, waitUntil: ctx.waitUntil.bind(ctx) } as any,
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: manifestJSON,
          mapRequestToAsset: (req) => {
            const u = new URL(req.url);
            // 💡 修正邏輯：如果路徑不包含 "." (代表不是 .js, .css, .png 等靜態檔案)，
            // 則一律導向 index.html 以支援 SPA 路由，包含根路徑 "/"。
            if (!u.pathname.includes('.')) {
              return new Request(`${u.origin}/index.html`, req);
            }
            return req;
          },
        }
      );
    } catch (e) {
      // 如果真的找不到（例如不存在的圖片路徑），則回傳 index.html 讓前端 Router 處理 404
      try {
        const notFoundRequest = new Request(`${url.origin}/index.html`, request);
        return await getAssetFromKV(
          { request: notFoundRequest, waitUntil: ctx.waitUntil.bind(ctx) } as any,
          { ASSET_NAMESPACE: env.__STATIC_CONTENT, ASSET_MANIFEST: manifestJSON }
        );
      } catch (e2) {
        return new Response('Resource not found', { status: 404 });
      }
    }
  },
};