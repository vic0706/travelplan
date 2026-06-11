import { Hono } from 'hono';
import { Env } from '../worker';

const bookings = new Hono<{ Bindings: Env }>();

// ── Helper: insert one generated itinerary item ──────────────────────────────
async function insertItinerary(db: any, tripId: string, item: {
  date: string; start_time: string; end_time: string;
  title: string; address: string; image_url: string; notes: string;
  icon: string; type: string; related_id: number; google_place_id?: string;
}, transportMode = '', transportTime = '') {
  await db.prepare(`
    INSERT INTO Itineraries (
      trip_id, city_id, date, start_time, end_time, title, address,
      image_url, notes, tags, icon, sub_items, type, related_id,
      is_time_fixed, stay_duration, next_transport_mode, next_transport_time,
      next_transport_auto_time, lat, lng, google_place_id, rating,
      reviews_count, opening_hours, place_website, place_phone
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, '[]', ?, '[]', ?, ?, 1, '0', ?, ?, '0', NULL, NULL, ?, NULL, NULL, NULL, NULL, NULL)
  `).bind(
    tripId, item.date, item.start_time, item.end_time,
    item.title, item.address, item.image_url, item.notes,
    item.icon, item.type, item.related_id,
    transportMode, transportTime, item.google_place_id || ''
  ).run();
}

// ── Helper: get most common next_transport_mode for this trip ────────────────
async function getMostCommonTransportMode(db: any, tripId: string): Promise<string> {
  try {
    const { results } = await db.prepare(
      `SELECT next_transport_mode, COUNT(*) as cnt FROM Itineraries
       WHERE trip_id = ? AND next_transport_mode != '' AND next_transport_mode IS NOT NULL
       GROUP BY next_transport_mode ORDER BY cnt DESC LIMIT 1`
    ).bind(tripId).all();
    // Default to DRIVING when the trip has no existing transport modes yet
    return (results[0] as any)?.next_transport_mode || 'DRIVING';
  } catch { return 'DRIVING'; }
}

