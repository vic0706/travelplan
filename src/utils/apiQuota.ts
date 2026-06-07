// Google API free tier limits (per SKU, per month, as of March 2025)
// Essentials tier: 10,000/month  |  Pro tier: 5,000/month
const API_DEFAULTS: Record<string, number> = {
  places_autocomplete: 9000,   // Essentials: 10,000 → 90% threshold
  place_details:       4500,   // Pro: 5,000 (uses rich fields like photos/ratings)
  place_search:        4500,   // Pro: 5,000
  route_matrix:        9000,   // Essentials: 10,000
  compute_routes:      9000,   // Essentials: 10,000
};

export const API_FREE_LIMITS: Record<string, number> = {
  places_autocomplete: 10000,
  place_details:       5000,
  place_search:        5000,
  route_matrix:        10000,
  compute_routes:      10000,
};

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

async function getLimit(env: any, apiName: string): Promise<number> {
  try {
    const row = await env.DB.prepare(
      'SELECT value FROM App_Settings WHERE key_name = ?'
    ).bind(`api_limit_${apiName}`).first() as any;
    if (row?.value) return parseInt(row.value) || API_DEFAULTS[apiName] || 9000;
  } catch { /* DB unavailable */ }
  return API_DEFAULTS[apiName] || 9000;
}

export async function checkApiQuota(env: any, apiName: string): Promise<void> {
  const key = `api_count:${currentYearMonth()}:${apiName}`;
  const current = ((await env.KV.get(key, 'json')) as number) ?? 0;
  const limit = await getLimit(env, apiName);
  if (current >= limit) {
    throw Object.assign(new Error(`API_QUOTA_EXCEEDED:${apiName}`), { code: 'API_QUOTA_EXCEEDED', api: apiName });
  }
}

export async function trackApiCall(env: any, apiName: string): Promise<void> {
  const key = `api_count:${currentYearMonth()}:${apiName}`;
  const current = ((await env.KV.get(key, 'json')) as number) ?? 0;
  // TTL: 3 months (retain past usage for reference)
  await env.KV.put(key, JSON.stringify(current + 1), { expirationTtl: 7948800 });
}

export async function getApiUsage(env: any): Promise<Record<string, { count: number; limit: number; freeLimit: number }>> {
  const yyyyMM = currentYearMonth();
  const result: Record<string, { count: number; limit: number; freeLimit: number }> = {};
  await Promise.all(
    Object.keys(API_DEFAULTS).map(async (apiName) => {
      const key = `api_count:${yyyyMM}:${apiName}`;
      const count = ((await env.KV.get(key, 'json')) as number) ?? 0;
      const limit = await getLimit(env, apiName);
      result[apiName] = { count, limit, freeLimit: API_FREE_LIMITS[apiName] || 10000 };
    })
  );
  return result;
}

export async function saveApiLimit(env: any, apiName: string, limit: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO App_Settings (key_name, value) VALUES (?, ?)
     ON CONFLICT(key_name) DO UPDATE SET value = excluded.value`
  ).bind(`api_limit_${apiName}`, String(limit)).run();
}
