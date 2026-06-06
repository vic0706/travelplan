import { Hono } from 'hono';
import { Env } from '../worker';
import { searchUnsplash } from '../utils/unsplash';

const bookings = new Hono<{ Bindings: Env }>();

// ── Helper: insert one generated itinerary item ──────────────────────────────
async function insertItinerary(db: any, tripId: string, item: {
  date: string; start_time: string; end_time: string;
  title: string; address: string; image_url: string; notes: string;
  icon: string; type: string; related_id: number;
}) {
  await db.prepare(`
    INSERT INTO Itineraries (
      trip_id, city_id, date, start_time, end_time, title, address,
      image_url, notes, tags, icon, sub_items, type, related_id,
      is_time_fixed, stay_duration, next_transport_mode, next_transport_time,
      next_transport_auto_time, lat, lng, google_place_id, rating,
      reviews_count, opening_hours, place_website, place_phone
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, '[]', ?, '[]', ?, ?, 1, '0', '', '', '0', NULL, NULL, '', NULL, NULL, NULL, NULL, NULL)
  `).bind(
    tripId, item.date, item.start_time, item.end_time,
    item.title, item.address, item.image_url, item.notes,
    item.icon, item.type, item.related_id
  ).run();
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

// ── Helper: subtract minutes from HH:MM string ───────────────────────────────
function subtractMins(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = ((h * 60 + m - mins) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ── Auto-generate itinerary items based on booking category ──────────────────
async function generateItineraryItems(db: any, tripId: string, bookingId: number, b: any, details: any, imageUrl: string) {
  const cat = b.category;
  const addr = b.start_location || '';
  const notes = b.order_id ? `Order ID: ${b.order_id}\n${b.notes || ''}`.trim() : (b.notes || '');

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

      if (isFirst && isLast) {
        // Single-night: only check-in + check-out
        await insertItinerary(db, tripId, { date, start_time: checkInTime,  end_time: checkInTime,  title: `Check-in ${b.title}`,  address: addr, image_url: imageUrl, notes, icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId });
        await insertItinerary(db, tripId, { date, start_time: checkOutTime, end_time: checkOutTime, title: `Check-out ${b.title}`, address: addr, image_url: imageUrl, notes, icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId });
      } else if (isFirst) {
        await insertItinerary(db, tripId, { date, start_time: checkInTime, end_time: checkInTime, title: `Check-in ${b.title}`,  address: addr, image_url: imageUrl, notes, icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId });
        await insertItinerary(db, tripId, { date, start_time: dailyReturn, end_time: dailyReturn, title: `返回 ${b.title}`,       address: addr, image_url: imageUrl, notes: '', icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId });
      } else if (isLast) {
        await insertItinerary(db, tripId, { date, start_time: checkOutTime, end_time: checkOutTime, title: `Check-out ${b.title}`, address: addr, image_url: imageUrl, notes, icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId });
      } else {
        await insertItinerary(db, tripId, { date, start_time: dailyOut,    end_time: dailyOut,    title: `出門（${b.title}）`, address: addr, image_url: imageUrl, notes: '', icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId });
        await insertItinerary(db, tripId, { date, start_time: dailyReturn, end_time: dailyReturn, title: `返回 ${b.title}`,     address: addr, image_url: imageUrl, notes: '', icon: 'Bed', type: 'ACCOMMODATION', related_id: bookingId });
      }
    }
    return;
  }

  if (cat === 'RENTAL' || cat === 'PRIVATE_TRANSFER') {
    await insertItinerary(db, tripId, { date: b.start_date, start_time: b.start_time || '10:00', end_time: b.start_time || '10:00', title: `取車：${b.title}`, address: addr, image_url: imageUrl, notes, icon: 'Car', type: 'RENTAL', related_id: bookingId });
    if (b.end_date && b.end_date !== b.start_date) {
      await insertItinerary(db, tripId, { date: b.end_date, start_time: b.end_time || '10:00', end_time: b.end_time || '10:00', title: `還車：${b.title}`, address: b.end_location || addr, image_url: imageUrl, notes, icon: 'Car', type: 'RENTAL', related_id: bookingId });
    }
    return;
  }

  if (['FLIGHT', 'TRAIN', 'FERRY', 'BUS'].includes(cat)) {
    const depBuffer = details.dep_buffer ?? 60;
    const icon = cat === 'FLIGHT' ? 'Plane' : cat === 'TRAIN' ? 'Train' : cat === 'FERRY' ? 'Ship' : 'Bus';
    const checkInAt = b.start_time ? subtractMins(b.start_time, depBuffer) : b.start_time || '';
    // Departure item (type TRANSPORTATION so TransportationCard renders it)
    await insertItinerary(db, tripId, { date: b.start_date, start_time: checkInAt, end_time: b.start_time || '', title: b.title, address: addr, image_url: imageUrl, notes, icon, type: 'TRANSPORTATION', related_id: bookingId });
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

  // Auto-fetch cover image for hotel/rental bookings if none provided
  let imageUrl = b.image_url || '';
  if (!imageUrl && (b.category === 'HOTEL' || b.category === 'RENTAL' || b.category === 'PRIVATE_TRANSFER')) {
    try { imageUrl = (await searchUnsplash(b.title, c.env)) || ''; } catch {}
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
  await c.env.DB.prepare(
    `UPDATE Bookings SET category=?, title=?, provider=?, order_id=?, start_date=?, start_time=?, end_date=?, end_time=?, start_location=?, end_location=?, notes=?, image_url=?, details=?, google_place_id=?
     WHERE id=? AND trip_id=?`
  ).bind(
    b.category || '', b.title || '', b.provider || '', b.order_id || '',
    b.start_date || '', b.start_time || '', b.end_date || '', b.end_time || '',
    b.start_location || '', b.end_location || '', b.notes || '', b.image_url || '',
    JSON.stringify(b.details || {}), b.google_place_id || '',
    bookingId, tripId
  ).run();
  return c.json({ success: true });
});

bookings.delete('/:bookingId', async (c) => {
  const tripId = c.req.param('id');
  const bookingId = c.req.param('bookingId');
  await c.env.DB.prepare('DELETE FROM Bookings WHERE id=? AND trip_id=?').bind(bookingId, tripId).run();
  return c.json({ success: true });
});

export default bookings;
