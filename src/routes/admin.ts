import { Hono } from 'hono';
import { Env } from '../worker';
import { resetUserQuota, getUserQuotaStatus, QuotaAction } from '../utils/userQuota';

const admin = new Hono<{ Bindings: Env; Variables: { user: any } }>();

admin.use('*', async (c, next) => {
  const user = c.get('user');
  if (!user || user.role !== 'Admin') return c.json({ error: 'Unauthorized' }, 403);
  await next();
});

admin.post('/user-quota/reset', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { userId, action } = body;
  if (!userId) return c.json({ error: 'userId is required' }, 400);
  await resetUserQuota(c.env, Number(userId), action as QuotaAction | undefined);
  const quota = await getUserQuotaStatus(c.env, Number(userId));
  return c.json({ success: true, quota });
});

admin.get('/user-quota/:userId', async (c) => {
  const userId = Number(c.req.param('userId'));
  const quota = await getUserQuotaStatus(c.env, userId);
  return c.json(quota);
});

export default admin;
