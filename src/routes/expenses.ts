import { Hono } from 'hono';
import { Env } from '../worker';


const expenses = new Hono<{ Bindings: Env }>();

// 獲取特定行程的所有花費
expenses.get('/', async (c) => {
  const tripId = c.req.param('id'); // 注意：在 Hono 中應使用 c.req.param
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM Expenses WHERE trip_id = ? ORDER BY date').bind(tripId).all();
    return c.json(results.map((item: any) => ({
      ...item,
      split_members: item.split_members ? JSON.parse(item.split_members) : []
    })));
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

expenses.post('/', async (c) => {
  const tripId = c.req.param('id');
  try {
    const b = await c.req.json();
    const { meta } = await c.env.DB.prepare(
      `INSERT INTO Expenses (trip_id, item_name, amount, currency, date, time, category, payer_id, split_members, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tripId,
      b.item_name || '',
      b.amount ?? 0,
      b.currency || '',
      b.date || '',
      b.time || '',
      b.category || '',
      b.payer_id || null,
      JSON.stringify(b.split_members || []),
      b.notes || ''
    ).run();
    const created = await c.env.DB.prepare('SELECT * FROM Expenses WHERE id = ?').bind(meta.last_row_id).first() as any;
    return c.json({
      ...created,
      split_members: created?.split_members ? JSON.parse(created.split_members) : []
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

expenses.put('/:expenseId', async (c) => {
  const tripId = c.req.param('id');
  const expenseId = c.req.param('expenseId');
  try {
    const b = await c.req.json();
    await c.env.DB.prepare(
      `UPDATE Expenses SET item_name=?, amount=?, currency=?, date=?, time=?, category=?, payer_id=?, split_members=?, notes=?
       WHERE id=? AND trip_id=?`
    ).bind(
      b.item_name || '',
      b.amount ?? 0,
      b.currency || '',
      b.date || '',
      b.time || '',
      b.category || '',
      b.payer_id || null,
      JSON.stringify(b.split_members || []),
      b.notes || '',
      expenseId,
      tripId
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
    await c.env.DB.prepare('DELETE FROM Expenses WHERE id=? AND trip_id=?').bind(expenseId, tripId).run();
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

export default expenses;
