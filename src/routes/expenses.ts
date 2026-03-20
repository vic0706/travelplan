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

export default expenses;