// ── Helper: iterate dates between start and end (inclusive) ──────────────────
function iterateDates(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const end = new Date(endStr + 'T00:00:00Z');
  for (let d = new Date(startStr + 'T00:00:00Z'); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// ── Helper: subtract/add minutes from HH:MM string ──────────────────────────
function subtractMins(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = ((h * 60 + m - mins) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function addMins(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = ((h * 60 + m + mins) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ── Auto-generate itinerary items based on booking category ──────────────────
async function generateItineraryItems(db: any, tripId: string, bookingId: number, b: any, details: any, imageUrl: string) {
  const cat = b.category;
  const addr = b.start_location || '';
  const notes = b.order_id ? `Order ID: ${b.order_id}\n${b.notes || ''}`.trim() : (b.notes || '');
  const defaultMode = await getMostCommonTransportMode(db, tripId);
  const defaultTime = 'auto';

  if (cat === 'HOTEL') {
    const checkInTime  = b.start_time || '16:00';
    const checkOutTime = b.end_time   || '11:00';
    const dailyOut     = details.daily_start_time || '09:00';
    const dailyReturn  = details.daily_end_time   || '22:00';
    const dates = iterateDates(b.start_date, b.end_date);

    for (let i = 0; i < dates.length; i++) {
      const date    = dates[i];
      const isFirst = i === 0;
      const isLast  = i === dates.length - 1;

      const placeId = b.google_place_id || '';
      if (isFirst && isLast) {
        await insertItinerary(db, tripId, { date, start_time: checkInTime,  end_time: checkInTime,  title: `Check-in ${b.title}`,  address: addr, image_url: imageUrl, notes, icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId, google_place_id: placeId }, defaultMode, defaultTime);
        await insertItinerary(db, tripId, { date, start_time: checkOutTime, end_time: checkOutTime, title: `Check-out ${b.title}`, address: addr, image_url: imageUrl, notes, icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId, google_place_id: placeId }, defaultMode, defaultTime);
      } else if (isFirst) {
        await insertItinerary(db, tripId, { date, start_time: checkInTime, end_time: checkInTime, title: `Check-in ${b.title}`,  address: addr, image_url: imageUrl, notes, icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId, google_place_id: placeId }, defaultMode, defaultTime);
        await insertItinerary(db, tripId, { date, start_time: dailyReturn, end_time: dailyReturn, title: `返回 ${b.title}`,       address: addr, image_url: imageUrl, notes: '', icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId, google_place_id: placeId }, defaultMode, defaultTime);
      } else if (isLast) {
        await insertItinerary(db, tripId, { date, start_time: checkOutTime, end_time: checkOutTime, title: `Check-out ${b.title}`, address: addr, image_url: imageUrl, notes, icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId, google_place_id: placeId }, defaultMode, defaultTime);
      } else {
        await insertItinerary(db, tripId, { date, start_time: dailyOut,    end_time: dailyOut,    title: `出門（${b.title}）`, address: addr, image_url: imageUrl, notes: '', icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId, google_place_id: placeId }, defaultMode, defaultTime);
        await insertItinerary(db, tripId, { date, start_time: dailyReturn, end_time: dailyReturn, title: `返回 ${b.title}`,     address: addr, image_url: imageUrl, notes: '', icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId, google_place_id: placeId }, defaultMode, defaultTime);
      }
    }
    return;
  }

  if (cat === 'RENTAL' || cat === 'PRIVATE_TRANSFER') {
    const placeId = b.google_place_id || '';
    await insertItinerary(db, tripId, { date: b.start_date, start_time: b.start_time || '10:00', end_time: b.start_time || '10:00', title: `取車：${b.title}`, address: addr, image_url: imageUrl, notes, icon: 'Car', type: 'RENTAL', related_id: bookingId, google_place_id: placeId }, defaultMode, defaultTime);
    if (b.end_date && b.end_date !== b.start_date) {
      await insertItinerary(db, tripId, { date: b.end_date, start_time: b.end_time || '10:00', end_time: b.end_time || '10:00', title: `還車：${b.title}`, address: b.end_location || addr, image_url: imageUrl, notes, icon: 'Car', type: 'RENTAL', related_id: bookingId, google_place_id: placeId }, defaultMode, defaultTime);
    }
    return;
  }

  if (['FLIGHT', 'TRAIN', 'FERRY', 'BUS'].includes(cat)) {
    const depBuffer = details.dep_buffer ?? 60;
    const arrStay = details.arr_stay ?? 0;
    const icon = cat === 'FLIGHT' ? 'Plane' : cat === 'TRAIN' ? 'Train' : cat === 'FERRY' ? 'Ship' : 'Bus';
    const checkInAt = b.start_time ? subtractMins(b.start_time, depBuffer) : b.start_time || '';
    const endAt = b.end_time ? addMins(b.end_time, arrStay) : (b.start_time || '');
    const isCrossDay = b.start_date && b.end_date && b.start_date !== b.end_date;
    if (isCrossDay) {
      // 出發卡片（出發日）
      await insertItinerary(db, tripId, {
        date: b.start_date, start_time: checkInAt, end_time: b.start_time || checkInAt,
        title: `${b.title}（出發）`, address: b.start_location || addr,
        image_url: imageUrl, notes, icon, type: 'TRANSPORTATION', related_id: bookingId,
        google_place_id: b.google_place_id || '',
      }, defaultMode, defaultTime);
      // 抵達卡片（抵達日）
      await insertItinerary(db, tripId, {
        date: b.end_date, start_time: b.end_time || '', end_time: endAt,
        title: `${b.title}（抵達）`, address: b.end_location || addr,
        image_url: imageUrl, notes, icon, type: 'TRANSPORTATION', related_id: bookingId,
        google_place_id: b.google_place_id || '',
      }, defaultMode, defaultTime);
    } else {
      await insertItinerary(db, tripId, {
        date: b.start_date, start_time: checkInAt, end_time: endAt,
        title: b.title, address: addr, image_url: imageUrl, notes, icon,
        type: 'TRANSPORTATION', related_id: bookingId, google_place_id: b.google_place_id || '',
      }, defaultMode, defaultTime);
    }
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

bookings.get('/', async (c) => {
  const tripId = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM Bookings WHERE trip_id = ? ORDER BY start_date, start_time').bind(tripId).all();
  return c.json(results.map((r: any) => ({ ...r, details: r.details ? JSON.parse(r.details) : {} })));
});

bookings.post('/', async (c) => {
  const tripId = c.req.param('id');
  const b = await c.req.json();
  const details = typeof b.details === 'string' ? JSON.parse(b.details) : (b.details || {});

  // Use provided image, or try KV-cached Google Places photo from autocomplete selection
  let imageUrl = b.image_url || '';
  if (!imageUrl && b.google_place_id) {
    try {
      const cached = await c.env.KV.get(`place_details_v2:${b.google_place_id}`, 'json') as any;
      if (cached?.actual_photo_url) imageUrl = cached.actual_photo_url;
    } catch {}
  }

  const { meta } = await c.env.DB.prepare(
    `INSERT INTO Bookings (trip_id, category, title, provider, order_id, start_date, start_time, end_date, end_time, start_location, end_location, notes, image_url, details, google_place_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    tripId, b.category || '', b.title || '', b.provider || '', b.order_id || '',
    b.start_date || '', b.start_time || '', b.end_date || '', b.end_time || '',
    b.start_location || '', b.end_location || '', b.notes || '', imageUrl,
    JSON.stringify(details), b.google_place_id || ''
  ).run();

  const bookingId = meta.last_row_id;

  // Auto-generate itinerary items for this booking
  try {
    await generateItineraryItems(c.env.DB, tripId, bookingId, b, details, imageUrl);
  } catch (err) {
    console.error('[bookings] generateItineraryItems failed:', err);
  }

  const created = await c.env.DB.prepare('SELECT * FROM Bookings WHERE id = ?').bind(bookingId).first() as any;
  return c.json({ ...created, details: created?.details ? JSON.parse(created.details) : {} });
});

bookings.put('/:bookingId', async (c) => {
  const tripId = c.req.param('id');
  const bookingId = c.req.param('bookingId');
  const b = await c.req.json();
  const details = typeof b.details === 'string' ? JSON.parse(b.details) : (b.details || {});

  await c.env.DB.prepare(
    `UPDATE Bookings SET category=?, title=?, provider=?, order_id=?, start_date=?, start_time=?, end_date=?, end_time=?, start_location=?, end_location=?, notes=?, image_url=?, details=?, google_place_id=?
     WHERE id=? AND trip_id=?`
  ).bind(
    b.category || '', b.title || '', b.provider || '', b.order_id || '',
    b.start_date || '', b.start_time || '', b.end_date || '', b.end_time || '',
    b.start_location || '', b.end_location || '', b.notes || '', b.image_url || '',
    JSON.stringify(details), b.google_place_id || '',
    bookingId, tripId
  ).run();

  // Regenerate linked itinerary items to reflect updated dates/times
  await c.env.DB.prepare('DELETE FROM Itineraries WHERE trip_id=? AND related_id=?').bind(tripId, bookingId).run();
  try {
    await generateItineraryItems(c.env.DB, tripId, Number(bookingId), b, details, b.image_url || '');
  } catch (err) {
    console.error('[bookings PUT] generateItineraryItems failed:', err);
  }

  return c.json({ success: true });
});

bookings.delete('/:bookingId', async (c) => {
  const tripId = c.req.param('id');
  const bookingId = c.req.param('bookingId');
  // Delete linked itinerary items first, then the booking itself
  await c.env.DB.prepare('DELETE FROM Itineraries WHERE trip_id=? AND related_id=?').bind(tripId, bookingId).run();
  await c.env.DB.prepare('DELETE FROM Bookings WHERE id=? AND trip_id=?').bind(bookingId, tripId).run();
  return c.json({ success: true });
});

export default bookings;
