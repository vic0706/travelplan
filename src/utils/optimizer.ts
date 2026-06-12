// Module-level log buffer, reset at the start of each optimizeDailyItinerary call.
// Safe in Cloudflare Workers (single-threaded per request).
let _log: string[] = [];

// Urban circuity factor (actual road ≈ 1.3× haversine for mixed city/highway)
const ROAD_CIRCUITY = 1.3;

// Heuristic speeds in min/km. Keys match the DB next_transport_mode values (DRIVING, not DRIVE).
// These are fallbacks used when Google Maps API is unavailable.
// Speeds are tuned for Taiwan inter-city travel so the estimate doesn't block placement:
//   DRIVING 1.2 min/km ≈ 50 km/h (reasonable for mix of city + national highway)
//   170km inter-city: ≈ 170*1.3*1.2+8 = 273 min (fits within a day; actual ~120-150 via API)
const HEURISTIC_SPEED: Record<string, { speed: number; buffer: number }> = {
  DRIVING:      { speed: 1.2, buffer: 8  },
  WALKING:      { speed: 13,  buffer: 3  },
  BICYCLING:    { speed: 5,   buffer: 5  },
  MOTORCYCLING: { speed: 1.2, buffer: 5  },
  TRANSIT:      { speed: 3.0, buffer: 12 },
};

function haversineAll(fromLat: number, fromLng: number, toLat: number, toLng: number): Record<string, number> {
  const dist = getDistanceKm(fromLat, fromLng, toLat, toLng) ?? 0;
  const result: Record<string, number> = {};
  for (const [mode, { speed, buffer }] of Object.entries(HEURISTIC_SPEED)) {
    result[mode] = Math.ceil(dist * ROAD_CIRCUITY * speed) + buffer;
  }
  return result;
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  try {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  } catch (e) { return null; }
}

