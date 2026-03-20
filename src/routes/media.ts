import { Hono } from 'hono';
import { Env } from '../worker';

const media = new Hono<{ Bindings: Env }>();

media.post('/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    
    // 💡 將根 Bucket 鎖定為 travelplan
    const bucket = 'travelplan';
    // 💡 這裡的 folder 會變成 Bucket 內部的子目錄（例如 travelplan/itineraries/xxx.jpg）
    const folder = (formData.get('folder') as string) || 'itineraries';

    if (!file) return c.json({ error: '未偵測到檔案' }, 400);

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    // 💡 組合完整路徑：travelplan/itineraries/檔名.jpg
    const fullPath = `${bucket}/${folder}/${fileName}`;

    const res = await fetch(
      `${c.env.VITE_SUPABASE_URL}/storage/v1/object/${fullPath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${c.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': file.type,
          'x-upsert': 'true'
        },
        body: await file.arrayBuffer()
      }
    );

    if (!res.ok) {
      const errorDetail = await res.text();
      console.error('Supabase 詳細錯誤:', errorDetail);
      throw new Error(`Supabase 上傳失敗: ${errorDetail}`);
    }

    // 💡 回傳公開網址，路徑同樣要包含 travelplan
    const publicUrl = `${c.env.VITE_SUPABASE_URL}/storage/v1/object/public/${fullPath}`;
    return c.json({ success: true, publicUrl });

  } catch (error: any) {
    console.error('Upload Error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default media;