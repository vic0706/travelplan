import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import { app, Env } from './api';

// @ts-ignore
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

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
