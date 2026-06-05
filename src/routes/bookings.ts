import { Hono } from 'hono';
import { Env } from '../worker';
import { searchUnsplash } from '../utils/unsplash';

const bookings = new Hono<{ Bindings: Env }>();

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
    const fullPath = `travelplan/bookings/${fileName}`;
    const uploadRes = await fetch(
      `${env.VITE_SUPABASE_URL}/storage/v1/object/${fullPath}`,
      { method: 'POST', headers: { 'Authorization': `Bearer ${env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' }, body: imgBuffer }
    );
    if (!uploadRes.ok) return null;
    return `${env.VITE_SUPABASE_URL}/storage/v1/object/public/${fullPath}`;
  } catch { return null; }
}

function addMinutes(time: string, minutes: number): string {
  if (!time || !minutes) return time || '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const nm = ((total % 1440) + 1440) % 1440 % 60;
  return `${nh.toString().padStart(2, '0')}:${nm.toString().padStart(2, '0')}`;
}

interface GeneratedItem {
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  type: string;
  icon: string;
  address: string;
  notes: string;
  next_transport_mode: string;
  next_transport_time: string;
}

function buildItineraryItems(b: any, bookingId: number): GeneratedItem[] {
  const details = typeof b.details === 'string' ? JSON.parse(b.details || '{}') : (b.details || {});
  const title = b.title || '';
  const notesWithOrder = b.order_id
    ? `訂單號：${b.order_id}${b.notes ? '\n' + b.notes : ''}`
    : (b.notes || '');

  switch (b.category) {
    case 'HOTEL': {
      const checkInDate = b.start_date;
      const checkOutDate = b.end_date;
      const checkInTime = b.start_time || '16:00';
      const checkOutTime = b.end_time || '11:00';
      const dailyStartTime = details.daily_start_time || '09:00';
      const dailyEndTime = details.daily_end_time || '22:00';
      const checkInStay = details.check_in_stay ?? 30;
      const checkOutStay = details.check_out_stay ?? 30;
      const dailyDepartStay = details.daily_depart_stay ?? 30;
      const dailyReturnStay = details.daily_return_stay ?? 30;

      const items: GeneratedItem[] = [];
      const current = new Date(checkInDate + 'T12:00:00');
      const end = new Date(checkOutDate + 'T12:00:00');

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const isCheckIn = dateStr === checkInDate;
        const isCheckOut = dateStr === checkOutDate;

        if (isCheckIn) {
          items.push({
            date: dateStr, start_time: checkInTime, end_time: addMinutes(checkInTime, checkInStay),
            title: `入住 ${title}`, type: 'ACCOMMODATION', icon: 'BedDouble',
            address: b.start_location || '', notes: notesWithOrder,
            next_transport_mode: 'WALKING', next_transport_time: 'auto',
          });
          if (!isCheckOut) {
            items.push({
              date: dateStr, start_time: dailyEndTime, end_time: addMinutes(dailyEndTime, dailyReturnStay),
              title: `返回 ${title}`, type: 'ACCOMMODATION', icon: 'BedDouble',
              address: b.start_location || '', notes: '',
              next_transport_mode: '', next_transport_time: '',
            });
          }
        } else if (isCheckOut) {
          items.push({
            date: dateStr, start_time: checkOutTime, end_time: addMinutes(checkOutTime, checkOutStay),
            title: `退房 ${title}`, type: 'ACCOMMODATION', icon: 'BedDouble',
            address: b.start_location || '', notes: notesWithOrder,
            next_transport_mode: '', next_transport_time: '',
          });
        } else {
          items.push({
            date: dateStr, start_time: dailyStartTime, end_time: addMinutes(dailyStartTime, dailyDepartStay),
            title: `出發 ${title}`, type: 'ACCOMMODATION', icon: 'BedDouble',
            address: b.start_location || '', notes: '',
            next_transport_mode: 'TRANSIT', next_transport_time: 'auto',
          });
          items.push({
            date: dateStr, start_time: dailyEndTime, end_time: addMinutes(dailyEndTime, dailyReturnStay),
            title: `返回 ${title}`, type: 'ACCOMMODATION', icon: 'BedDouble',
            address: b.start_location || '', notes: '',
            next_transport_mode: '', next_transport_time: '',
          });
        }
        current.setDate(current.getDate() + 1);
      }
      return items;
    }

    case 'FLIGHT':
    case 'TRAIN':
    case 'FERRY':
    case 'BUS': {
      const icon = b.category === 'FLIGHT' ? 'Plane' : b.category === 'TRAIN' ? 'Train' : b.category === 'FERRY' ? 'Ship' : 'Bus';
      if (!b.start_date || !b.start_time) return [];
      const depLabel = b.category === 'FLIGHT' ? '起飛' : b.category === 'FERRY' ? '出航' : '搭車';
      const arrLabel = b.category === 'FLIGHT' ? '降落' : b.category === 'FERRY' ? '靠港' : '抵站';
      const termLabel = b.category === 'FLIGHT' ? '航廈' : b.category === 'BUS' ? '站牌' : '月台';
      const depTerminal = details.dep_terminal ? ` ${termLabel}${details.dep_terminal}` : '';
      const arrTerminal = details.arr_terminal ? ` ${termLabel}${details.arr_terminal}` : '';
      const routeLine = b.start_location && b.end_location
        ? `${b.start_location}${depTerminal} → ${b.end_location}${arrTerminal}`
        : (b.start_location || b.end_location || '');
      const timeLine = b.start_time && b.end_time ? `${depLabel} ${b.start_time} → ${arrLabel} ${b.end_time}` : '';
      const checkInLine = details.check_in_time ? `報到：${details.check_in_time}` : '';
      const noteLines = [b.provider, routeLine, timeLine, checkInLine, notesWithOrder].filter(Boolean).join('\n');
      const displayStart = details.check_in_time || b.start_time;
      const displayEnd = details.arr_stay ? addMinutes(b.end_time || b.start_time, details.arr_stay) : (b.end_time || b.start_time);
      return [{
        date: b.start_date, start_time: displayStart, end_time: displayEnd,
        title, type: 'GENERAL', icon,
        address: b.start_location || '', notes: noteLines,
        next_transport_mode: 'TRANSIT', next_transport_time: 'auto',
      }];
    }

    case 'PRIVATE_TRANSFER': {
      if (!b.start_date || !b.start_time) return [];
      const routeLine = b.start_location && b.end_location
        ? `${b.start_location} → ${b.end_location}`
        : (b.start_location || b.end_location || '');
      const noteLines = [b.provider, routeLine, notesWithOrder].filter(Boolean).join('\n');
      return [{
        date: b.start_date, start_time: b.start_time, end_time: b.end_time || b.start_time,
        title, type: 'GENERAL', icon: 'Car',
        address: b.start_location || '', notes: noteLines,
        next_transport_mode: 'TRANSIT', next_transport_time: 'auto',
      }];
    }

    case 'RENTAL': {
      const pickupBuffer = details.pickup_buffer ?? 0;
      const returnBuffer = details.return_buffer ?? 0;
      const items: GeneratedItem[] = [];
      if (b.start_date && b.start_time) {
        items.push({
          date: b.start_date, start_time: b.start_time, end_time: addMinutes(b.start_time, pickupBuffer),
          title: `取車 ${title}`, type: 'RENTAL', icon: 'Car',
          address: b.start_location || '', notes: notesWithOrder,
          next_transport_mode: 'DRIVING', next_transport_time: 'auto',
        });
      }
      if (b.end_date && b.end_time) {
        items.push({
          date: b.end_date, start_time: b.end_time, end_time: addMinutes(b.end_time, returnBuffer),
          title: `還車 ${title}`, type: 'RENTAL', icon: 'Car',
          address: b.end_location || b.start_location || '', notes: '',
          next_transport_mode: '', next_transport_time: '',
        });
      }
      return items;
    }

    default:
      return [];
  }
}

async function insertItineraryItems(env: Env, tripId: string, bookingId: number, b: any): Promise<void> {
  const items = buildItineraryItems(b, bookingId);
  const image = b.image_url || '';
  for (const item of items) {
    await env.DB.prepare(`
      INSERT INTO Itineraries
        (trip_id, date, start_time, end_time, title, address, image_url, notes,
         tags, icon, type, related_id, is_time_fixed, stay_duration, sub_items,
         next_transport_mode, next_transport_time, next_transport_auto_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tripId, item.date, item.start_time, item.end_time,
      item.title, item.address, image, item.notes,
      '[]', item.icon, item.type, bookingId,
      1, '60', '[]', item.next_transport_mode, item.next_transport_time, ''
    ).run();
  }
}

bookings.get('/', async (c) => {
  const tripId = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM Bookings WHERE trip_id = ? ORDER BY start_date, start_time').bind(tripId).all();
  return c.json(results.map((r: any) => ({ ...r, details: r.details ? JSON.parse(r.details) : {} })));
});

bookings.post('/', async (c) => {
  const tripId = c.req.param('id');
  const b = await c.req.json();

  // Synchronously fetch hotel photo before INSERT if none provided
  let imageUrl = b.image_url || '';
  if (b.category === 'HOTEL' && !b.image_url && b.title) {
    imageUrl = (await fetchAndStoreImage(b.title, c.env)) || '';
  }

  const { meta } = await c.env.DB.prepare(
    `INSERT INTO Bookings (trip_id, category, title, provider, order_id, start_date, start_time, end_date, end_time, start_location, end_location, notes, image_url, details, google_place_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    tripId,
    b.category || '',
    b.title || '',
    b.provider || '',
    b.order_id || '',
    b.start_date || '',
    b.start_time || '',
    b.end_date || '',
    b.end_time || '',
    b.start_location || '',
    b.end_location || '',
    b.notes || '',
    imageUrl,
    JSON.stringify(b.details || {}),
    b.google_place_id || ''
  ).run();

  const bookingId = meta.last_row_id as number;
  const created = await c.env.DB.prepare('SELECT * FROM Bookings WHERE id = ?').bind(bookingId).first() as any;

  await insertItineraryItems(c.env, tripId, bookingId, { ...b, image_url: imageUrl });

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
    b.category || '',
    b.title || '',
    b.provider || '',
    b.order_id || '',
    b.start_date || '',
    b.start_time || '',
    b.end_date || '',
    b.end_time || '',
    b.start_location || '',
    b.end_location || '',
    b.notes || '',
    b.image_url || '',
    JSON.stringify(b.details || {}),
    b.google_place_id || '',
    bookingId,
    tripId
  ).run();

  // Regenerate linked itinerary items
  await c.env.DB.prepare('DELETE FROM Itineraries WHERE trip_id=? AND related_id=?').bind(tripId, bookingId).run();
  await insertItineraryItems(c.env, tripId, Number(bookingId), { ...b, image_url: b.image_url || '' });

  return c.json({ success: true });
});

bookings.delete('/:bookingId', async (c) => {
  const tripId = c.req.param('id');
  const bookingId = c.req.param('bookingId');
  await c.env.DB.prepare('DELETE FROM Itineraries WHERE trip_id=? AND related_id=?').bind(tripId, bookingId).run();
  await c.env.DB.prepare('DELETE FROM Bookings WHERE id=? AND trip_id=?').bind(bookingId, tripId).run();
  return c.json({ success: true });
});

export default bookings;
