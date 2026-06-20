import { Hono } from 'hono';
import { Env } from '../worker';
import { checkTripAccess } from '../utils/workerUtils';
import { getWeatherForDate } from '../utils/weather';
import { syncPlaceDetails } from '../utils/places';
import { optimizeDailyItinerary, geminiOptimizeDay } from '../utils/optimizer';
import { searchUnsplash } from '../utils/unsplash';
import { checkUserQuota, incrementUserQuota, getUserQuotaStatus } from '../utils/userQuota';

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

// 獲取特定行程的所有活動（含子活動）
trips.get('/:id/itineraries', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canView = await checkTripAccess(c, Number(tripId), 'view');
    if (!canView) return c.json({ error: 'Unauthorized' }, 403);

    const { results: items } = await c.env.DB.prepare(
      'SELECT * FROM Itineraries WHERE trip_id = ? ORDER BY date, COALESCE(display_order, 9999), start_time'
    ).bind(tripId).all();

    // Fetch all sub-items for these itineraries in one query
    const ids = (items as any[]).map(i => i.id);
    let subMap: Record<number, any[]> = {};
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const { results: subs } = await c.env.DB.prepare(
        `SELECT * FROM SubItemItineraries WHERE itinerary_id IN (${placeholders}) ORDER BY display_order, id`
      ).bind(...ids).all();
      for (const s of subs as any[]) {
        if (!subMap[s.itinerary_id]) subMap[s.itinerary_id] = [];
        subMap[s.itinerary_id].push({ ...s, tags: s.tags ? s.tags : '[]' });
      }
    }

    return c.json((items as any[]).map((item: any) => ({
      ...item,
      tags: item.tags ? JSON.parse(item.tags) : [],
      sub_items: subMap[item.id] || [],
    })));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 新增子活動
