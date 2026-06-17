import { Hono } from 'hono';
import { Env } from '../worker';
import { checkTripAccess } from '../utils/workerUtils';

const expenses = new Hono<{ Bindings: Env; Variables: { user: any } }>();

expenses.get('/', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canView = await checkTripAccess(c, Number(tripId), 'view');
    if (!canView) return c.json({ error: 'Unauthorized' }, 403);

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM Expenses WHERE trip_id = ? ORDER BY date DESC, created_at DESC'
    ).bind(tripId).all();
    return c.json(results.map((item: any) => ({
      ...item,
      split_members: item.split_members ? JSON.parse(item.split_members) : [],
    })));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

expenses.post('/', async (c) => {
  const tripId = c.req.param('id');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const body = await c.req.json().catch(() => ({}));
    const { item_name, amount, currency, date, category, payer_id, split_members, notes } = body;

    if (!item_name || amount == null || !currency || !date) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const { meta } = await c.env.DB.prepare(`
      INSERT INTO Expenses (trip_id, item_name, amount, currency, date, category, payer_id, split_members, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      tripId, item_name, amount, currency, date,
      category || 'Other', payer_id || null,
      JSON.stringify(split_members || []), notes || '',
      Date.now(), Date.now()
    ).run();

    return c.json({ id: meta.last_row_id, success: true }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

expenses.put('/:expenseId', async (c) => {
  const tripId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    const body = await c.req.json().catch(() => ({}));
    const { item_name, amount, currency, date, category, payer_id, split_members, notes } = body;

    await c.env.DB.prepare(`
      UPDATE Expenses SET item_name = ?, amount = ?, currency = ?, date = ?, category = ?, payer_id = ?, split_members = ?, notes = ?, updated_at = ?
      WHERE id = ? AND trip_id = ?
    `).bind(
      item_name, amount, currency, date,
      category || 'Other', payer_id || null,
      JSON.stringify(split_members || []), notes || '',
      Date.now(), expenseId, tripId
    ).run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

expenses.delete('/:expenseId', async (c) => {
  const tripId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  try {
    const canEdit = await checkTripAccess(c, Number(tripId), 'edit');
    if (!canEdit) return c.json({ error: 'Unauthorized' }, 403);

    await c.env.DB.prepare(
      'DELETE FROM Expenses WHERE id = ? AND trip_id = ?'
    ).bind(expenseId, tripId).run();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default expenses;
