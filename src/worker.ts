import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

// 💡 引入模組化後的路由
import authRoutes from './routes/auth';
import tripRoutes from './routes/trips';
import userRoutes from './routes/users';
import bookingRoutes from './routes/bookings';
import expenseRoutes from './routes/expenses';

// 定義環境變數型別
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

// 建立 Hono 實例
const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// --- 1. 全域 Middleware ---

// 處理跨域請求
app.use('*', cors());

// 解析 Token 並獲取使用者身分 (原本的 decodeUserMiddleware)
app.use('/api/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const user = await c.env.KV.get(`session:${token}`, 'json');
      if (user) {
        c.set('user', user); // 將使用者資訊存入 Context，供後續路由使用
      }
    } catch (e) {
      console.error('Session lookup failed:', e);
    }
  }
  await next();
});

// --- 2. 路由分發 (Routing) ---

// 認證相關 (Login, Init)
app.route('/api/auth', authRoutes);

// 行程主體 (List, Weather, Sync, Members, Itineraries)
app.route('/api/trips', tripRoutes);

// 使用者管理 (Admin 專用)
app.route('/api/users', userRoutes);

// 預訂資訊 (掛載在行程路徑下)
app.route('/api/trips/:id/bookings', bookingRoutes);

// 花費記帳 (掛載在行程路徑下)
app.route('/api/trips/:id/expenses', expenseRoutes);

// 基礎資料查詢
app.get('/api/cities', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Cities ORDER BY country, name').all();
  return c.json(results);
});

// 健康檢查
app.get('/health-check', (c) => c.json({ status: 'ok', time: Date.now() }));

// --- 3. Cloudflare Worker 進入點 ---

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // 如果是 API 請求或健康檢查，交給 Hono 處理
    if (url.pathname.startsWith('/api') || url.pathname === '/health-check') {
      return app.fetch(request, env, ctx);
    }

    // 否則，處理靜態資源 (SPA 路由處理)
    try {
      const page = await getAssetFromKV(
        { request, waitUntil: ctx.waitUntil.bind(ctx) } as any,
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: manifestJSON,
          mapRequestToAsset: (req) => {
            const url = new URL(req.url);
            // 如果找不到檔案，就導向 index.html (支援 SPA 路由)
            if (url.pathname !== '/' && !url.pathname.includes('.')) {
              return new Request(`${url.origin}/index.html`, req);
            }
            return req;
          },
        }
      );

      const response = new Response(page.body, page);
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    } catch (e) {
      // 找不到資源時回傳 404
      return new Response('Resource not found', { status: 404 });
    }
  },
};