function timeToMins(timeStr: string) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minsToTime(mins: number) {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.floor(mins % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function roundUpTo30(mins: number): number {
  const remainder = mins % 30;
  return remainder === 0 ? mins : mins + (30 - remainder);
}

const DAY_START = 9 * 60;   // 09:00
const DAY_END   = 22 * 60;  // 22:00

/**
 * Returns the preferred [start, end] window (in minutes from midnight) for a smart item.
 * Priority: opening_hours for that weekday > keyword inference (title/tags) > anytime
 * Keyword "floor" times override opening_hours when they imply a later start
 * (e.g., 夜市 must start ≥ 17:00 regardless of what Google Places says).
 */
function getPreferredWindow(item: any, dateStr: string): { start: number; end: number } {
  const titleText = (item.title || '').toLowerCase();
  const tagsArr: string[] = (() => { try { return JSON.parse(item.tags || '[]'); } catch { return []; } })();
  const text = `${titleText} ${(item.notes || '')} ${tagsArr.join(' ')}`.toLowerCase();

  // Keyword floor: these patterns enforce a minimum start time even if opening_hours says earlier.
  // The floor is applied AFTER opening_hours so we take the later of the two.
  let keywordFloor: number | null = null;
  let keywordEnd: number | null = null;

  if      (/早餐|早午餐|breakfast|brunch/.test(text)) { keywordFloor =  7 * 60; keywordEnd = 10 * 60; }
  else if (/咖啡|cafe|coffee/.test(text))              { keywordFloor =  9 * 60; keywordEnd = 17 * 60; }
  else if (/午餐|lunch|中餐/.test(text))               { keywordFloor = 11 * 60 + 30; keywordEnd = 14 * 60; }
  else if (/下午茶|afternoon tea/.test(text))          { keywordFloor = 14 * 60; keywordEnd = 17 * 60; }
  else if (/夕陽|日落|sunset|落日/.test(text))         { keywordFloor = 16 * 60; keywordEnd = 20 * 60; }
  else if (/晚餐|dinner|晚飯/.test(text))              { keywordFloor = 17 * 60; keywordEnd = 21 * 60; }
  else if (/夜市|night market|酒吧|bar|夜店|pub/.test(text)) { keywordFloor = 17 * 60; keywordEnd = 23 * 60; }
  else if (/濕地|wetland/.test(text))                                             { keywordFloor =  9 * 60; keywordEnd = 18 * 60; }
  else if (/公園|海邊|海灘|沙灘|beach|park/.test(text))                          { keywordFloor =  9 * 60; keywordEnd = 18 * 60; }
  else if (/步道|登山|山頂|森林|hiking|trail|forest/.test(text))                  { keywordFloor =  7 * 60; keywordEnd = 17 * 60; }
  else if (/博物館|美術館|museum|gallery/.test(text))                              { keywordFloor =  9 * 60; keywordEnd = 17 * 60; }
  else if (/漁港|早市|morning market/.test(text))                                  { keywordFloor =  6 * 60; keywordEnd = 12 * 60; }
  else if (/農場|植物園|動物園|farm|zoo|botanical garden/.test(text))              { keywordFloor =  9 * 60; keywordEnd = 17 * 60; }
  else if (/夜景|night view|夜拍/.test(text))                                      { keywordFloor = 19 * 60; keywordEnd = 23 * 60; }
  else if (/溫泉|hot spring/.test(text))                                           { keywordFloor = 18 * 60; keywordEnd = 22 * 60; }

  // 1. Try opening_hours from Google Places
  if (item.opening_hours) {
    try {
      const oh = JSON.parse(item.opening_hours);
      if (Array.isArray(oh.periods) && oh.periods.length > 0) {
        const only = oh.periods[0];
        if (oh.periods.length === 1 && only.open?.day === 0 && only.open?.hour === 0 && !only.close) {
          // 24h — fall through to keyword logic
        } else {
          const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
          const period = oh.periods.find((p: any) => p.open?.day === dayOfWeek);
          if (period?.open) {
            const openMins  = (period.open.hour  || 0) * 60 + (period.open.minute  || 0);
            const closeMins = period.close
              ? (period.close.hour || 0) * 60 + (period.close.minute || 0)
              : 24 * 60;
            const ohStart = Math.max(DAY_START, openMins);
            const ohEnd   = Math.min(DAY_END, closeMins > openMins ? closeMins : DAY_END);
            // Apply keyword floor: if keyword implies a later start, use it
            const finalStart = keywordFloor !== null ? Math.max(ohStart, keywordFloor) : ohStart;
            const finalEnd   = keywordEnd   !== null ? Math.max(ohEnd,   keywordEnd)   : ohEnd;
            return { start: finalStart, end: finalEnd };
          }
        }
      }
    } catch { /* invalid JSON — fall through */ }
  }

  // 2. Keyword-based (when no valid opening_hours)
  if (keywordFloor !== null && keywordEnd !== null) {
    return { start: keywordFloor, end: keywordEnd };
  }

  // 3. anytime — default to daytime (9am–6pm) to avoid placing generic spots at night
  return { start: DAY_START, end: 18 * 60 };
}

interface GapSlot {
  start:    number;
  end:      number;
  cursor:   number;
  lastLat:  number | null;
  lastLng:  number | null;
  lastItem: any | null;
}

class MissingTransportError extends Error {
  constructor(public itemId: number, public itemTitle: string) {
    super(`MISSING_TRANSPORT:${itemId}`);
    this.name = 'MissingTransportError';
  }
}

/**
 * Fetches real travel duration via Google Routes API (computeRouteMatrix).
 * KV-cached 30 days per pair. Falls back to haversine if API unavailable.
 * Throws MissingTransportError if transport info is absent or coords missing.
 */
async function calcTravelMins(gap: GapSlot, item: any, statements: any[], metaStatements: any[], env: any): Promise<number> {
  if (!gap.lastItem) return 0;
  const prev = gap.lastItem;
  const rawMode = (prev.next_transport_mode || '').toUpperCase();

  if (prev.next_transport_time === 'auto') {
    const hasCoords = !!(gap.lastLat && gap.lastLng && item.lat && item.lng);
    let mins: number | null = null;
    let resolvedMode = rawMode || 'DRIVE';
    let haversineVal: number | null = null;

    // AUTO mode: pick the fastest transport by haversine estimate
    if (rawMode === 'AUTO' && hasCoords) {
      const estimates = haversineAll(gap.lastLat!, gap.lastLng!, item.lat, item.lng);
      const fastest = Object.entries(estimates).sort((a, b) => a[1] - b[1])[0];
      resolvedMode = fastest[0];
      haversineVal = fastest[1];
    } else if (hasCoords) {
      const h = HEURISTIC_SPEED[resolvedMode] || HEURISTIC_SPEED.DRIVING;
      const dist = getDistanceKm(gap.lastLat!, gap.lastLng!, item.lat, item.lng) ?? 0;
      haversineVal = Math.ceil(dist * ROAD_CIRCUITY * h.speed) + h.buffer;
    }

    let gmapsLog = hasCoords ? (env.GOOGLE_MAPS_API_KEY ? 'pending' : 'no_key') : 'no_coords';

    if (hasCoords && env.GOOGLE_MAPS_API_KEY) {
      const travelMode = resolvedMode === 'WALKING'      ? 'WALK'
        : resolvedMode === 'BICYCLING'    ? 'BICYCLE'
        : resolvedMode === 'TRANSIT'      ? 'TRANSIT'
        : resolvedMode === 'MOTORCYCLING' ? 'TWO_WHEELER'
        : 'DRIVE';
      try {
          const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
              'X-Goog-FieldMask': 'routes.duration',
            },
            body: JSON.stringify({
              origin:      { location: { latLng: { latitude: gap.lastLat, longitude: gap.lastLng } } },
              destination: { location: { latLng: { latitude: item.lat, longitude: item.lng } } },
              travelMode,
            }),
          });
          if (res.ok) {
            const data = await res.json() as any;
            const duration = data.routes?.[0]?.duration;
            if (duration) {
              const secs = parseInt(String(duration));
              if (!isNaN(secs) && secs > 0) {
                mins = Math.ceil(secs / 60);
                gmapsLog = `${mins}min`;
              } else {
                gmapsLog = `parse_err(${duration})`;
              }
            } else {
              gmapsLog = 'no_route';
            }
          } else {
            gmapsLog = `api_err(${res.status})`;
          }
        } catch (e: any) {
          gmapsLog = `exception(${e?.message || 'unknown'})`;
        }
    }

    // Haversine fallback when API unavailable or failed
    if (mins === null && hasCoords && haversineVal !== null) {
      mins = haversineVal;
    }

    if (mins === null) {
      const msg = `[travel-skip] ${prev.title} → ${item.title}: no coords or API error`;
      _log.push(msg); console.log(msg);
      throw new MissingTransportError(prev.id, prev.title || String(prev.id));
    }

    const travelMsg = `[travel] ${prev.title}(id=${prev.id}) → ${item.title}: mode=${resolvedMode}, haversine=${haversineVal}min, gmaps=${gmapsLog}, final=${mins}min`;
    _log.push(travelMsg); console.log(travelMsg);

    // Critical update — column exists since initial schema; must not be batched with new columns.
    statements.push(env.DB.prepare(
      `UPDATE Itineraries SET next_transport_auto_time = ? WHERE id = ?`
    ).bind(mins, prev.id));
    // Metadata update — columns added in migration 0003; batched separately so a missing
    // column on production does not roll back the critical update above.
    metaStatements.push(env.DB.prepare(
      `UPDATE Itineraries SET next_transport_resolved_mode = ?, next_transport_haversine_time = ? WHERE id = ?`
    ).bind(resolvedMode, haversineVal ?? mins, prev.id));
    return mins;
  }

  if (prev.next_transport_time) {
    const parsed = parseInt(prev.next_transport_time.replace(/\D/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }

  // No transport set → optimizer cannot calculate travel time
  throw new MissingTransportError(prev.id, prev.title || String(prev.id));
}

/**
 * Returns Google Maps walking time (WALK mode) between two sub-items.
 * No caching — always fetches fresh. Falls back to haversine if API unavailable.
 * Returns { mins, fromGmaps } so callers can decide whether to persist the value.
 */
async function calcSubWalkMins(sub: any, nextSub: any, env: any): Promise<{ mins: number; fromGmaps: boolean }> {
  if (!sub?.lat || !sub?.lng || !nextSub?.lat || !nextSub?.lng) return { mins: 0, fromGmaps: false };
  const dist = getDistanceKm(sub.lat, sub.lng, nextSub.lat, nextSub.lng) ?? 0;
  const haversineVal = dist > 0
    ? Math.round(dist * ROAD_CIRCUITY * HEURISTIC_SPEED.WALKING.speed) + HEURISTIC_SPEED.WALKING.buffer
    : 0;

  if (!env.GOOGLE_MAPS_API_KEY) return { mins: haversineVal, fromGmaps: false };

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration',
      },
      body: JSON.stringify({
        origin:      { location: { latLng: { latitude: sub.lat, longitude: sub.lng } } },
        destination: { location: { latLng: { latitude: nextSub.lat, longitude: nextSub.lng } } },
        travelMode: 'WALK',
      }),
    });
    if (res.ok) {
      const data = await res.json() as any;
      const duration = data.routes?.[0]?.duration;
      if (duration) {
        const secs = parseInt(String(duration));
        if (!isNaN(secs) && secs > 0) {
          return { mins: Math.ceil(secs / 60), fromGmaps: true };
        }
      }
    }
  } catch { /* fall through */ }

  return { mins: haversineVal, fromGmaps: false };
}

