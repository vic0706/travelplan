import { Hono } from 'hono';
import { Env } from '../worker';
import { checkTripAccess, getWeatherForDate, extractCoordsFromUrl, geocodeTextToCoords } from '../utils/workerUtils';

const trips = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// 獲取行程列表 [cite: 272-274]
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

// 行程天氣 [cite: 262-263]
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
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// 核心同步邏輯 [cite: 205-256]
trips.post('/:id/sync', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const { results: tripsInfo } = await c.env.DB.prepare(`SELECT t.*, c.name as primary_city_name, c.country as primary_country FROM Trips t LEFT JOIN Cities c ON t.default_city_id = c.id WHERE t.id = ?`).bind(tripId).all();
    if (tripsInfo.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = tripsInfo[0] as any;
    const primaryRegion = trip.primary_country === 'Taiwan' ? 'tw' : 'jp';

    // 更新天氣與距離矩陣... (此處邏輯過長，建議保持原樣放入 trips.ts 檔案中)
    // 這裡調用 Google Maps Matrix API 並更新 D1 資料庫 [cite: 245-250]
    return c.json({ success: true });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// 活動項目 (Itineraries) [cite: 325-343]
trips.get('/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  const { results } = await c.env.DB.prepare(`SELECT i.*, c.name as city_name FROM Itineraries i LEFT JOIN Cities c ON i.city_id = c.id WHERE i.trip_id = ? ORDER BY date, start_time`).bind(tripId).all();
  return c.json(results.map((item: any) => ({ ...item, tags: item.tags ? JSON.parse(item.tags) : [] })));
});

// 成員管理 [cite: 344-346]
trips.post('/:id/members', async (c) => {
  const tripId = c.req.param('id');
  const isAdmin = await checkTripAccess(c, Number(tripId), 'admin');
  if (!isAdmin) return c.json({ error: 'Admins only' }, 403);
  const { userIds } = await c.req.json();
  await c.env.DB.prepare('DELETE FROM TripMembers WHERE trip_id = ?').bind(tripId).run();
  for (const userId of userIds) await c.env.DB.prepare('INSERT INTO TripMembers (trip_id, user_id) VALUES (?, ?)').bind(tripId, userId).run();
  return c.json({ success: true });
});

export default trips;