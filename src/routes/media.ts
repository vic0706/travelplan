import { Hono } from 'hono';
import { Env } from '../worker'; // 引入全域的 Binding 定義 [cite: 115]

const media = new Hono<{ Bindings: Env }>();

/**
 * POST /api/media/upload
 * 處理圖片上傳至 Supabase Storage
 */
media.post('/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const folder = (formData.get('folder') as string) || 'itineraries';

    if (!file) {
      return c.json({ error: '找不到上傳的檔案' }, 400);
    }

    // 💡 產生唯一的檔名，避免覆蓋舊圖
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    // 💡 代理請求至 Supabase Storage API
    const supabaseUrl = c.env.VITE_SUPABASE_URL;
    const supabaseKey = c.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/${fileName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': file.type,
          'x-upsert': 'true' // 如果檔案已存在則覆蓋
        },
        body: await file.arrayBuffer()
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Supabase 上傳失敗:', errorText);
      throw new Error('無法將檔案上傳至雲端儲存空間');
    }

    // 💡 回傳 Supabase 公開存取網址
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${fileName}`;
    return c.json({ 
      success: true, 
      publicUrl,
      fileName: file.name
    });

  } catch (error: any) {
    console.error('Upload Route Error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * 未來可以在這裡擴充其他媒體功能，例如：
 * DELETE /:fileName - 刪除檔案
 * GET /list - 列出特定資料夾的檔案
 */

export default media;