async function placeInGap(
  gap: GapSlot,
  item: any,
  stayDuration: number,
  windowStart: number,
  windowEnd: number,
  statements: any[],
  metaStatements: any[],
  env: any
): Promise<boolean> {
  let travelMins: number;
  try {
    travelMins = await calcTravelMins(gap, item, statements, metaStatements, env);
  } catch (e) {
    if (e instanceof MissingTransportError) {
      travelMins = 0; // no transport info → assume immediate adjacency
    } else {
      throw e;
    }
  }
  const startMins  = roundUpTo30(Math.max(gap.cursor + travelMins, windowStart));
  const endMins    = startMins + stayDuration;

  if (startMins < windowEnd && endMins <= gap.end) {
    statements.push(
      env.DB.prepare(`UPDATE Itineraries SET start_time = ?, end_time = ?, sync_conflict_warning = null WHERE id = ?`)
        .bind(minsToTime(startMins), minsToTime(endMins), item.id)
    );
    gap.cursor  = endMins;
    gap.lastLat = item.lat;
    gap.lastLng = item.lng;
    gap.lastItem = item;
    const placeMsg = `[place] ${item.title}: ${minsToTime(startMins)}~${minsToTime(endMins)} (travel=${travelMins}min, gap=${minsToTime(gap.start)}~${minsToTime(gap.end)})`;
    _log.push(placeMsg); console.log(placeMsg);
    return true;
  }
  const skipMsg = `[skip] ${item.title}: window=${minsToTime(windowStart)}~${minsToTime(windowEnd)}, need start=${minsToTime(gap.cursor + travelMins)}, end=${minsToTime(gap.cursor + travelMins + stayDuration)}, gap_end=${minsToTime(gap.end)}`;
  _log.push(skipMsg); console.log(skipMsg);
  return false;
}

