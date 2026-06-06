import { Hono } from 'hono';
import { Env } from '../worker';
import { checkTripAccess } from '../utils/workerUtils';
import { getWeatherForDate } from '../utils/weather';
import { syncPlaceDetails } from '../utils/places';
import { optimizeDailyItinerary } from '../utils/optimizer';
import { searchUnsplash } from '../utils/unsplash';

const trips = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// ==========================================
// 圖片自動抓取並存入 Supabase 的工具函式
// ==========================================
async function fetchAndStoreImage(query: string, env: Env): Promise<string | null> {
  try {
    const unsplashUrl = await searchUnsplash(query, env);
    if (!unsplashUrl) return null;

    const imgRes = await fetch(unsplashUrl);
    if (!imgRes.ok) return null;
    const imgBuffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';

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

    if (!uploadRes.ok) return null;

    const publicUrl = `${env.VITE_SUPABASE_URL}/storage/v1/object/public/${fullPath}`;
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

// 建立行程
trips.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { title, start_date, end_date, default_city_id, cover_image_url, currencies } = body;

    let finalCoverUrl = cover_image_url || null;

    if (!finalCoverUrl) {
      let imageQuery = title || 'travel destination';

      if (default_city_id) {
        const cityRow = await c.env.DB.prepare(
          'SELECT name, country FROM Cities WHERE id = ?'
        ).bind(default_city_id).first() as any;

        if (cityRow) {
          imageQuery = `${cityRow.name} ${cityRow.country} travel landscape`;
        }
      }

      finalCoverUrl = await fetchAndStoreImage(imageQuery, c.env);
    }

    const { meta } = await c.env.DB.prepare(`
      INSERT INTO Trips (title, start_date, end_date, default_city_id, cover_image_url, currencies, is_public, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      title, start_date, end_date, default_city_id,
      finalCoverUrl,
      JSON.stringify(currencies || []), 0, Date.now(), Date.now()
    ).run();

    const creator = c.get('user');
    if (creator) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO TripMembers (trip_id, user_id, role) VALUES (?, ?, ?)')
        .bind(meta.last_row_id, creator.id, 'admin').run();
    }

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

// ==========================================
// 2. Itineraries (行程活動 CRUD)
// ✅ 修正：補上前端呼叫但後端不存在的 endpoints，導致 404 的根本原因
// ==========================================

// 獲取特定行程的所有活動
trips.get('/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canView = await checkTripAccess(c, Number(tripId), 'view');
    if (!canView) return c.json({ error: 'Unauthorized' }, 403);

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM Itineraries WHERE trip_id = ? ORDER BY date, start_time'
    ).bind(tripId).all();

    return c.json(results.map((item: any) => ({
      ...item,
      tags: item.tags ? JSON.parse(item.tags) : [],
      sub_items: item.sub_items ?? '[]',
    })));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ✅ 新增活動 — 修正 404 的核心：這個 endpoint 之前完全缺失
trips.post('/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const body = await c.req.json().catch(() => ({}));
    const {
      title, date, address = '', start_time = '', end_time = '',
      notes = '', icon = 'MapPin', tags = [], image_url = '',
      google_place_id = '', lat = null, lng = null,
      rating = null, reviews_count = null, opening_hours = '',
      place_website = '', place_phone = '',
      next_transport_mode = '', next_transport_time = '', next_transport_auto_time = '',
      sub_items = '[]', is_time_fixed = 0, stay_duration = '60',
      type = 'GENERAL', related_id = null, city_id = null,
    } = body;

    if (!title || !date) {
      return c.json({ error: 'title and date are required' }, 400);
    }

    const { meta } = await c.env.DB.prepare(`
      INSERT INTO Itineraries (
        trip_id, city_id, date, start_time, end_time, title, address,
        image_url, notes, tags, icon, sub_items, type, related_id,
        is_time_fixed, stay_duration,
        next_transport_mode, next_transport_time, next_transport_auto_time,
        lat, lng, google_place_id, rating, reviews_count, opening_hours,
        place_website, place_phone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tripId, city_id, date, start_time, end_time, title, address,
      image_url, notes, JSON.stringify(tags), icon, sub_items, type, related_id,
      is_time_fixed ? 1 : 0, String(stay_duration),
      next_transport_mode, next_transport_time, String(next_transport_auto_time),
      lat, lng, google_place_id, rating, reviews_count, opening_hours,
      place_website, place_phone
    ).run();

    return c.json({ id: meta.last_row_id, success: true }, 201);
  } catch (error: any) {
    console.error('[Itineraries POST]', error);
    return c.json({ error: error.message }, 500);
  }
});

