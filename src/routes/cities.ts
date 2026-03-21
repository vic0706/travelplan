import { Hono } from 'hono';

// 根據你的專案設定，這裡可能需要定義 Env，或是直接用 any
const cities = new Hono<{ Bindings: any }>();

// 💡 1. 取得所有城市 (你原本就有的功能，搬來這裡)
cities.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Cities ORDER BY country, name').all();
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 💡 2. 查找或建立新城市 (我們剛剛討論的方案 A 核心)
cities.post('/', async (c) => {
  try {
    const { name, country, lat, lng, google_place_id } = await c.req.json();

    if (!name || !lat || !lng) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // 1. 尋找是否已經有相同的 google_place_id，或同名同國家的城市
    const existing = await c.env.DB.prepare(`
      SELECT id FROM Cities 
      WHERE google_place_id = ? OR (name = ? AND country = ?)
    `).bind(google_place_id || 'N/A', name, country || '').first();

    // 如果資料庫已經有了，直接回傳舊的 ID！
    if (existing) {
      return c.json({ id: existing.id, isNew: false });
    }

    // 2. 如果沒有，自動幫 Cities 表新增這一筆，並取得新的 ID
    const info = await c.env.DB.prepare(`
      INSERT INTO Cities (name, country, lat, lng, google_place_id) 
      VALUES (?, ?, ?, ?, ?)
    `).bind(name, country || '', lat, lng, google_place_id || null).run();

    return c.json({ id: info.meta.last_row_id, isNew: true });
    
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default cities;