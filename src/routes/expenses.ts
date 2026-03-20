// Expenses [cite: 350-356]
const expenses = new Hono<{ Bindings: Env }>();

expenses.get('/', async (c) => {
  const tripId = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM Expenses WHERE trip_id = ? ORDER BY date').bind(tripId).all();
  return c.json(results.map((item: any) => ({ ...item, split_members: item.split_members ? JSON.parse(item.split_members) : [] })));
});

export default expenses;