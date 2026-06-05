// Bookings [cite: 282-325]
import { Hono } from 'hono';
import { Env } from '../worker';

const bookings = new Hono<{ Bindings: Env }>();

bookings.get('/', async (c) => {
  const tripId = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM Bookings WHERE trip_id = ? ORDER BY start_date, start_time').bind(tripId).all();
  return c.json(results.map((r: any) => ({ ...r, details: r.details ? JSON.parse(r.details) : {} })));
});

bookings.post('/', async (c) => {
  const tripId = c.req.param('id');
  const b = await c.req.json();
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
    b.image_url || '',
    JSON.stringify(b.details || {}),
    b.google_place_id || ''
  ).run();
  const created = await c.env.DB.prepare('SELECT * FROM Bookings WHERE id = ?').bind(meta.last_row_id).first() as any;
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
  return c.json({ success: true });
});

bookings.delete('/:bookingId', async (c) => {
  const tripId = c.req.param('id');
  const bookingId = c.req.param('bookingId');
  await c.env.DB.prepare('DELETE FROM Bookings WHERE id=? AND trip_id=?').bind(bookingId, tripId).run();
  return c.json({ success: true });
});

export default bookings;