trips.post('/:id/itineraries/:itemId/sub-items', async (c) => {
  const tripId = c.req.param('id');
  const itineraryId = c.req.param('itemId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const body = await c.req.json().catch(() => ({}));
    const {
      title, address = '', lat = null, lng = null,
      start_time = '', end_time = '', duration = 0,
      notes = '', tags = '[]', display_order = 0, next_walk_mins = 0,
    } = body;
    if (!title) return c.json({ error: 'title is required' }, 400);

    const { meta } = await c.env.DB.prepare(`
      INSERT INTO SubItemItineraries (itinerary_id, title, address, lat, lng, start_time, end_time, duration, notes, tags, display_order, next_walk_mins)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(itineraryId, title, address, lat, lng, start_time, end_time, duration, notes,
        typeof tags === 'string' ? tags : JSON.stringify(tags), display_order, next_walk_mins).run();

    return c.json({ id: meta.last_row_id, success: true }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 更新子活動
trips.put('/:id/itineraries/:itemId/sub-items/:subId', async (c) => {
  const tripId = c.req.param('id');
  const itineraryId = c.req.param('itemId');
  const subId = c.req.param('subId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const body = await c.req.json().catch(() => ({}));
    const { title, address, lat, lng, start_time, end_time, duration, notes, tags, display_order, next_walk_mins } = body;

    await c.env.DB.prepare(`
      UPDATE SubItemItineraries SET
        title = ?, address = ?, lat = ?, lng = ?,
        start_time = ?, end_time = ?, duration = ?,
        notes = ?, tags = ?, display_order = ?, next_walk_mins = ?
      WHERE id = ? AND itinerary_id = ?
    `).bind(
      title ?? '', address ?? '', lat ?? null, lng ?? null,
      start_time ?? '', end_time ?? '', duration ?? 0,
      notes ?? '', typeof tags === 'string' ? tags : JSON.stringify(tags ?? []),
      display_order ?? 0, next_walk_mins ?? 0,
      subId, itineraryId
    ).run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 刪除子活動
trips.delete('/:id/itineraries/:itemId/sub-items/:subId', async (c) => {
  const tripId = c.req.param('id');
  const itineraryId = c.req.param('itemId');
  const subId = c.req.param('subId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    await c.env.DB.prepare(
      'DELETE FROM SubItemItineraries WHERE id = ? AND itinerary_id = ?'
    ).bind(subId, itineraryId).run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 批次更新子活動排序，並依序重算時間
trips.patch('/:id/itineraries/:itemId/sub-items/reorder', async (c) => {
  const tripId = c.req.param('id');
  const itineraryId = c.req.param('itemId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const body = await c.req.json().catch(() => ({}));
    const { items } = body as { items: { id: number; display_order: number }[] };
    if (!Array.isArray(items) || items.length === 0) {
      return c.json({ error: 'items[] is required' }, 400);
    }

    // Update display_order
    const orderStatements = items.map(({ id, display_order }) =>
      c.env.DB.prepare('UPDATE SubItemItineraries SET display_order = ? WHERE id = ? AND itinerary_id = ?')
        .bind(display_order, id, itineraryId)
    );
    await c.env.DB.batch(orderStatements);

    // Recalculate sub-item times if parent has a start_time
    const { results: parents } = await c.env.DB.prepare(
      'SELECT start_time FROM Itineraries WHERE id = ? AND trip_id = ?'
    ).bind(itineraryId, tripId).all();
    const parent = (parents as any[])[0];

    if (parent?.start_time) {
      const { results: subs } = await c.env.DB.prepare(
        'SELECT * FROM SubItemItineraries WHERE itinerary_id = ? ORDER BY display_order, id'
      ).bind(itineraryId).all();

      const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
      const toTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

      let cursor = toMins(parent.start_time);
      const timeStatements: any[] = [];
      for (const sub of subs as any[]) {
        const dur = (sub as any).duration || 0;
        const walk = (sub as any).next_walk_mins || 0;
        if (dur > 0) {
          timeStatements.push(
            c.env.DB.prepare('UPDATE SubItemItineraries SET start_time = ?, end_time = ? WHERE id = ?')
              .bind(toTime(cursor), toTime(cursor + dur), (sub as any).id)
          );
        }
        cursor += dur + walk;
      }
      if (timeStatements.length > 0) await c.env.DB.batch(timeStatements);
    }

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// 一次性資料遷移：將 sub_items JSON → SubItemItineraries table
trips.post('/:id/migrate-sub-items', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const { results: items } = await c.env.DB.prepare(
      "SELECT id, sub_items FROM Itineraries WHERE trip_id = ? AND sub_items != '[]' AND sub_items != '' AND sub_items IS NOT NULL"
    ).bind(tripId).all();

    const statements: any[] = [];
    let migrated = 0;

    for (const item of items as any[]) {
      let subs: any[] = [];
      try { subs = JSON.parse(item.sub_items); } catch { continue; }
      if (!Array.isArray(subs) || subs.length === 0) continue;

      // Skip if already migrated (check if any sub-items exist for this itinerary)
      const { results: existing } = await c.env.DB.prepare(
        'SELECT id FROM SubItemItineraries WHERE itinerary_id = ? LIMIT 1'
      ).bind(item.id).all();
      if ((existing as any[]).length > 0) continue;

      subs.forEach((sub: any, idx: number) => {
        statements.push(c.env.DB.prepare(`
          INSERT INTO SubItemItineraries (itinerary_id, title, address, lat, lng, start_time, end_time, duration, notes, tags, display_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          item.id, sub.title || '', sub.address || '', sub.lat ?? null, sub.lng ?? null,
          sub.start_time || '', sub.end_time || '', sub.duration || 0,
          sub.notes || '', typeof sub.tags === 'string' ? sub.tags : JSON.stringify(sub.tags ?? []),
          idx
        ));
        migrated++;
      });
    }

    if (statements.length > 0) await c.env.DB.batch(statements);
    return c.json({ success: true, migrated });
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
      google_place_id = '', lat = null, lng = null, arrival_lat = null, arrival_lng = null,
      rating = null, reviews_count = null, opening_hours = '',
      place_website = '', place_phone = '', review_summary = null, place_status = null,
      // Default to AUTO mode — optimizer will pick the fastest transport when smart scheduling runs
      next_transport_mode = 'AUTO', next_transport_time = 'auto', next_transport_auto_time = '',
      next_transport_resolved_mode = '', next_transport_haversine_time = '',
      next_transport_custom_label = '',
      sub_items = '[]', is_time_fixed = 0, stay_duration = '60',
      type = 'GENERAL', related_id = null, city_id = null,
    } = body;

    if (!title || !date) {
      return c.json({ error: 'title and date are required' }, 400);
    }

    // For fixed-time items, compute display_order so insertion lands in chronological position
    let displayOrder: number | null = null;
    if (is_time_fixed && start_time) {
      const { results: existing } = await c.env.DB.prepare(
        `SELECT id, start_time FROM Itineraries WHERE trip_id = ? AND date = ? ORDER BY COALESCE(start_time, '99:99'), COALESCE(display_order, 9999)`
      ).bind(tripId, date).all() as { results: { id: number; start_time: string }[] };

      let insertIdx = existing.length;
      for (let i = 0; i < existing.length; i++) {
        if ((existing[i].start_time || '') > start_time) { insertIdx = i; break; }
      }
      // Shift items at and after insertion point
      for (let i = insertIdx; i < existing.length; i++) {
        await c.env.DB.prepare(`UPDATE Itineraries SET display_order = ? WHERE id = ?`)
          .bind(i + 2, existing[i].id).run();
      }
      // Assign explicit order to items before insertion point (normalize)
      for (let i = 0; i < insertIdx; i++) {
        await c.env.DB.prepare(`UPDATE Itineraries SET display_order = ? WHERE id = ?`)
          .bind(i + 1, existing[i].id).run();
      }
      displayOrder = insertIdx + 1;
    }

    const { meta } = await c.env.DB.prepare(`
      INSERT INTO Itineraries (
        trip_id, city_id, date, start_time, end_time, title, address,
        image_url, notes, tags, icon, sub_items, type, related_id,
        is_time_fixed, stay_duration, display_order,
        next_transport_mode, next_transport_time, next_transport_auto_time,
        next_transport_resolved_mode, next_transport_haversine_time, next_transport_custom_label,
        lat, lng, arrival_lat, arrival_lng, google_place_id, rating, reviews_count, opening_hours,
        place_website, place_phone, review_summary, place_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tripId, city_id, date, start_time, end_time, title, address,
      image_url, notes, JSON.stringify(tags), icon, sub_items, type, related_id,
      is_time_fixed ? 1 : 0, String(stay_duration), displayOrder,
      next_transport_mode, next_transport_time, String(next_transport_auto_time),
      next_transport_resolved_mode, next_transport_haversine_time, next_transport_custom_label,
      lat, lng, arrival_lat, arrival_lng, google_place_id, rating, reviews_count, opening_hours,
      place_website, place_phone, review_summary ?? null, place_status ?? null
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
      image_url, google_place_id, lat, lng, arrival_lat, arrival_lng, rating, reviews_count,
      opening_hours, place_website, place_phone, review_summary, place_status, sync_conflict_warning,
      next_transport_mode, next_transport_time, next_transport_auto_time,
      next_transport_resolved_mode, next_transport_haversine_time, next_transport_custom_label,
      sub_items, is_time_fixed, stay_duration, type, related_id, city_id,
    } = body;

    await c.env.DB.prepare(`
      UPDATE Itineraries SET
        city_id = ?, date = ?, start_time = ?, end_time = ?, title = ?,
        address = ?, image_url = ?, notes = ?, tags = ?, icon = ?,
        sub_items = ?, type = ?, related_id = ?,
        is_time_fixed = ?, stay_duration = ?,
        next_transport_mode = ?, next_transport_time = ?, next_transport_auto_time = ?,
        next_transport_resolved_mode = ?, next_transport_haversine_time = ?, next_transport_custom_label = ?,
        lat = ?, lng = ?, arrival_lat = ?, arrival_lng = ?, google_place_id = ?, rating = ?, reviews_count = ?,
        opening_hours = ?, place_website = ?, place_phone = ?,
        review_summary = ?, place_status = ?, sync_conflict_warning = ?
      WHERE id = ? AND trip_id = ?
    `).bind(
      city_id ?? null, date, start_time ?? '', end_time ?? '', title,
      address ?? '', image_url ?? '', notes ?? '',
      JSON.stringify(tags ?? []), icon ?? 'MapPin',
      typeof sub_items === 'string' ? sub_items : JSON.stringify(sub_items ?? []), type ?? 'GENERAL', related_id ?? null,
      is_time_fixed ? 1 : 0, String(stay_duration ?? '60'),
      next_transport_mode ?? '', next_transport_time ?? '', String(next_transport_auto_time ?? ''),
      next_transport_resolved_mode ?? '', String(next_transport_haversine_time ?? ''), next_transport_custom_label ?? '',
      lat ?? null, lng ?? null, arrival_lat ?? null, arrival_lng ?? null, google_place_id ?? '', rating ?? null, reviews_count ?? null,
      opening_hours ?? '', place_website ?? '', place_phone ?? '',
      review_summary ?? null, place_status ?? null, sync_conflict_warning ?? null,
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
// ==========================================
// 6. User quota status
// ==========================================
trips.get('/:id/quota-status', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canView = await checkTripAccess(c, Number(tripId), 'view');
    if (!canView) return c.json({ error: 'Unauthorized' }, 403);

    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const isAdmin = user.role === 'Admin';
    if (isAdmin) {
      return c.json({
        weather: { count: 0, limit: null },
        places: { count: 0, limit: null },
        optimize: { count: 0, limit: null },
        isAdmin: true,
      });
    }

    const status = await getUserQuotaStatus(c.env, user.id);
    return c.json({ ...status, isAdmin: false });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ==========================================
// 7. Split compute endpoints with 1-hour cache and quota
// ==========================================
trips.post('/:id/update-weather', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Quota check (Admin exempt)
    if (user.role !== 'Admin') {
      const { ok, remaining } = await checkUserQuota(c.env, user.id, 'weather');
      if (!ok) return c.json({ error: 'QUOTA_EXCEEDED', remaining: 0 }, 429);
    }

    // 1-hour KV cache check
    const cacheKey = `update_cache:${tripId}:weather`;
    const cached = await c.env.KV.get(cacheKey);
    if (cached !== null) {
      return c.json({ cached: true, message: '1小時內已是最新，無需重新更新' });
    }

    const { results: tripInfo } = await c.env.DB.prepare(
      'SELECT start_date, end_date FROM Trips WHERE id = ?'
    ).bind(tripId).all();
    if (tripInfo.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = tripInfo[0] as any;

    const log: string[] = [];
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      log.push(`[weather] fetching ${dateStr}...`);
      await getWeatherForDate(Number(tripId), dateStr, c.env, true);
      log.push(`[weather] ${dateStr} done`);
    }

    // Increment quota (Admin exempt)
    if (user.role !== 'Admin') {
      await incrementUserQuota(c.env, user.id, 'weather');
    }

    // Set 1-hour cache
    await c.env.KV.put(cacheKey, '1', { expirationTtl: 3600 });

    log.forEach(l => console.log('[update-weather]', l));
    return c.json({ success: true, message: '天氣資料已更新', cached: false, log });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

trips.post('/:id/update-places', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Quota check (Admin exempt)
    if (user.role !== 'Admin') {
      const { ok, remaining } = await checkUserQuota(c.env, user.id, 'places');
      if (!ok) return c.json({ error: 'QUOTA_EXCEEDED', remaining: 0 }, 429);
    }

    // 1-hour KV cache check
    const cacheKey = `update_cache:${tripId}:places`;
    const cached = await c.env.KV.get(cacheKey);
    if (cached !== null) {
      return c.json({ cached: true, message: '1小時內已是最新，無需重新更新' });
    }

    await syncPlaceDetails(c.env, Number(tripId));

    // Increment quota (Admin exempt)
    if (user.role !== 'Admin') {
      await incrementUserQuota(c.env, user.id, 'places');
    }

    // Set 1-hour cache
    await c.env.KV.put(cacheKey, '1', { expirationTtl: 3600 });

    return c.json({ success: true, message: '景點資訊已更新', cached: false });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

trips.post('/:id/optimize', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Quota check (Admin exempt) — no cache for optimize
    if (user.role !== 'Admin') {
      const { ok, remaining } = await checkUserQuota(c.env, user.id, 'optimize');
      if (!ok) return c.json({ error: 'QUOTA_EXCEEDED', remaining: 0 }, 429);
    }

    const { results: tripInfo } = await c.env.DB.prepare(
      'SELECT start_date, end_date FROM Trips WHERE id = ?'
    ).bind(tripId).all();
    if (tripInfo.length === 0) return c.json({ error: 'Trip not found' }, 404);
    const trip = tripInfo[0] as any;

    // Pre-check: only block 'auto' mode items that have no coordinates
    // (Google Maps API can't compute routes without lat/lng).
    // Items with no transport set are handled by haversine fallback in the optimizer.
    const { results: missingRows } = await c.env.DB.prepare(`
      SELECT DISTINCT i1.id, i1.title, i1.date FROM Itineraries i1
      WHERE i1.trip_id = ?
        AND i1.is_time_fixed = 0
        AND i1.next_transport_time = 'auto'
        AND (i1.lat IS NULL OR i1.lng IS NULL)
        AND EXISTS (
          SELECT 1 FROM Itineraries i2
          WHERE i2.trip_id = i1.trip_id AND i2.date = i1.date AND i2.id != i1.id
            AND i2.is_time_fixed = 0
        )
      ORDER BY i1.date, i1.id
    `).bind(tripId).all();

    if (missingRows.length > 0) {
      const items = missingRows.map((r: any) => r.title || `#${r.id}`);
      return c.json({ success: false, error: 'MISSING_TRANSPORT', items }, 422);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const optimizeLog: string[] = [];
    let geminiDaysUsed = 0;
    const geminiErrors: string[] = [];
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      if (dateStr < todayStr) { optimizeLog.push(`[skip] ${dateStr} is in the past`); continue; }
      let dayLogs: string[];
      if (c.env.GEMINI_API_KEY) {
        try {
          dayLogs = await geminiOptimizeDay(c.env, Number(tripId), dateStr);
          geminiDaysUsed++;
        } catch (e: any) {
          const errMsg = e?.message || 'Unknown';
          optimizeLog.push(`[gemini-fallback] ${dateStr}: ${errMsg}`);
          geminiErrors.push(`${dateStr}: ${errMsg}`);
          dayLogs = await optimizeDailyItinerary(c.env, Number(tripId), dateStr);
        }
      } else {
        dayLogs = await optimizeDailyItinerary(c.env, Number(tripId), dateStr);
      }
      optimizeLog.push(...dayLogs);
    }

    const { results: unplacedRows } = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM Itineraries WHERE trip_id = ? AND sync_conflict_warning LIKE '%無法插入%'`
    ).bind(tripId).all();
    const unplacedCount = (unplacedRows[0] as any)?.count ?? 0;

    const { results: conflictRows } = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT i1.id) as count
      FROM Itineraries i1
      INNER JOIN Itineraries i2 ON i1.trip_id = i2.trip_id
        AND i1.date = i2.date AND i1.id != i2.id
      WHERE i1.trip_id = ?
        AND i1.start_time != '' AND i1.end_time != ''
        AND i2.start_time != '' AND i2.end_time != ''
        AND i1.end_time > i2.start_time
        AND i1.start_time < i2.end_time
    `).bind(tripId).all();
    const conflictCount = (conflictRows[0] as any)?.count ?? 0;

    const { results: missingTransportRows } = await c.env.DB.prepare(`
      SELECT DISTINCT i1.date
      FROM Itineraries i1
      WHERE i1.trip_id = ?
        AND i1.start_time IS NOT NULL AND i1.start_time != ''
        AND (i1.next_transport_mode IS NULL OR i1.next_transport_mode = '')
        AND EXISTS (
          SELECT 1 FROM Itineraries i2
          WHERE i2.trip_id = i1.trip_id
            AND i2.date = i1.date
            AND i2.id != i1.id
            AND i2.start_time > i1.start_time
        )
      ORDER BY i1.date
    `).bind(tripId).all();
    const missingTransportDates = missingTransportRows.map((r: any) => r.date as string);

    // Increment quota after successful run (Admin exempt)
    if (user.role !== 'Admin') {
      await incrementUserQuota(c.env, user.id, 'optimize');
    }

    optimizeLog.forEach(l => console.log('[optimize]', l));
    return c.json({ success: true, message: 'Itinerary Optimized', unplacedCount, conflictCount, missingTransportDates, log: optimizeLog, geminiDaysUsed, geminiErrors });
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

    const computeLog: string[] = [];

    computeLog.push('[places] syncing place details...');
    await syncPlaceDetails(c.env, Number(tripId));
    computeLog.push('[places] done');

    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      computeLog.push(`[weather] fetching ${dateStr}...`);
      await getWeatherForDate(Number(tripId), dateStr, c.env, true);
      computeLog.push(`[weather] ${dateStr} done`);
    }
    computeLog.forEach(l => console.log('[compute]', l));
    return c.json({ success: true, message: '資訊已更新', log: computeLog });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ==========================================
