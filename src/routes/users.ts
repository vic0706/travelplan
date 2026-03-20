import { Hono } from 'hono';
import { Env } from '../worker';
import { generateHash } from '../utils/workerUtils';

const users = new Hono<{ Bindings: Env }>();

// 🚨 補回：前端 Login 頁面需要的用戶清單
users.get('/login-list', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT id, name, avatar_url, role FROM Users WHERE allow_login = 1').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// Admin 獲取所有用戶
users.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, name, avatar_url, role, allow_login FROM Users').all();
  return c.json(results);
});

// 更新用戶資料
users.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  let query = 'UPDATE Users SET updated_at = ?';
  const params: any[] = [Date.now()];
  
  if (body.name) { query += ', name = ?'; params.push(body.name); }
  if (body.avatar_url) { query += ', avatar_url = ?'; params.push(body.avatar_url); }
  if (body.password) { query += ', password_hash = ?'; params.push(await generateHash(body.password, c.env.PASSWORD_SALT)); }
  
  query += ' WHERE id = ?'; params.push(id);
  await c.env.DB.prepare(query).bind(...params).run();
  return c.json({ success: true });
});

export default users;