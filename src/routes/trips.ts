import { Hono } from 'hono';
import { Env } from '../worker';
import { checkTripAccess, getWeatherForDate, syncPlaceDetails, optimizeDailyItinerary } from '../utils/workerUtils';

const trips = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// ==========================================
// 1. Trips (主行程 CRUD)
// ==========================================

// 獲取行程列表 (包含權限過濾)
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
    const { results: allMembers } = await c.env.DB.prepare(`SELECT trip_id, user_id as id, role FROM TripMembers WHERE trip_id IN (${tripIds})`).all();
    
    return c.json(tripsData.map((trip: any) => ({ 
      ...trip, 
      members: allMembers.filter((m: any) => m.trip_id === trip.id) 
    })));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 建立新行程
trips.post('/', async (c) => {
  const body = await c.req.json();
  const { title, start_date, end_date, default_city_id, cover_image_url, currencies } = body;
  try {
    const { meta } = await c.env.DB.prepare(`
      INSERT INTO Trips (title, start_date, end_date, default_city_id, cover_image_url, currencies, is_public, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      title, start_date, end_date, default_city_id, cover_image_url, 
      JSON.stringify(currencies || []), 0, Date.now(), Date.now()
    ).run();
    return c.json({ id: meta.last_row_id });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 獲取特定 ID 行程資料 (含幣別 JSON 解析)
trips.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const canView = await checkTripAccess(c, Number(id), 'view');
    if (!canView) return c.json({ error: 'Unauthorized' }, 403);
    
    const { results } = await c.env.DB.prepare('SELECT * FROM Trips WHERE id = ?').bind(id).all();
    if (results.length === 0) return c.json({ error: 'Trip not found' }, 404);
    
    const trip = results[0] as any;
    const { results: members } = await c.env.DB.prepare('SELECT user_id as id, role FROM TripMembers WHERE trip_id = ?').bind(id).all();
    
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
  const user = c.get('user');
  if (!user || user.role !== 'Admin') return c.json({ error: 'Unauthorized' }, 403);
  
  const body = await c.req.json();
  try {
    await c.env.DB.prepare(`
      UPDATE Trips SET title = ?, start_date = ?, end_date = ?, default_city_id = ?, cover_image_url = ?, currencies = ?, is_public = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      body.title, body.start_date, body.end_date, body.default_city_id, body.cover_image_url, 
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
  const user = c.get('user');
  if (!user || user.role !== 'Admin') return c.json({ error: 'Unauthorized' }, 403);
  
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM Itineraries WHERE trip_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM Expenses WHERE trip_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM TripMembers WHERE trip_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM Bookings WHERE trip_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM Trips WHERE id = ?').bind(id)
    ]);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 💡 天氣查詢路由 (之前漏掉的部分)
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

// AI 同步、地點更新與智慧排序
trips.post('/:id/sync', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const { results: tripsInfo } = await c.env.DB.prepare(`SELECT * FROM Trips WHERE id = ?`).bind(tripId).all();
    if (tripsInfo.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = tripsInfo[0] as any;

    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    
    // 每一天依序處理
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      
      // 1. 更新天氣
      await getWeatherForDate(Number(tripId), dateStr, c.env, true);
      
      // 2. 💡 啟動 AI 智慧排序 (固樁、聚類、交通緩衝)
      await optimizeDailyItinerary(c.env, Number(tripId), dateStr);
    }

    // 3. 更新 Google 地點詳細資料與營業時間檢查
    await syncPlaceDetails(c.env, Number(tripId));

    return c.json({ success: true, message: 'AI Sync & Optimization completed' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ==========================================
// 2. Itineraries (行程活動項目 CRUD)
// ==========================================

// 取得行程列表 (含 tags 與 sub_items 解析)
trips.get('/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canView = await checkTripAccess(c, Number(tripId), 'view');
    if (!canView) return c.json({ error: 'Unauthorized' }, 403);

    const { results } = await c.env.DB.prepare(`
      SELECT * FROM Itineraries WHERE trip_id = ? ORDER BY date ASC, start_time ASC
    `).bind(tripId).all();

    return c.json(results.map((item: any) => ({ 
      ...item, 
      tags: item.tags ? JSON.parse(item.tags) : [],
      sub_items: item.sub_items ? JSON.parse(item.sub_items) : []
    })));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 建立新項目 (包含智慧排程欄位與照片)
trips.post('/:id/itineraries', async (c) => {
  try {
    const tripId = c.req.param('id');
    const body = await c.req.json();
    const tagsStr = Array.isArray(body.tags) ? JSON.stringify(body.tags) : '[]';

    // 💡 確保 SQL 指令有加入 stay_duration 和 time_preference
    await c.env.DB.prepare(
      `INSERT INTO Itineraries (trip_id, date, start_time, end_time, title, address, google_place_id, lat, lng, notes, icon, tags, sub_items, is_time_fixed, stay_duration, time_preference, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tripId, 
      body.date, 
      body.start_time, 
      body.end_time, 
      body.title, 
      body.address || '', 
      body.google_place_id || '', 
      body.lat || null, 
      body.lng || null, 
      body.notes || '', 
      body.icon || 'MapPin', 
      tagsStr, 
      body.sub_items || '[]', 
      body.is_time_fixed || 0,
      body.stay_duration || '60',        // 💡 寫入停留時間
      body.time_preference || 'anytime', // 💡 寫入時段偏好
      body.image_url || null
    ).run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 更新項目 (包含交通、智慧排程與照片)
trips.put('/:id/itineraries/:itemId', async (c) => {
  try {
    const itemId = c.req.param('itemId');
    const body = await c.req.json();
    const tagsStr = Array.isArray(body.tags) ? JSON.stringify(body.tags) : '[]';

    // 💡 確保 UPDATE 語法中加入 stay_duration 和 time_preference
    await c.env.DB.prepare(
      `UPDATE Itineraries SET date = ?, start_time = ?, end_time = ?, title = ?, address = ?, google_place_id = ?, lat = ?, lng = ?, notes = ?, icon = ?, tags = ?, sub_items = ?, is_time_fixed = ?, stay_duration = ?, time_preference = ?, next_transport_mode = ?, next_transport_time = ?, next_transport_auto_time = ?, image_url = ? WHERE id = ?`
    ).bind(
      body.date, 
      body.start_time, 
      body.end_time, 
      body.title, 
      body.address || '', 
      body.google_place_id || '', 
      body.lat || null, 
      body.lng || null, 
      body.notes || '', 
      body.icon || 'MapPin', 
      tagsStr, 
      body.sub_items || '[]', 
      body.is_time_fixed || 0,
      body.stay_duration || '60',         // 💡 更新停留時間
      body.time_preference || 'anytime',  // 💡 更新時段偏好
      body.next_transport_mode || '', 
      body.next_transport_time || '', 
      body.next_transport_auto_time || '', 
      body.image_url || null, 
      itemId
    ).run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 刪除行程項目
trips.delete('/:id/itineraries/:itemId', async (c) => {
  try {
    const itemId = c.req.param('itemId');
    await c.env.DB.prepare('DELETE FROM Itineraries WHERE id = ?').bind(itemId).run();
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ==========================================
// 3. Trip Members (成員管理)
// ==========================================

trips.get('/:id/members', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canView = await checkTripAccess(c, Number(tripId), 'view');
    if (!canView) return c.json({ error: 'Unauthorized' }, 403);

    const { results } = await c.env.DB.prepare(`
      SELECT u.id, tm.role, u.name, u.avatar_url 
      FROM TripMembers tm JOIN Users u ON tm.user_id = u.id WHERE tm.trip_id = ?
    `).bind(tripId).all();
    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

trips.put('/:id/members', async (c) => {
  const tripId = c.req.param('id');
  const user = c.get('user');
  if (!user || user.role !== 'Admin') return c.json({ error: 'Admins only' }, 403);
  const { user_ids } = await c.req.json();
  try {
    const statements = [c.env.DB.prepare('DELETE FROM TripMembers WHERE trip_id = ?').bind(tripId)];
    user_ids.forEach((uid: number) => {
      statements.push(c.env.DB.prepare('INSERT INTO TripMembers (trip_id, user_id, role) VALUES (?, ?, ?)').bind(tripId, uid, 'Member'));
    });
    await c.env.DB.batch(statements);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default trips;