/**
 * Sorts items by nearest-neighbor greedy algorithm starting from anchorLat/anchorLng.
 * Items without coords are appended at the end in original order.
 */
function sortByNearestNeighbor(items: any[], anchorLat: number | null, anchorLng: number | null): any[] {
  const withCoords = items.filter(i => i.lat && i.lng);
  const noCoords   = items.filter(i => !i.lat || !i.lng);

  const ordered: any[] = [];
  const remaining = [...withCoords];
  let curLat = anchorLat;
  let curLng = anchorLng;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = (curLat && curLng)
        ? (getDistanceKm(curLat, curLng, remaining[i].lat, remaining[i].lng) ?? Infinity)
        : Infinity;
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    const picked = remaining.splice(bestIdx, 1)[0];
    ordered.push(picked);
    curLat = picked.lat;
    curLng = picked.lng;
  }

  return [...ordered, ...noCoords];
}

/**
 * Returns a numeric sort key for priority ordering within a gap:
 * - Narrower preferred window → smaller value (higher priority)
 * - Longer duration → higher priority within same window width (tiebreak via -duration)
 */
function prioritySortKey(item: any, dateStr: string): number {
  const pref = getPreferredWindow(item, dateStr);
  const windowWidth = pref.end - pref.start;
  const duration = parseInt(item.stay_duration) || 60;
  return windowWidth * 10000 - duration;
}