// 8. 行程排序 (Reorder)
// ==========================================

// 批次更新 display_order，清空非固定行程時間，觸發 optimizer
trips.patch('/:id/itineraries/reorder', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const body = await c.req.json().catch(() => ({}));
    const { date, items } = body as { date: string; items: { id: number; display_order: number }[] };
    if (!date || !Array.isArray(items) || items.length === 0) {
      return c.json({ error: 'date and items[] are required' }, 400);
    }

    // Fetch current item states to know which are non-fixed
    const ids = items.map(i => i.id);
    const placeholders = ids.map(() => '?').join(',');
    const { results: currentItems } = await c.env.DB.prepare(
      `SELECT id, is_time_fixed, next_transport_mode FROM Itineraries WHERE id IN (${placeholders}) AND trip_id = ?`
    ).bind(...ids, tripId).all() as { results: { id: number; is_time_fixed: number; next_transport_mode: string }[] };

    // Fetch daily default transport
    const { results: daySettings } = await c.env.DB.prepare(
      'SELECT default_transport_mode FROM TripDaySettings WHERE trip_id = ? AND date = ?'
    ).bind(tripId, date).all();
    const defaultTransport = (daySettings[0] as any)?.default_transport_mode || 'AUTO';

    const currentMap = new Map(currentItems.map((it: any) => [it.id, it]));

    const statements: any[] = [];
    for (const { id, display_order } of items) {
      const current = currentMap.get(id);
      if (!current) continue;
      if (current.is_time_fixed) {
        // Fixed: only update display_order, keep times
        statements.push(
          c.env.DB.prepare('UPDATE Itineraries SET display_order = ? WHERE id = ? AND trip_id = ?')
            .bind(display_order, id, tripId)
        );
      } else {
        // Non-fixed: update display_order, clear times and resolved transport
        const transportMode = current.next_transport_mode || defaultTransport;
        statements.push(
          c.env.DB.prepare(`UPDATE Itineraries SET
            display_order = ?, start_time = '', end_time = '',
            next_transport_resolved_mode = '', next_transport_auto_time = '',
            next_transport_mode = ?, sync_conflict_warning = NULL
            WHERE id = ? AND trip_id = ?`)
            .bind(display_order, transportMode, id, tripId)
        );
      }
    }

    if (statements.length > 0) await c.env.DB.batch(statements);

    // Trigger optimizer for this date
    const dayLogs = await optimizeDailyItinerary(c.env, Number(tripId), date);
    dayLogs.forEach(l => console.log('[reorder]', l));

    return c.json({ success: true });
  } catch (error: any) {
    console.error('[reorder]', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==========================================
// 9. 每日設定 (Day Settings)
// ==========================================

trips.get('/:id/days/:date/settings', async (c) => {
  const tripId = c.req.param('id');
  const date = c.req.param('date');
  try {
    const canView = await checkTripAccess(c, Number(tripId), 'view');
    if (!canView) return c.json({ error: 'Unauthorized' }, 403);

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM TripDaySettings WHERE trip_id = ? AND date = ?'
    ).bind(tripId, date).all();

    return c.json(results[0] ?? { trip_id: Number(tripId), date, default_transport_mode: 'AUTO' });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

trips.put('/:id/days/:date/settings', async (c) => {
  const tripId = c.req.param('id');
  const date = c.req.param('date');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const body = await c.req.json().catch(() => ({}));
    const { default_transport_mode = 'AUTO' } = body;

    await c.env.DB.prepare(`
      INSERT INTO TripDaySettings (trip_id, date, default_transport_mode)
      VALUES (?, ?, ?)
      ON CONFLICT(trip_id, date) DO UPDATE SET default_transport_mode = excluded.default_transport_mode
    `).bind(tripId, date, default_transport_mode).run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ==========================================
// 10. 備案 (Backup Items)
// ==========================================

// 新增備案
trips.post('/:id/itineraries/:itemId/backups', async (c) => {
  const tripId = c.req.param('id');
  const itemId = c.req.param('itemId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    // Verify the parent item exists and belongs to this trip
    const { results: parentItems } = await c.env.DB.prepare(
      'SELECT id, date FROM Itineraries WHERE id = ? AND trip_id = ? AND backup_for_id IS NULL'
    ).bind(itemId, tripId).all();
    if (!parentItems.length) return c.json({ error: 'Parent item not found' }, 404);
    const parent = parentItems[0] as { id: number; date: string };

    const body = await c.req.json().catch(() => ({}));
    const {
      title, address = '', icon = '', lat, lng, google_place_id = '',
      rating, reviews_count, opening_hours, place_website, place_phone,
      place_status, review_summary, image_url = '', notes = '',
    } = body;

    if (!title) return c.json({ error: 'title is required' }, 400);

    const { meta } = await c.env.DB.prepare(`
      INSERT INTO Itineraries (
        trip_id, date, title, address, icon, lat, lng, google_place_id,
        rating, reviews_count, opening_hours, place_website, place_phone,
        place_status, review_summary, image_url, notes,
        backup_for_id, type, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GENERAL', '[]')
    `).bind(
      tripId, parent.date, title, address, icon,
      lat ?? null, lng ?? null, google_place_id,
      rating ?? null, reviews_count ?? null, opening_hours ?? null,
      place_website ?? null, place_phone ?? null,
      place_status ?? null, review_summary ?? null,
      image_url, notes,
      Number(itemId),
    ).run();

    const newId = meta.last_row_id;
    const { results } = await c.env.DB.prepare('SELECT * FROM Itineraries WHERE id = ?').bind(newId).all();
    return c.json(results[0], 201);
  } catch (error: any) {
    console.error('[backup post]', error);
    return c.json({ error: error.message }, 500);
  }
});

// 切換主備案（backup ↔ primary swap）
trips.patch('/:id/itineraries/:itemId/swap-backup/:backupId', async (c) => {
  const tripId = c.req.param('id');
  const itemId = c.req.param('itemId');
  const backupId = c.req.param('backupId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    // Verify both items exist and belong to this trip
    const { results: items } = await c.env.DB.prepare(
      `SELECT id, date, backup_for_id FROM Itineraries WHERE id IN (?, ?) AND trip_id = ?`
    ).bind(itemId, backupId, tripId).all() as { results: { id: number; date: string; backup_for_id: number | null }[] };

    if (items.length !== 2) return c.json({ error: 'Items not found' }, 404);
    const primary = items.find(i => i.id === Number(itemId));
    const backup  = items.find(i => i.id === Number(backupId));
    if (!primary || !backup) return c.json({ error: 'Items not found' }, 404);

    // Swap: backup becomes primary, primary becomes backup
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE Itineraries SET backup_for_id = NULL WHERE id = ?').bind(backupId),
      c.env.DB.prepare('UPDATE Itineraries SET backup_for_id = ? WHERE id = ?').bind(backupId, itemId),
      // Also reassign any other backups of the old primary to the new primary
      c.env.DB.prepare(
        'UPDATE Itineraries SET backup_for_id = ? WHERE backup_for_id = ? AND id != ?'
      ).bind(backupId, itemId, Number(backupId)),
    ]);

    return c.json({ success: true });
  } catch (error: any) {
    console.error('[swap-backup]', error);
    return c.json({ error: error.message }, 500);
  }
});

export default trips;