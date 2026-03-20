import { Hono } from 'hono';
import { Env } from '../worker';
import { checkTripAccess, getWeatherForDate } from '../utils/workerUtils';

const trips = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// 1. 獲取行程列表
trips.get('/', async (c) => {
  try {
    const user = c.get('user');
    let query = 'SELECT id, title, cover_image_url, start_date, end_date, default_city_id, is_public FROM Trips WHERE is_public = 1';
    const params: any[] = [];
    if (user) {
      if (user.role === 'Admin') query = 'SELECT id, title, cover_image_url, start_date, end_date, default_city_id, is_public FROM Trips';
      else { query += ' OR id IN (SELECT trip_id FROM TripMembers WHERE user_id = ?)'; params.push(user.id); }
    }
    query += ' ORDER BY start_date DESC';
    const { results: tripsData } = await c.env.DB.prepare(query).bind(...params).all();
    if (tripsData.length === 0) return c.json([]);
    const tripIds = tripsData.map((t: any) => t.id).join(',');
    const { results: allMembers } = await c.env.DB.prepare(`SELECT trip_id, user_id, role FROM TripMembers WHERE trip_id IN (${tripIds})`).all();
    return c.json(tripsData.map((trip: any) => ({ ...trip, members: allMembers.filter((m: any) => m.trip_id === trip.id) })));
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// 2. 獲取特定 ID 行程資料
trips.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const canView = await checkTripAccess(c, Number(id), 'view');
    if (!canView) return c.json({ error: 'Unauthorized' }, 403);
    const { results } = await c.env.DB.prepare('SELECT * FROM Trips WHERE id = ?').bind(id).all();
    if (results.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const { results: members } = await c.env.DB.prepare('SELECT user_id, role FROM TripMembers WHERE trip_id = ?').bind(id).all();
    return c.json({ ...results[0], members });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// 3. 🚨 補回：AI 同步計算路由 (POST /api/trips/:id/sync)
trips.post('/:id/sync', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const { results: tripsInfo } = await c.env.DB.prepare(`
      SELECT t.*, c.name as city_name, c.country as country_name 
      FROM Trips t 
      LEFT JOIN Cities c ON t.default_city_id = c.id 
      WHERE t.id = ?
    `).bind(tripId).all();
    
    if (tripsInfo.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = tripsInfo[0] as any;

    // A. 處理每日天氣同步
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      // 強制重新整理當前行程的天氣快取
      await getWeatherForDate(Number(tripId), dateStr, c.env, true);
    }

    // B. 未來預留：智慧地點營業時間同步 (Google Places ID Sync)
    // 這裡我們會在這裡遍歷 Itineraries 中帶有 google_place_id 的項目進行校對

    return c.json({ 
      success: true, 
      message: 'Sync completed', 
      timestamp: Date.now() 
    });
  } catch (error: any) { 
    return c.json({ error: error.message }, 500); 
  }
});

// 4. 行程天氣查詢
trips.get('/:id/weather', async (c) => {
  const id = c.req.param('id');
  const date = c.req.query('date');
  try {
    if (date) {
      const weatherData = await getWeatherForDate(Number(id), date, c.env);
      return weatherData ? c.json(weatherData) : c.json({ message: 'No weather data' }, 404);
    }
    return c.json({ error: 'Date is required' }, 400);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// 5. 更新行程設定
trips.put('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  if (!user || user.role !== 'Admin') return c.json({ error: 'Unauthorized' }, 403);
  const body = await c.req.json();
  try {
    await c.env.DB.prepare(`
      UPDATE Trips SET title = ?, start_date = ?, end_date = ?, default_city_id = ?, 
      cover_image_url = ?, currencies = ?, is_public = ?, updated_at = ? WHERE id = ?
    `).bind(body.title, body.start_date, body.end_date, body.default_city_id, 
      body.cover_image_url, JSON.stringify(body.currencies), body.is_public ? 1 : 0, Date.now(), id).run();
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// 6. 刪除行程
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
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// 7. 獲取活動項目
trips.get('/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  const { results } = await c.env.DB.prepare(`SELECT i.*, c.name as city_name FROM Itineraries i LEFT JOIN Cities c ON i.city_id = c.id WHERE i.trip_id = ? ORDER BY date, start_time`).bind(tripId).all();
  return c.json(results.map((item: any) => ({ ...item, tags: item.tags ? JSON.parse(item.tags) : [] })));
});

// 8. 成員管理
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
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

export default trips;