/**
 * Sorts candidates into three tiers:
 * 1. Constrained (window ≤ 6h) — most restricted, place first
 * 2. Long-duration (stay > 90min) — need large gaps, place early
 * 3. Flexible — short items, sorted by proximity
 * Within each tier, nearest-neighbor ordering is applied.
 */
function sortByPriorityGroups(items: any[], anchorLat: number | null, anchorLng: number | null, dateStr: string): any[] {
  const constrained = items.filter(i => {
    const pref = getPreferredWindow(i, dateStr);
    return (pref.end - pref.start) <= 6 * 60;
  });
  const remaining = items.filter(i => {
    const pref = getPreferredWindow(i, dateStr);
    return (pref.end - pref.start) > 6 * 60;
  });
  const longDuration = remaining.filter(i => (parseInt(i.stay_duration) || 60) > 90);
  const flexible = remaining.filter(i => (parseInt(i.stay_duration) || 60) <= 90);

  // Sort constrained by priority key (narrowest window first), then nearest-neighbor within
  constrained.sort((a, b) => prioritySortKey(a, dateStr) - prioritySortKey(b, dateStr));

  return [
    ...sortByNearestNeighbor(constrained, anchorLat, anchorLng),
    ...sortByNearestNeighbor(longDuration, anchorLat, anchorLng),
    ...sortByNearestNeighbor(flexible, anchorLat, anchorLng),
  ];
}

