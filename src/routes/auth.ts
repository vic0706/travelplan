import { Hono } from 'hono';
import { Env } from '../worker';
import { generateHash } from '../utils/workerUtils';

const auth = new Hono<{ Bindings: Env }>();

// 系統初始化 [cite: 257]
auth.post('/init', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT COUNT(*) as count FROM Users').all();
    if ((results[0] as any).count === 0) {
      const passwordHash = await generateHash('123456', c.env.PASSWORD_SALT || 'default_salt');
      await c.env.DB.prepare(`INSERT INTO Users (role, name, avatar_url, password_hash, allow_login, created_at, updated_at) VALUES ('Admin', '超級管理員', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin', ?, 1, ?, ?)`).bind(passwordHash, Date.now(), Date.now()).run();
      return c.json({ success: true, message: 'Admin created.' });
    }
    return c.json({ success: false, message: 'Not empty.' });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// 登入介面用的用戶清單 [cite: 258]
auth.get('/login-list', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT id, name, avatar_url, role FROM Users WHERE allow_login = 1').all();
    return c.json(results);
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

// 執行登入 [cite: 259-261]
auth.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (!username || !password) return c.json({ error: 'Missing credentials' }, 400);
    const { results } = await c.env.DB.prepare('SELECT * FROM Users WHERE id = ? AND allow_login = 1').bind(username).all();
    const user = results[0] as any;
    if (!user) return c.json({ error: 'User not found' }, 404);
    const passwordHash = await generateHash(password, c.env.PASSWORD_SALT);
    if (passwordHash !== user.password_hash) return c.json({ error: 'Invalid password' }, 401);

    const { password_hash, ...safeUser } = user;
    const token = crypto.randomUUID();
    await c.env.KV.put(`session:${token}`, JSON.stringify(safeUser), { expirationTtl: 604800 });
    return c.json({ token, user: safeUser });
  } catch (error: any) { return c.json({ error: error.message }, 500); }
});

export default auth;