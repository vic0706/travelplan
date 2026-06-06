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

const DAY_START = 9 * 60;   // 09:00
const DAY_END   = 22 * 60;  // 22:00

/**
 * Returns the preferred [start, end] window (in minutes from midnight) for a smart item.
 * Priority: opening_hours for that weekday > keyword inference (title/tags) > anytime
 */
function getPreferredWindow(item: any, dateStr: string): { start: number; end: number } {
  // 1. Try opening_hours from Google Places
  if (item.opening_hours) {
    try {
      const oh = JSON.parse(item.opening_hours);
      if (Array.isArray(oh.periods) && oh.periods.length > 0) {
        const only = oh.periods[0];
        if (oh.periods.length === 1 && only.open?.day === 0 && only.open?.hour === 0 && !only.close) {
          return { start: DAY_START, end: DAY_END };
        }
        const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
        const period = oh.periods.find((p: any) => p.open?.day === dayOfWeek);
        if (period?.open) {
          const openMins  = (period.open.hour  || 0) * 60 + (period.open.minute  || 0);
          const closeMins = period.close
            ? (period.close.hour || 0) * 60 + (period.close.minute || 0)
            : 24 * 60;
          return {
            start: Math.max(DAY_START, openMins),
            end:   Math.min(DAY_END,   closeMins > openMins ? closeMins : DAY_END),
          };
        }
      }
    } catch { /* invalid JSON — fall through */ }
  }

  // 2. Keyword-based inference from title + tags
  const titleText = (item.title || '').toLowerCase();
  const tagsArr: string[] = (() => { try { return JSON.parse(item.tags || '[]'); } catch { return []; } })();
  const text = `${titleText} ${(item.notes || '')} ${tagsArr.join(' ')}`.toLowerCase();

  if (/早餐|早午餐|breakfast|brunch/.test(text)) return { start: 7 * 60,       end: 10 * 60 };
  if (/咖啡|cafe|coffee/.test(text))              return { start: 9 * 60,       end: 17 * 60 };
  if (/午餐|lunch|中餐/.test(text))               return { start: 11 * 60 + 30, end: 14 * 60 };
  if (/下午茶|afternoon tea/.test(text))          return { start: 14 * 60,      end: 17 * 60 };
  if (/夕陽|日落|sunset|落日/.test(text))         return { start: 16 * 60,      end: 20 * 60 };
  if (/晚餐|dinner|晚飯/.test(text))              return { start: 17 * 60,      end: 21 * 60 };
  if (/夜市|night market|酒吧|bar/.test(text))    return { start: 18 * 60,      end: 23 * 60 };

  // 3. anytime
  return { start: DAY_START, end: DAY_END };
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
async function calcTravelMins(gap: GapSlot, item: any, statements: any[], env: any): Promise<number> {
  if (!gap.lastItem) return 0;
  const prev = gap.lastItem;
  const mode = (prev.next_transport_mode || '').toUpperCase();

  if (prev.next_transport_time === 'auto') {
    const hasCoords = !!(gap.lastLat && gap.lastLng && item.lat && item.lng);
    let mins: number | null = null;

    if (hasCoords && env.GOOGLE_MAPS_API_KEY) {
      const travelMode = mode === 'WALKING'      ? 'WALK'
        : mode === 'BICYCLING'    ? 'BICYCLE'
        : mode === 'TRANSIT'      ? 'TRANSIT'
        : mode === 'MOTORCYCLING' ? 'TWO_WHEELER'
        : 'DRIVE';
      const cacheKey = `travel_time:${gap.lastLat!.toFixed(4)},${gap.lastLng!.toFixed(4)}:${item.lat.toFixed(4)},${item.lng.toFixed(4)}:${travelMode.toLowerCase()}`;
      const cached: number | null = await env.KV.get(cacheKey, 'json');
      if (cached !== null) {
        mins = cached;
      } else {
        try {
          const res = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
              'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status',
            },
            body: JSON.stringify({
              origins: [{ waypoint: { location: { latLng: { latitude: gap.lastLat, longitude: gap.lastLng } } } }],
              destinations: [{ waypoint: { location: { latLng: { latitude: item.lat, longitude: item.lng } } } }],
              travelMode,
            }),
          });
          if (res.ok) {
            const text = await res.text();
            const row = text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
              try { return JSON.parse(l); } catch { return null; }
            }).find((r: any) => r && r.originIndex === 0 && r.destinationIndex === 0);
            if (row?.duration) {
              const secs = parseInt(row.duration);
              if (!isNaN(secs)) {
                mins = Math.ceil(secs / 60);
                await env.KV.put(cacheKey, JSON.stringify(mins), { expirationTtl: 2592000 }); // 30 days
              }
            }
          }
        } catch { /* fall through to haversine */ }
      }
    }

    // Haversine fallback when API unavailable or failed
    if (mins === null && hasCoords) {
      const dist = getDistanceKm(gap.lastLat!, gap.lastLng!, item.lat, item.lng);
      if (dist !== null) {
        let speed = 2, buffer = 5;
        if (mode === 'WALKING')      { speed = 12; buffer = 2; }
        if (mode === 'BICYCLING')    { speed = 6;  buffer = 3; }
        if (mode === 'MOTORCYCLING') { speed = 2;  buffer = 3; }
        if (mode === 'TRANSIT')      { speed = 3;  buffer = 8; }
        mins = Math.ceil(dist * speed) + buffer;
      }
    }

    if (mins === null) {
      throw new MissingTransportError(prev.id, prev.title || String(prev.id));
    }

    statements.push(env.DB.prepare(`UPDATE Itineraries SET next_transport_auto_time = ? WHERE id = ?`).bind(mins, prev.id));
    return mins;
  }

  if (prev.next_transport_time) {
    const parsed = parseInt(prev.next_transport_time.replace(/\D/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }

  // No transport set → optimizer cannot calculate travel time
  throw new MissingTransportError(prev.id, prev.title || String(prev.id));
}

async function placeInGap(
  gap: GapSlot,
  item: any,
  stayDuration: number,
  windowStart: number,
  windowEnd: number,
  statements: any[],
  env: any
): Promise<boolean> {
  const travelMins = await calcTravelMins(gap, item, statements, env);
  const startMins  = Math.max(gap.cursor + travelMins, windowStart);
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
    return true;
  }
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

export async function optimizeDailyItinerary(env: any, tripId: number, dateStr: string) {
  const { results: rawItems } = await env.DB.prepare(`
    SELECT * FROM Itineraries WHERE trip_id = ? AND date = ?
  `).bind(tripId, dateStr).all();

  if (rawItems.length === 0) return;

  const statements: any[] = [];

  const fixedItems = (rawItems as any[])
    .filter(i => i.is_time_fixed === 1)
    .sort((a: any, b: any) => timeToMins(a.start_time) - timeToMins(b.start_time));

  const smartItems = (rawItems as any[]).filter(i => i.is_time_fixed !== 1);

  for (const item of fixedItems) {
    statements.push(env.DB.prepare(`UPDATE Itineraries SET sync_conflict_warning = null WHERE id = ?`).bind(item.id));
  }

  if (smartItems.length === 0) {
    if (statements.length > 0) await env.DB.batch(statements);
    return;
  }

  // Build free time gaps between fixed items
  const gaps: GapSlot[] = [];
  let prevEnd  = DAY_START;
  let prevLat: number | null = null;
  let prevLng: number | null = null;

  for (const block of fixedItems) {
    const blockStart = timeToMins(block.start_time);
    if (blockStart > prevEnd) {
      gaps.push({ start: prevEnd, end: blockStart, cursor: prevEnd, lastLat: prevLat, lastLng: prevLng, lastItem: null });
    }
    prevEnd = timeToMins(block.end_time);
    prevLat = block.lat;
    prevLng = block.lng;
  }
  if (prevEnd < DAY_END) {
    gaps.push({ start: prevEnd, end: DAY_END, cursor: prevEnd, lastLat: prevLat, lastLng: prevLng, lastItem: null });
  }

  if (gaps.length === 0) {
    for (const item of smartItems) {
      statements.push(
        env.DB.prepare(`UPDATE Itineraries SET start_time = '', end_time = '', sync_conflict_warning = ? WHERE id = ?`)
          .bind('⚠️ 無法插入，固定行程已佔滿當天時段', item.id)
      );
    }
    await env.DB.batch(statements);
    return;
  }

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

    const sorted = sortByNearestNeighbor(candidates, gap.lastLat, gap.lastLng);

    for (const item of sorted) {
      const idx = smartItems.indexOf(item);
      if (!unplaced.has(idx)) continue;
      const stayDuration = parseInt(item.stay_duration) || 60;
      const pref = getPreferredWindow(item, dateStr);
      const winStart = Math.max(pref.start, gap.start);
      const winEnd   = Math.min(pref.end,   gap.end);
      if (await placeInGap(gap, item, stayDuration, winStart, winEnd, statements, env)) {
        unplaced.delete(idx);
      }
    }
  }

  // Pass 2: fallback — any available gap, nearest-neighbor per gap
  for (const gap of gaps) {
    const candidates = [...unplaced].map(idx => smartItems[idx]);
    const sorted = sortByNearestNeighbor(candidates, gap.lastLat, gap.lastLng);

    for (const item of sorted) {
      const idx = smartItems.indexOf(item);
      if (!unplaced.has(idx)) continue;
      const stayDuration = parseInt(item.stay_duration) || 60;
      if (await placeInGap(gap, item, stayDuration, gap.start, gap.end, statements, env)) {
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

  if (statements.length > 0) await env.DB.batch(statements);
}
