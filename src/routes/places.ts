import { Hono } from 'hono';
import { Env } from '../worker';

const places = new Hono<{ Bindings: Env }>();

// 🔍 搜尋地點 (使用 Places API New - Text Search)
places.get('/search', async (c) => {
  const query = c.req.query('q');
  if (!query) return c.json([]);

  const apiKey = c.env.GOOGLE_MAPS_API_KEY;
  const cacheKey = `place_search:${query}`;

  // 1. 嘗試從 KV 讀取快取 (省流第一步) 
  const cached = await c.env.KV.get(cacheKey, 'json');
  if (cached) return c.json(cached);

  try {
    // 2. 呼叫 Google Places API (New)
    // 使用 POST searchText 進行搜尋
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // 核心：FieldMask 只抓取必要欄位，節省費用 
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'zh-TW', // 或是根據需求調整
        maxResultCount: 10
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Google API Error:', err);
      return c.json({ error: 'Search failed' }, 500);
    }

    const data = await response.json() as any;
    
    // 3. 轉換格式以符合 LocationPicker 預期
    const results = (data.places || []).map((p: any) => ({
      google_place_id: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      lat: p.location?.latitude,
      lng: p.location?.longitude
    }));

    // 4. 寫入快取 (有效期限 24 小時)
    await c.env.KV.put(cacheKey, JSON.stringify(results), { expirationTtl: 86400 });

    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default places;