export async function optimizeDailyItinerary(env: any, tripId: number, dateStr: string): Promise<string[]> {
  _log = [];
  const { results: rawItems } = await env.DB.prepare(`
    SELECT * FROM Itineraries WHERE trip_id = ? AND date = ?
  `).bind(tripId, dateStr).all();

  if (rawItems.length === 0) return _log;

  const statements: any[] = [];
  const metaStatements: any[] = [];

  const fixedItems = (rawItems as any[])
    .filter(i => i.is_time_fixed === 1)
    .sort((a: any, b: any) => timeToMins(a.start_time) - timeToMins(b.start_time));

  const smartItems = (rawItems as any[]).filter(i => i.is_time_fixed !== 1);

  for (const item of fixedItems) {
    statements.push(env.DB.prepare(`UPDATE Itineraries SET sync_conflict_warning = null WHERE id = ?`).bind(item.id));
  }

  _log.push(`[date] ${dateStr}: ${fixedItems.length} fixed, ${smartItems.length} smart`);
  fixedItems.forEach(f => _log.push(`  [fixed] ${f.title} ${f.start_time}~${f.end_time}`));
  smartItems.forEach(s => _log.push(`  [smart] ${s.title} mode=${s.next_transport_mode} time=${s.next_transport_time}`));

  if (smartItems.length === 0) {
    if (statements.length > 0) await env.DB.batch(statements);
    return _log;
  }

  // Build free time gaps between fixed items.
  // lastItem is set to the preceding fixed block so calcTravelMins can measure
  // travel from a fixed activity to the first smart activity placed in the gap.
  const gaps: GapSlot[] = [];
  let prevEnd   = DAY_START;
  let prevLat:  number | null = null;
  let prevLng:  number | null = null;
  let prevBlock: any | null   = null;

  for (const block of fixedItems) {
    const blockStart = timeToMins(block.start_time);
    if (blockStart > prevEnd) {
      gaps.push({ start: prevEnd, end: blockStart, cursor: prevEnd, lastLat: prevLat, lastLng: prevLng, lastItem: prevBlock });
    }
    prevEnd   = timeToMins(block.end_time || block.start_time); // guard against missing end_time
    prevLat   = block.lat;
    prevLng   = block.lng;
    prevBlock = block;
  }
  if (prevEnd < DAY_END) {
    gaps.push({ start: prevEnd, end: DAY_END, cursor: prevEnd, lastLat: prevLat, lastLng: prevLng, lastItem: prevBlock });
  }

  if (gaps.length === 0) {
    for (const item of smartItems) {
      statements.push(
        env.DB.prepare(`UPDATE Itineraries SET start_time = '', end_time = '', sync_conflict_warning = ? WHERE id = ?`)
          .bind('⚠️ 無法插入，固定行程已佔滿當天時段', item.id)
      );
    }
    await env.DB.batch(statements);
    return _log;
  }

  _log.push(`[gaps] ${gaps.length} gap(s): ${gaps.map(g => `${minsToTime(g.start)}~${minsToTime(g.end)}(last=${g.lastItem?.title ?? 'none'})`).join(', ')}`);

  const unplaced = new Set(smartItems.map((_: any, idx: number) => idx));

  // Pass 1: preferred-window placement with nearest-neighbor ordering per gap
  for (const gap of gaps) {
    const candidates: any[] = [];
    for (const idx of unplaced) {
      const item = smartItems[idx];
      const stayDuration = parseInt(item.stay_duration) || 60;
      const pref = getPreferredWindow(item, dateStr);
      const winStart = Math.max(pref.start, gap.start);
      const winEnd   = Math.min(pref.end,   gap.end);
      if (winEnd - winStart >= stayDuration) candidates.push(item);
    }

    const sorted = sortByPriorityGroups(candidates, gap.lastLat, gap.lastLng, dateStr);

    for (const item of sorted) {
      const idx = smartItems.indexOf(item);
      if (!unplaced.has(idx)) continue;
      const stayDuration = parseInt(item.stay_duration) || 60;
      const pref = getPreferredWindow(item, dateStr);
      const winStart = Math.max(pref.start, gap.start);
      const winEnd   = Math.min(pref.end,   gap.end);
      if (await placeInGap(gap, item, stayDuration, winStart, winEnd, statements, metaStatements, env)) {
        unplaced.delete(idx);
      }
    }
  }

  // Pass 2: preferred-window first, fall back to full gap only if no window overlap
  for (const gap of gaps) {
    const candidates = [...unplaced].map(idx => smartItems[idx]);
    const sorted = sortByPriorityGroups(candidates, gap.lastLat, gap.lastLng, dateStr);

    for (const item of sorted) {
      const idx = smartItems.indexOf(item);
      if (!unplaced.has(idx)) continue;
      const stayDuration = parseInt(item.stay_duration) || 60;
      const pref = getPreferredWindow(item, dateStr);
      const winStart = Math.max(pref.start, gap.start);
      const winEnd   = Math.min(pref.end,   gap.end);
      const hasOverlap = winEnd - winStart >= stayDuration;
      const placed = hasOverlap
        ? await placeInGap(gap, item, stayDuration, winStart, winEnd, statements, metaStatements, env)
        : false;
      if (placed) {
        unplaced.delete(idx);
      } else if (await placeInGap(gap, item, stayDuration, gap.start, gap.end, statements, metaStatements, env)) {
        unplaced.delete(idx);
      }
    }
  }

  for (const idx of unplaced) {
    const item = smartItems[idx];
    statements.push(
      env.DB.prepare(`UPDATE Itineraries SET start_time = '', end_time = '', sync_conflict_warning = ? WHERE id = ?`)
        .bind('⚠️ 無法插入，可用時間不足', item.id)
    );
  }

  // Gap post-pass: calculate travel from the last smart item in each gap to the
  // immediately following fixed item. Without this, the last smart item before a
  // fixed boundary (e.g., 逢甲夜市 → 返回黑金文旅) would never get its auto_time set.
  // Also shifts the last smart item earlier if it would end too late to travel there.
  for (const gap of gaps) {
    const lastSmart = gap.lastItem;
    if (!lastSmart || lastSmart.next_transport_time !== 'auto') continue;
    const nextFixed = fixedItems.find((b: any) => timeToMins(b.start_time) === gap.end);
    if (!nextFixed) continue;
    try {
      const travelMins = await calcTravelMins(gap, nextFixed, statements, metaStatements, env);
      // If the last smart item ends too late to make it to the next fixed item, shift it earlier.
      const needToLeaveBy = gap.end - travelMins;
      if (gap.cursor > needToLeaveBy) {
        const stayDuration = parseInt(lastSmart.stay_duration) || 60;
        const newEnd   = needToLeaveBy;
        const newStart = newEnd - stayDuration;
        if (newStart >= gap.start) {
          statements.push(env.DB.prepare(
            `UPDATE Itineraries SET start_time = ?, end_time = ? WHERE id = ?`
          ).bind(minsToTime(newStart), minsToTime(newEnd), lastSmart.id));
          _log.push(`[shift-back] ${lastSmart.title}: ${minsToTime(newStart)}~${minsToTime(newEnd)} (travel=${travelMins}min to ${nextFixed.title})`);
        }
      }
    } catch { /* skip if no coords or transport info */ }
  }

  if (statements.length > 0) await env.DB.batch(statements);
  // Metadata columns (migration 0003) — batch separately; if production DB is missing the
  // columns this fails gracefully without rolling back the critical updates above.
  if (metaStatements.length > 0) await env.DB.batch(metaStatements).catch(() => {});

  // Sub-item scheduling: assign start/end times to sub-items with duration > 0
  const allScheduled = [
    ...fixedItems,
    ...smartItems.filter((_: any, idx: number) => !unplaced.has(idx)),
  ];
  const subStatements: any[] = [];

  for (const parent of allScheduled) {
    const { results: updatedRows } = await env.DB.prepare(
      'SELECT start_time, end_time, lat, lng FROM Itineraries WHERE id = ?'
    ).bind(parent.id).all();
    const updated = (updatedRows as any[])[0];
    if (!updated?.start_time) continue;

    const { results: subs } = await env.DB.prepare(
      'SELECT * FROM SubItemItineraries WHERE itinerary_id = ? AND duration > 0 ORDER BY display_order, id'
    ).bind(parent.id).all();
    if ((subs as any[]).length === 0) continue;

    const sorted = sortByNearestNeighbor(
      (subs as any[]).filter((s: any) => s.lat && s.lng),
      updated.lat ?? null,
      updated.lng ?? null,
    ).concat((subs as any[]).filter((s: any) => !s.lat || !s.lng));

    let cursor = timeToMins(updated.start_time as string);
    const parentEnd = timeToMins(updated.end_time as string);

    for (let si = 0; si < (sorted as any[]).length; si++) {
      const sub = (sorted as any[])[si];
      const nextSub = (sorted as any[])[si + 1];
      const dur = parseInt(String((sub as any).duration || '0')) || 0;
      const st = minsToTime(cursor);
      const et = minsToTime(Math.min(cursor + dur, parentEnd));

      // Use manually-set value if available; otherwise query Google Maps (Haversine fallback)
      let walkMins = 0;
      let saveWalk = false;
      if ((sub as any).next_walk_mins) {
        walkMins = parseInt(String((sub as any).next_walk_mins));
      } else if (nextSub) {
        const result = await calcSubWalkMins(sub, nextSub, env);
        walkMins = result.mins;
        saveWalk = result.fromGmaps; // persist only when we have a real Google Maps value
      }

      cursor += dur + walkMins;
      subStatements.push(
        env.DB.prepare('UPDATE SubItemItineraries SET start_time = ?, end_time = ? WHERE id = ?')
          .bind(st, et, (sub as any).id)
      );
      if (saveWalk) {
        subStatements.push(
          env.DB.prepare('UPDATE SubItemItineraries SET next_walk_mins = ? WHERE id = ?')
            .bind(walkMins, (sub as any).id)
        );
      }
    }
  }

  if (subStatements.length > 0) await env.DB.batch(subStatements);
  return _log;
}
