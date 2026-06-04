// Bookings [cite: 282-325]
import { Hono } from 'hono';
import { Env } from '../worker';
import { checkTripAccess } from '../utils/workerUtils';
import { searchUnsplash } from '../utils/unsplash';
import { generateDesiredAccommodationItems } from '../utils/bookingItems';

const bookings = new Hono<{ Bindings: Env }>();

bookings.get('/', async (c) => {
  const tripId = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM Bookings WHERE trip_id = ? ORDER BY start_date, start_time').bind(tripId).all();
  return c.json(results.map((r: any) => ({ ...r, details: r.details ? JSON.parse(r.details) : {} })));
});

bookings.post('/', async (c) => {
  const tripId = c.req.param('id');
  const b = await c.req.json();
  // 處理寫入 Bookings 並聯動 Itineraries 的邏輯... [cite: 286-295]
  return c.json({ success: true });
});

export default bookings;