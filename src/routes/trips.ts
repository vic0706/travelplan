import { Hono } from 'hono';
import { Env } from '../worker';
import { checkTripAccess, getWeatherForDate, syncPlaceDetails, optimizeDailyItinerary, searchUnsplash } from '../utils/workerUtils';

const trips = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// ==========================================
// 圖片自動抓取並存入 Supabase 的工具函式
// ✅ 解決問題 1：picsum 圖片不固定 + 與行程無關聯性
// 流程：Unsplash 搜尋 → 下載圖片 bytes → 上傳到 Supabase → 回傳永久 URL
// ==========================================
async function fetchAndStoreImage(query: string, env: Env): Promise<string | null> {
  try {
    // 1. 用城市名/行程標題向 Unsplash 搜尋相關圖片
    const unsplashUrl = await searchUnsplash(query, env);
    if (!unsplashUrl) {
      console.warn(`[Cover] Unsplash returned no results for query: "${query}"`);
      return null;
    }

    // 2. 下載圖片
    const imgRes = await fetch(unsplashUrl);
    if (!imgRes.ok) {
      console.warn(`[Cover] Failed to download image from Unsplash: ${imgRes.status}`);
      return null;
    }
    const imgBuffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';

    // 3. 上傳到 Supabase Storage (travelplan/trips/ 目錄)
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const fullPath = `travelplan/trips/${fileName}`;

    const uploadRes = await fetch(
      `${env.VITE_SUPABASE_URL}/storage/v1/object/${fullPath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        body: imgBuffer,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error(`[Cover] Supabase upload failed: ${err}`);
      return null;
    }

    // 4. 回傳永久公開 URL
    const publicUrl = `${env.VITE_SUPABASE_URL}/storage/v1/object/public/${fullPath}`;
    console.log(`[Cover] Image stored at: ${publicUrl}`);
    return publicUrl;
  } catch (e: any) {
    console.error('[Cover] fetchAndStoreImage error:', e.message);
    return null;
  }
}

// ==========================================
// 1. Trips (主行程 CRUD)
// ==========================================

// 獲取行程列表
trips.get('/', async (c) => {
  try {
    const user = c.get('user');
    let query = 'SELECT id, title, cover_image_url, start_date, end_date, default_city_id, is_public FROM Trips WHERE is_public = 1';
    const params: any[] = [];

    if (user) {
      if (user.role === 'Admin') {
        query = 'SELECT id, title, cover_image_url, start_date, end_date, default_city_id, is_public FROM Trips';
      } else {
        query += ' OR id IN (SELECT trip_id FROM TripMembers WHERE user_id = ?)';
        params.push(user.id);
      }
    }

    query += ' ORDER BY start_date DESC';
    const { results: tripsData } = await c.env.DB.prepare(query).bind(...params).all();

    if (tripsData.length === 0) return c.json([]);

    const tripIds = tripsData.map((t: any) => t.id).join(',');
    const { results: allMembers } = await c.env.DB.prepare(
      `SELECT trip_id, user_id as id, role FROM TripMembers WHERE trip_id IN (${tripIds})`
    ).all();

    return c.json(tripsData.map((trip: any) => ({
      ...trip,
      members: allMembers.filter((m: any) => m.trip_id === trip.id)
    })));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ✅ 建立行程 — 修正圖片邏輯
// 1. 如果使用者有手動上傳圖片 (cover_image_url 已是 Supabase URL) → 直接用
// 2. 如果沒有圖片 → 用 default_city 名稱搜尋 Unsplash，下載後存入 Supabase
// 3. 圖片 URL 存入 DB，之後修改標題不會影響圖片
trips.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { title, start_date, end_date, default_city_id, cover_image_url, currencies } = body;

    // 決定封面圖片 URL
    let finalCoverUrl = cover_image_url || null;

    // 使用者沒有手動上傳圖片時，才去抓 Unsplash
    if (!finalCoverUrl) {
      // 優先用城市名搜尋，城市名不存在時 fallback 用行程標題
      let imageQuery = title || 'travel destination';

      if (default_city_id) {
        const cityRow = await c.env.DB.prepare(
          'SELECT name, country FROM Cities WHERE id = ?'
        ).bind(default_city_id).first() as any;

        if (cityRow) {
          // 「台北 Taiwan travel」這種 query 比純城市名更能拿到風景照而非筆電
          imageQuery = `${cityRow.name} ${cityRow.country} travel landscape`;
        }
      }

      console.log(`[Cover] No image provided, searching Unsplash for: "${imageQuery}"`);
      finalCoverUrl = await fetchAndStoreImage(imageQuery, c.env);
    }

    const { meta } = await c.env.DB.prepare(`
      INSERT INTO Trips (title, start_date, end_date, default_city_id, cover_image_url, currencies, is_public, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      title, start_date, end_date, default_city_id,
      finalCoverUrl,  // ← 存入已下載到 Supabase 的永久 URL
      JSON.stringify(currencies || []), 0, Date.now(), Date.now()
    ).run();

    return c.json({ id: meta.last_row_id });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 獲取特定 ID 行程資料
trips.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const canView = await checkTripAccess(c, Number(id), 'view');
    if (!canView) return c.json({ error: 'Unauthorized' }, 403);

    const { results } = await c.env.DB.prepare('SELECT * FROM Trips WHERE id = ?').bind(id).all();
    if (results.length === 0) return c.json({ error: 'Trip not found' }, 404);

    const trip = results[0] as any;
    const { results: members } = await c.env.DB.prepare(
      'SELECT user_id as id, role FROM TripMembers WHERE trip_id = ?'
    ).bind(id).all();

    return c.json({
      ...trip,
      currencies: trip.currencies ? JSON.parse(trip.currencies) : [],
      members
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 更新行程設定
trips.put('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(id), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const body = await c.req.json().catch(() => ({}));

    // ✅ 更新時若沒帶 cover_image_url，保留原本已存的圖片（不因標題更改而重新抓圖）
    let finalCoverUrl = body.cover_image_url;
    if (!finalCoverUrl) {
      const existing = await c.env.DB.prepare(
        'SELECT cover_image_url FROM Trips WHERE id = ?'
      ).bind(id).first() as any;
      finalCoverUrl = existing?.cover_image_url || null;
    }

    await c.env.DB.prepare(`
      UPDATE Trips SET title = ?, start_date = ?, end_date = ?, default_city_id = ?, cover_image_url = ?, currencies = ?, is_public = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      body.title, body.start_date, body.end_date, body.default_city_id,
      finalCoverUrl,
      JSON.stringify(body.currencies || []), body.is_public ? 1 : 0, Date.now(), id
    ).run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 刪除行程
trips.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const canAdmin = await checkTripAccess(c, Number(id), 'admin');
    if (!canAdmin) return c.json({ error: 'Unauthorized' }, 403);

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM Itineraries WHERE trip_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM Expenses WHERE trip_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM TripMembers WHERE trip_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM Bookings WHERE trip_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM Trips WHERE id = ?').bind(id),
    ]);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 天氣查詢
trips.get('/:id/weather', async (c) => {
  const id = c.req.param('id');
  const date = c.req.query('date');
  try {
    if (date) {
      const weatherData = await getWeatherForDate(Number(id), date, c.env);
      if (!weatherData) return c.json({ message: 'No weather data', data: null }, 404);
      return c.json(typeof weatherData === 'string' ? JSON.parse(weatherData) : weatherData);
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const cached = await c.env.KV.get(`weather:trip:${id}:${todayStr}`, 'json');
    return cached ? c.json(cached) : c.json({ message: 'Weather not synced yet' }, 202);
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch weather', details: error.message }, 500);
  }
});

// AI Itinerary Optimization
trips.post('/:id/optimize', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const { results: tripInfo } = await c.env.DB.prepare(
      'SELECT start_date, end_date FROM Trips WHERE id = ?'
    ).bind(tripId).all();
    if (tripInfo.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = tripInfo[0] as any;

    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      await optimizeDailyItinerary(c.env, Number(tripId), dateStr);
    }
    return c.json({ success: true, message: 'Itinerary Optimized' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// AI Compute (weather + Google API)
trips.post('/:id/compute', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const { results: tripInfo } = await c.env.DB.prepare(
      'SELECT start_date, end_date FROM Trips WHERE id = ?'
    ).bind(tripId).all();
    if (tripInfo.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = tripInfo[0] as any;

    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      await getWeatherForDate(Number(tripId), dateStr, c.env, true);
    }
    return c.json({ success: true, message: 'Weather data synced' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default trips;