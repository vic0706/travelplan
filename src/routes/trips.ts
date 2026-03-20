import { Hono } from 'hono';
import { Env } from '../worker';
import { checkTripAccess, getWeatherForDate, syncPlaceDetails } from '../utils/workerUtils';

const trips = new Hono<{ Bindings: Env; Variables: { user: any } }>();

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
    const { results: allMembers } = await c.env.DB.prepare(`SELECT trip_id, user_id, role FROM TripMembers WHERE trip_id IN (${tripIds})`).all();
    return c.json(tripsData.map((trip: any) => ({ ...trip, members: allMembers.filter((m: any) => m.trip_id === trip.id) })));
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
      title, start_date, end_date, default_city_id, cover_image_url, JSON.stringify(currencies), 0, Date.now(), Date.now()
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
    const { results: members } = await c.env.DB.prepare('SELECT user_id, role FROM TripMembers WHERE trip_id = ?').bind(id).all();
    return c.json({ ...results[0], members });
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
  const { title, start_date, end_date, default_city_id, cover_image_url, currencies, is_public } = body;
  try {
    await c.env.DB.prepare(`
      UPDATE Trips SET title = ?, start_date = ?, end_date = ?, default_city_id = ?, cover_image_url = ?, currencies = ?, is_public = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      title, start_date, end_date, default_city_id, cover_image_url, JSON.stringify(currencies), is_public ? 1 : 0, Date.now(), id
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

// AI 同步計算路由 (處理天氣與智慧地點防呆)
trips.post('/:id/sync', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);
    const { results: tripsInfo } = await c.env.DB.prepare(`
      SELECT t.*, c.name as city_name, c.country as country_name
      FROM Trips t LEFT JOIN Cities c ON t.default_city_id = c.id
      WHERE t.id = ?
    `).bind(tripId).all();
    if (tripsInfo.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = tripsInfo[0] as any;
    
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      await getWeatherForDate(Number(tripId), dateStr, c.env, true);
    }
    await syncPlaceDetails(c.env, Number(tripId));
    return c.json({ success: true, message: 'Sync completed', timestamp: Date.now() });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 行程天氣查詢
trips.get('/:id/weather', async (c) => {
  const id = c.req.param('id');
  const date = c.req.query('date');
  try {
    if (date) {
      const weatherData = await getWeatherForDate(Number(id), date, c.env);
      return weatherData ? c.json(weatherData) : c.json({ message: 'No weather data' }, 404);
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const cached = await c.env.KV.get(`weather:trip:${id}:${todayStr}`, 'json');
    return cached ? c.json(cached) : c.json({ message: 'Update soon' }, 202);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});


// ==========================================
// 💡 2. Itineraries (行程活動項目 CRUD)
// ==========================================

// 取得行程列表
trips.get('/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT i.*, c.name as city_name 
      FROM Itineraries i 
      LEFT JOIN Cities c ON i.city_id = c.id 
      WHERE i.trip_id = ? 
      ORDER BY date ASC, start_time ASC
    `).bind(tripId).all();
    return c.json(results.map((item: any) => ({ ...item, tags: item.tags ? JSON.parse(item.tags) : [] })));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 建立新行程項目 (POST)
trips.post('/:id/itineraries', async (c) => {
  try {
    const tripId = c.req.param('id');
    const body = await c.req.json();
    const tagsStr = Array.isArray(body.tags) ? JSON.stringify(body.tags) : JSON.stringify(body.tags ? body.tags.split(',').map((t: string) => t.trim()) : []);

    await c.env.DB.prepare(
      `INSERT INTO Itineraries 
      (trip_id, date, start_time, end_time, title, address, google_place_id, lat, lng, notes, icon, tags, sub_items, is_time_fixed) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tripId, body.date, body.start_time, body.end_time, body.title, 
      body.address || '', body.google_place_id || '', body.lat || null, body.lng || null, 
      body.notes || '', body.icon || 'MapPin', tagsStr, body.sub_items || '[]', body.is_time_fixed || 0
    ).run();

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Insert Itinerary Error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// 更新行程項目 (PUT)
trips.put('/:id/itineraries/:itemId', async (c) => {
  try {
    const itemId = c.req.param('itemId');
    const body = await c.req.json();
    const tagsStr = Array.isArray(body.tags) ? JSON.stringify(body.tags) : JSON.stringify(body.tags ? body.tags.split(',').map((t: string) => t.trim()) : []);

    await c.env.DB.prepare(
      `UPDATE Itineraries SET 
        date = ?, start_time = ?, end_time = ?, title = ?, address = ?, 
        google_place_id = ?, lat = ?, lng = ?, notes = ?, icon = ?, tags = ?, 
        sub_items = ?, is_time_fixed = ?, next_transport_mode = ?, next_transport_time = ?, next_transport_auto_time = ?
       WHERE id = ?`
    ).bind(
      body.date, body.start_time, body.end_time, body.title, body.address || '', 
      body.google_place_id || '', body.lat || null, body.lng || null, body.notes || '', 
      body.icon || 'MapPin', tagsStr, body.sub_items || '[]', body.is_time_fixed || 0,
      body.next_transport_mode || '', body.next_transport_time || '', body.next_transport_auto_time || '',
      itemId
    ).run();

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Update Itinerary Error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// 刪除行程項目 (DELETE)
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

trips.put('/:id/members', async (c) => {
  const tripId = c.req.param('id');
  const user = c.get('user');
  if (!user || user.role !== 'Admin') return c.json({ error: 'Admins only' }, 403);
  const { user_ids } = await c.req.json();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM TripMembers WHERE trip_id = ?').bind(tripId),
      ...user_ids.map((uid: number) => c.env.DB.prepare('INSERT INTO TripMembers (trip_id, user_id, role) VALUES (?, ?, ?)').bind(tripId, uid, 'Member'))
    ]);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default trips;