const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `你是旅遊行程排程助手。根據固定行程的時間限制，為「待排活動」安排 start_time 和 end_time。
規則：
1. 不能與 fixed_blocks 時間重疊
2. 根據活動類型判斷合適時段（購物→白天、餐廳→用餐時段、夜市→晚上）
3. 地理位置相近的活動安排在一起
4. 所有時間在 day_window 範圍內
5. 活動之間預留合理的交通時間（市區景點間約 20~30 分鐘，跨城市預留更多）
以 JSON 陣列回傳，每個元素包含 id, start_time (HH:MM), end_time (HH:MM)`;

// djb2 hash of smart item ids + stay_durations for KV cache key
export function hashSmartItems(items: any[]): string {
  const str = items.map(i => `${i.id}:${i.stay_duration}`).join('|');
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return String(hash >>> 0);
}

export async function geminiScheduleDay(
  env: any,
  date: string,
  fixedItems: any[],
  smartItems: any[]
): Promise<Array<{ id: number; start_time: string; end_time: string }>> {
  const fixed_blocks = fixedItems.map(item => ({
    title: item.title,
    type: (item.category || item.type || 'GENERAL').toUpperCase(),
    start_time: item.start_time || '',
    ...(item.end_time ? { end_time: item.end_time } : {}),
  }));

  const items_to_schedule = smartItems.map(item => {
    let opening_hours_text: string | undefined;
    if (item.opening_hours) {
      try {
        const oh = JSON.parse(item.opening_hours);
        if (Array.isArray(oh.weekdayDescriptions) && oh.weekdayDescriptions.length > 0) {
          opening_hours_text = oh.weekdayDescriptions.slice(0, 3).join('; ');
        }
      } catch {}
    }
    const tags: string[] = (() => { try { return JSON.parse(item.tags || '[]'); } catch { return []; } })();
    return {
      id: item.id,
      title: item.title,
      ...(item.address ? { address: item.address } : {}),
      stay_minutes: parseInt(item.stay_duration) || 60,
      ...(opening_hours_text ? { opening_hours: opening_hours_text } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    };
  });

  const payload = { date, day_window: { start: '09:00', end: '22:00' }, fixed_blocks, items_to_schedule };

  // Check daily token limit before calling API
  const today = new Date().toISOString().split('T')[0];
  const tokenKey = `gemini_daily_tokens:${today}`;
  const dailyLimit = parseInt(env.GEMINI_DAILY_TOKEN_LIMIT || '100000');
  const estimatedTokens = Math.ceil(JSON.stringify(payload).length / 3.5) + 400;

  const currentTokensStr = await env.KV.get(tokenKey) as string | null;
  const currentTokens = parseInt(currentTokensStr || '0');
  if (currentTokens + estimatedTokens > dailyLimit) {
    throw new Error('GEMINI_DAILY_LIMIT_EXCEEDED');
  }

  const reqBody = JSON.stringify({
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            start_time: { type: 'string' },
            end_time: { type: 'string' },
          },
          required: ['id', 'start_time', 'end_time'],
        },
      },
    },
  });

  let res = await fetch(`${GEMINI_API_URL}?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: reqBody,
  });

  // Retry once on 429 (rate limit) after 5 seconds
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 5000));
    res = await fetch(`${GEMINI_API_URL}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: reqBody,
    });
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as any;

  // Track actual token usage; TTL resets at UTC midnight
  const usedTokens = data.usageMetadata?.totalTokenCount ?? estimatedTokens;
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const ttlSecs = Math.max(60, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
  await env.KV.put(tokenKey, String(currentTokens + usedTokens), { expirationTtl: ttlSecs });

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Gemini returned empty response');

  let results: Array<{ id: number; start_time: string; end_time: string }>;
  try {
    results = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini invalid JSON: ${String(raw).slice(0, 200)}`);
  }

  if (!Array.isArray(results)) throw new Error('Gemini response not an array');

  const validIds = new Set(smartItems.map((i: any) => i.id));
  const timeRe = /^\d{2}:\d{2}$/;

  return results.filter(r =>
    typeof r.id === 'number' &&
    validIds.has(r.id) &&
    typeof r.start_time === 'string' && timeRe.test(r.start_time) &&
    typeof r.end_time === 'string' && timeRe.test(r.end_time)
  );
}
