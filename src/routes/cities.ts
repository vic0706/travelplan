import { Hono } from 'hono';

// 根據你的專案設定，這裡可能需要定義 Env，或是直接用 any
const cities = new Hono<{ Bindings: any }>();

// POST /api/cities/search
cities.post('/search', async (c) => {
  const { query } = await c.req.json();
  const apiKey = c.env.GOOGLE_MAPS_API_KEY; // 💡 這裡正確讀取你的 Worker ENV

  // 1. Geocoding API v4 (replaces legacy geocode/json)
  const googleUrl = `https://geocode.googleapis.com/v4/geocode/address?address=${encodeURIComponent(query)}&key=${apiKey}`;
  const response = await fetch(googleUrl);
  const data: any = await response.json();

  if (!data.results?.length) {
    return c.json({ error: 'Google Maps 找不到該地點' }, 400);
  }

  const place = data.results[0];
  const lat: number = place.geocode.location.latitude;
  const lng: number = place.geocode.location.longitude;
  const components = place.addressComponents || [];

  // v4: field is longText instead of long_name
  const getComp = (type: string) => components.find((c: any) => c.types?.includes(type))?.longText;
  const country = getComp('country') || '';
  const cityName = getComp('locality') || getComp('administrative_area_level_1') || (place.formattedAddress || '').split(',')[0];

  // 2. 檢查資料庫是否已存在
  let existing = await c.env.DB.prepare('SELECT id FROM Cities WHERE google_place_id = ?').bind(place.placeId).first();

  if (!existing) {
    // 3. 寫入 D1
    const info = await c.env.DB.prepare(
      'INSERT INTO Cities (name, country, lat, lng, google_place_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(cityName, country, lat, lng, place.placeId).run();
    
    return c.json({ id: info.meta.last_row_id, name: cityName });
  }

  return c.json({ id: existing.id, name: cityName });
});

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