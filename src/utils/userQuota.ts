import { Env } from '../worker';

const USER_DAILY_LIMIT = 10;
const ACTIONS = ['weather', 'places', 'optimize'] as const;
export type QuotaAction = typeof ACTIONS[number];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function kvKey(userId: number, action: QuotaAction): string {
  return `user_quota:${userId}:${todayStr()}:${action}`;
}

export async function checkUserQuota(env: Env, userId: number, action: QuotaAction): Promise<{ ok: boolean; remaining: number }> {
  const count = ((await env.KV.get(kvKey(userId, action), 'json')) as number) ?? 0;
  return { ok: count < USER_DAILY_LIMIT, remaining: Math.max(0, USER_DAILY_LIMIT - count) };
}

export async function incrementUserQuota(env: Env, userId: number, action: QuotaAction): Promise<number> {
  const key = kvKey(userId, action);
  const count = ((await env.KV.get(key, 'json')) as number) ?? 0;
  const next = count + 1;
  await env.KV.put(key, JSON.stringify(next), { expirationTtl: 172800 }); // 48h
  return next;
}

export async function resetUserQuota(env: Env, userId: number, action?: QuotaAction): Promise<void> {
  const today = todayStr();
  const targets = action ? [action] : [...ACTIONS];
  await Promise.all(targets.map(a => env.KV.delete(`user_quota:${userId}:${today}:${a}`)));
}

export async function getUserQuotaStatus(env: Env, userId: number): Promise<Record<QuotaAction, { count: number; limit: number }>> {
  const today = todayStr();
  const result = {} as Record<QuotaAction, { count: number; limit: number }>;
  await Promise.all(
    ACTIONS.map(async (action) => {
      const count = ((await env.KV.get(`user_quota:${userId}:${today}:${action}`, 'json')) as number) ?? 0;
      result[action] = { count, limit: USER_DAILY_LIMIT };
    })
  );
  return result;
}