// 更新單一活動
trips.put('/:id/itineraries/:itineraryId', async (c) => {
  const tripId = c.req.param('id');
  const itineraryId = c.req.param('itineraryId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const body = await c.req.json().catch(() => ({}));
    const {
      title, date, address, start_time, end_time, notes, icon, tags,
      image_url, google_place_id, lat, lng, rating, reviews_count,
      opening_hours, place_website, place_phone, place_status, sync_conflict_warning,
      next_transport_mode, next_transport_time, next_transport_auto_time,
      sub_items, is_time_fixed, stay_duration, type, related_id, city_id,
    } = body;

    await c.env.DB.prepare(`
      UPDATE Itineraries SET
        city_id = ?, date = ?, start_time = ?, end_time = ?, title = ?,
        address = ?, image_url = ?, notes = ?, tags = ?, icon = ?,
        sub_items = ?, type = ?, related_id = ?,
        is_time_fixed = ?, stay_duration = ?,
        next_transport_mode = ?, next_transport_time = ?, next_transport_auto_time = ?,
        lat = ?, lng = ?, google_place_id = ?, rating = ?, reviews_count = ?,
        opening_hours = ?, place_website = ?, place_phone = ?,
        place_status = ?, sync_conflict_warning = ?
      WHERE id = ? AND trip_id = ?
    `).bind(
      city_id ?? null, date, start_time ?? '', end_time ?? '', title,
      address ?? '', image_url ?? '', notes ?? '',
      JSON.stringify(tags ?? []), icon ?? 'MapPin',
      sub_items ?? '[]', type ?? 'GENERAL', related_id ?? null,
      is_time_fixed ? 1 : 0, String(stay_duration ?? '60'),
      next_transport_mode ?? '', next_transport_time ?? '', String(next_transport_auto_time ?? ''),
      lat ?? null, lng ?? null, google_place_id ?? '', rating ?? null, reviews_count ?? null,
      opening_hours ?? '', place_website ?? '', place_phone ?? '',
      place_status ?? null, sync_conflict_warning ?? null,
      itineraryId, tripId
    ).run();

    return c.json({ success: true });
  } catch (error: any) {
    console.error('[Itineraries PUT]', error);
    return c.json({ error: error.message }, 500);
  }
});

// 刪除單一活動
trips.delete('/:id/itineraries/:itineraryId', async (c) => {
  const tripId = c.req.param('id');
  const itineraryId = c.req.param('itineraryId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    await c.env.DB.prepare(
      'DELETE FROM Itineraries WHERE id = ? AND trip_id = ?'
    ).bind(itineraryId, tripId).run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ==========================================
// 3. Members
// ==========================================
trips.get('/:id/members', async (c) => {
  const id = c.req.param('id');
  try {
    const canView = await checkTripAccess(c, Number(id), 'view');
    if (!canView) return c.json({ error: 'Unauthorized' }, 403);

    const { results } = await c.env.DB.prepare(`
      SELECT u.id, u.name, u.avatar_url, u.role, tm.role as trip_role
      FROM TripMembers tm JOIN Users u ON tm.user_id = u.id
      WHERE tm.trip_id = ?
    `).bind(id).all();

    return c.json(results);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

trips.put('/:id/members', async (c) => {
  const id = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(id), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const { user_ids } = await c.req.json();
    if (!Array.isArray(user_ids)) return c.json({ error: 'user_ids must be an array' }, 400);

    // Preserve existing admin roles when rebuilding member list
    const { results: adminMembers } = await c.env.DB.prepare(
      "SELECT user_id FROM TripMembers WHERE trip_id = ? AND role = 'admin'"
    ).bind(id).all();
    const adminIds = new Set(adminMembers.map((a: any) => a.user_id));

    const statements = [
      c.env.DB.prepare('DELETE FROM TripMembers WHERE trip_id = ?').bind(id),
      ...adminIds.size > 0
        ? [...adminIds].map((uid) =>
            c.env.DB.prepare('INSERT OR IGNORE INTO TripMembers (trip_id, user_id, role) VALUES (?, ?, ?)').bind(id, uid, 'admin')
          )
        : [],
      ...user_ids
        .filter((uid: number) => !adminIds.has(uid))
        .map((uid: number) =>
          c.env.DB.prepare('INSERT OR IGNORE INTO TripMembers (trip_id, user_id, role) VALUES (?, ?, ?)').bind(id, uid, 'Member')
        ),
    ];
    await c.env.DB.batch(statements);

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ==========================================
// 4. 天氣查詢
// ==========================================
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

// ==========================================
// 5. AI Optimization & Compute
// ==========================================
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

    const { results: unplacedRows } = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM Itineraries WHERE trip_id = ? AND sync_conflict_warning LIKE '%無法插入%'`
    ).bind(tripId).all();
    const unplacedCount = (unplacedRows[0] as any)?.count ?? 0;

    return c.json({ success: true, message: 'Itinerary Optimized', unplacedCount });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

trips.post('/:id/sync-places', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);
    await syncPlaceDetails(c.env, Number(tripId));
    return c.json({ success: true, message: '景點資訊已更新' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

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

    await syncPlaceDetails(c.env, Number(tripId));

    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      await getWeatherForDate(Number(tripId), dateStr, c.env, true);
    }
    return c.json({ success: true, message: '資訊已更新' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default trips;