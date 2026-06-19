import { geminiScheduleDay, hashSmartItems } from './geminiScheduler';

let _log: string[] = [];

const ROAD_CIRCUITY = 1.3;

const HEURISTIC_SPEED: Record<string, { speed: number; buffer: number }> = {
  DRIVING:      { speed: 1.2, buffer: 8  },
  WALKING:      { speed: 13,  buffer: 3  },
  BICYCLING:    { speed: 5,   buffer: 5  },
  MOTORCYCLING: { speed: 1.2, buffer: 5  },
  TRANSIT:      { speed: 3.0, buffer: 12 },
};

const TRANSPORT_CATS = new Set(['FLIGHT','TRAIN','FERRY','BUS','PRIVATE_TRANSFER','RENTAL','TRANSPORTATION']);

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

const DAY_START = 9 * 60; // 09:00

class MissingTransportError extends Error {
  constructor(public itemId: number, public itemTitle: string) {
    super(`MISSING_TRANSPORT:${itemId}`);
    this.name = 'MissingTransportError';
  }
}

/**
 * Calculates travel time from prevItem to nextItem.
 * Handles 'auto' mode (Google Maps / haversine), manual minutes, and throws
 * MissingTransportError when no transport info is configured.
 * For transport-category items (flights, trains), uses arrival_lat/lng as origin.
 */
async function computeTravelMins(
  prevItem: any,
  nextItem: any,
  env: any,
  statements: any[],
  metaStatements: any[]
): Promise<number> {
  if (!prevItem) return 0;

  const rawMode = (prevItem.next_transport_mode || '').toUpperCase();

  // For transport items (flights, trains), departure from arrival coords
  const isTransport = TRANSPORT_CATS.has((prevItem.category || prevItem.type || '').toUpperCase());
  const fromLat: number | null = (isTransport && prevItem.arrival_lat != null) ? prevItem.arrival_lat : (prevItem.lat ?? null);
  const fromLng: number | null = (isTransport && prevItem.arrival_lng != null) ? prevItem.arrival_lng : (prevItem.lng ?? null);

  if (prevItem.next_transport_time === 'auto') {
    const toLat: number | null = nextItem.lat ?? null;
    const toLng: number | null = nextItem.lng ?? null;
    const hasCoords = !!(fromLat && fromLng && toLat && toLng);
    let mins: number | null = null;
    let resolvedMode = rawMode || 'DRIVING';
    let haversineVal: number | null = null;

    if (rawMode === 'AUTO' && hasCoords) {
      const estimates = haversineAll(fromLat!, fromLng!, toLat!, toLng!);
      const fastest = Object.entries(estimates).sort((a, b) => a[1] - b[1])[0];
      resolvedMode = fastest[0];
      haversineVal = fastest[1];
    } else if (hasCoords) {
      const h = HEURISTIC_SPEED[resolvedMode] || HEURISTIC_SPEED.DRIVING;
      const dist = getDistanceKm(fromLat!, fromLng!, toLat!, toLng!) ?? 0;
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
            origin:      { location: { latLng: { latitude: fromLat, longitude: fromLng } } },
            destination: { location: { latLng: { latitude: toLat, longitude: toLng } } },
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

    if (mins === null && hasCoords && haversineVal !== null) {
      mins = haversineVal;
    }

    if (mins === null) {
      const msg = `[travel-skip] ${prevItem.title} → ${nextItem.title}: no coords or API error`;
      _log.push(msg);
      throw new MissingTransportError(prevItem.id, prevItem.title || String(prevItem.id));
    }

    const travelMsg = `[travel] ${prevItem.title}(id=${prevItem.id}) → ${nextItem.title}: mode=${resolvedMode}, haversine=${haversineVal}min, gmaps=${gmapsLog}, final=${mins}min`;
    _log.push(travelMsg);

    statements.push(env.DB.prepare(
      `UPDATE Itineraries SET next_transport_auto_time = ? WHERE id = ?`
    ).bind(mins, prevItem.id));
    metaStatements.push(env.DB.prepare(
      `UPDATE Itineraries SET next_transport_resolved_mode = ?, next_transport_haversine_time = ? WHERE id = ?`
    ).bind(resolvedMode, haversineVal ?? mins, prevItem.id));
    return mins;
  }

  if (prevItem.next_transport_time) {
    const parsed = parseInt(prevItem.next_transport_time.replace(/\D/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }

  throw new MissingTransportError(prevItem.id, prevItem.title || String(prevItem.id));
}

/**
 * Returns Google Maps walking time (WALK mode) between two sub-items.
 * Falls back to haversine if API unavailable.
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

/**
 * Simple sequential scheduler: chains smart items in display_order sequence.
 * Each item starts immediately after the previous one ends (+ travel time).
 * Fixed items (is_time_fixed=1) keep their times and act as anchors.
 */
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

  const smartItems = (rawItems as any[])
    .filter(i => i.is_time_fixed !== 1 && !i.backup_for_id)
    .sort((a: any, b: any) => {
      const aOrder = a.display_order ?? 9999;
      const bOrder = b.display_order ?? 9999;
      return aOrder - bOrder;
    });

  // Keep fixed items at their times, just clear stale warnings
  for (const item of fixedItems) {
    statements.push(env.DB.prepare(`UPDATE Itineraries SET sync_conflict_warning = null WHERE id = ?`).bind(item.id));
    if (item.next_transport_time === 'auto') {
      statements.push(env.DB.prepare(`UPDATE Itineraries SET next_transport_auto_time = '' WHERE id = ?`).bind(item.id));
    }
  }

  _log.push(`[date] ${dateStr}: ${fixedItems.length} fixed, ${smartItems.length} smart`);
  fixedItems.forEach(f => _log.push(`  [fixed] ${f.title} ${f.start_time}~${f.end_time}`));
  smartItems.forEach(s => _log.push(`  [smart] ${s.title} order=${s.display_order}`));

  if (smartItems.length === 0) {
    if (statements.length > 0) await env.DB.batch(statements);
    return _log;
  }

  // Sequential pass: place smart items one by one in display_order,
  // advancing cursor past any fixed items that anchor before the current position.
  let cursor = DAY_START;
  let prevItem: any = null;
  const fixedQueue = [...fixedItems];

  for (const smartItem of smartItems) {
    // Advance past fixed anchors that start at or before the current cursor
    while (fixedQueue.length > 0 && timeToMins(fixedQueue[0].start_time) <= cursor) {
      const fixed = fixedQueue.shift()!;
      cursor = Math.max(cursor, timeToMins(fixed.end_time || fixed.start_time));
      prevItem = fixed;
    }

    let travel = 0;
    try {
      travel = await computeTravelMins(prevItem, smartItem, env, statements, metaStatements);
    } catch {
      _log.push(`[travel-skip] no transport info: ${prevItem?.title ?? 'start'} → ${smartItem.title}`);
    }

    const start = cursor + travel;
    const stayDuration = parseInt(smartItem.stay_duration) || 60;
    const end = start + stayDuration;

    statements.push(
      env.DB.prepare(`UPDATE Itineraries SET start_time = ?, end_time = ?, sync_conflict_warning = null WHERE id = ?`)
        .bind(minsToTime(start), minsToTime(end), smartItem.id)
    );
    _log.push(`[place] ${smartItem.title}: ${minsToTime(start)}~${minsToTime(end)} (travel=${travel}min)`);

    cursor = end;
    prevItem = smartItem;
  }

  // Clear warnings on remaining fixed items that come after all smart items
  for (const fixed of fixedQueue) {
    statements.push(env.DB.prepare(`UPDATE Itineraries SET sync_conflict_warning = null WHERE id = ?`).bind(fixed.id));
  }

  // Fixed→fixed transport time pass
  for (let fi = 0; fi < fixedItems.length - 1; fi++) {
    const curr = fixedItems[fi];
    const next = fixedItems[fi + 1];
    if (curr.next_transport_time !== 'auto') continue;
    if (!curr.lat && !curr.arrival_lat) continue;
    try {
      await computeTravelMins(curr, next, env, statements, metaStatements);
    } catch { /* skip if calculation fails */ }
  }

  if (statements.length > 0) await env.DB.batch(statements);
  if (metaStatements.length > 0) await env.DB.batch(metaStatements).catch(() => {});

  // Sub-item scheduling: assign start/end times to sub-items in display_order
  const subStatements: any[] = [];

  for (const parent of [...fixedItems, ...smartItems]) {
    const { results: updatedRows } = await env.DB.prepare(
      'SELECT start_time, end_time, lat, lng FROM Itineraries WHERE id = ?'
    ).bind(parent.id).all();
    const updated = (updatedRows as any[])[0];
    if (!updated?.start_time) continue;

    const { results: subs } = await env.DB.prepare(
      'SELECT * FROM SubItemItineraries WHERE itinerary_id = ? AND duration > 0 ORDER BY display_order, id'
    ).bind(parent.id).all();
    if ((subs as any[]).length === 0) continue;

    let subCursor = timeToMins(updated.start_time as string);
    const parentEnd = timeToMins(updated.end_time as string);

    for (let si = 0; si < (subs as any[]).length; si++) {
      const sub = (subs as any[])[si];
      const nextSub = (subs as any[])[si + 1];
      const dur = parseInt(String(sub.duration || '0')) || 0;
      const st = minsToTime(subCursor);
      const et = minsToTime(Math.min(subCursor + dur, parentEnd));

      let walkMins = 0;
      let saveWalk = false;
      if (sub.next_walk_mins) {
        walkMins = parseInt(String(sub.next_walk_mins));
      } else if (nextSub) {
        const result = await calcSubWalkMins(sub, nextSub, env);
        walkMins = result.mins;
        saveWalk = result.fromGmaps;
      }

      subCursor += dur + walkMins;
      subStatements.push(
        env.DB.prepare('UPDATE SubItemItineraries SET start_time = ?, end_time = ? WHERE id = ?')
          .bind(st, et, sub.id)
      );
      if (saveWalk) {
        subStatements.push(
          env.DB.prepare('UPDATE SubItemItineraries SET next_walk_mins = ? WHERE id = ?')
            .bind(walkMins, sub.id)
        );
      }
    }
  }

  if (subStatements.length > 0) await env.DB.batch(subStatements);
  return _log;
}

/**
 * Gemini-powered daily optimizer.
 * Sends fixed + smart items to Gemini API which decides start/end times for smart items,
 * then writes those times to DB and runs the transport-time pass using existing logic.
 * Falls back gracefully when API fails — caller should catch and fallback to optimizeDailyItinerary.
 */
export async function geminiOptimizeDay(env: any, tripId: number, dateStr: string): Promise<string[]> {
  _log = [];

  const { results: rawItems } = await env.DB.prepare(
    `SELECT * FROM Itineraries WHERE trip_id = ? AND date = ?`
  ).bind(tripId, dateStr).all();

  if (rawItems.length === 0) return _log;

  const fixedItems = (rawItems as any[])
    .filter(i => i.is_time_fixed === 1)
    .sort((a: any, b: any) => timeToMins(a.start_time) - timeToMins(b.start_time));

  const smartItems = (rawItems as any[])
    .filter(i => i.is_time_fixed !== 1 && !i.backup_for_id)
    .sort((a: any, b: any) => {
      const aOrder = a.display_order ?? 9999;
      const bOrder = b.display_order ?? 9999;
      return aOrder - bOrder;
    });

  // Clear stale warnings and auto transport times on fixed items
  const preStmts: any[] = [];
  for (const item of fixedItems) {
    preStmts.push(env.DB.prepare(`UPDATE Itineraries SET sync_conflict_warning = null WHERE id = ?`).bind(item.id));
    if (item.next_transport_time === 'auto') {
      preStmts.push(env.DB.prepare(`UPDATE Itineraries SET next_transport_auto_time = '' WHERE id = ?`).bind(item.id));
    }
  }
  if (preStmts.length > 0) await env.DB.batch(preStmts);

  _log.push(`[gemini] ${dateStr}: ${fixedItems.length} fixed, ${smartItems.length} smart`);

  if (smartItems.length === 0) return _log;

  // KV cache: if smart items unchanged, reuse previous Gemini result
  const itemsHash = hashSmartItems(smartItems);
  const cacheKey = `gemini_schedule:${tripId}:${dateStr}:${itemsHash}`;

  let scheduled: Array<{ id: number; start_time: string; end_time: string }>;
  const cached = await env.KV.get(cacheKey, 'json') as any;

  if (cached) {
    _log.push(`[gemini] cache hit (${dateStr})`);
    scheduled = cached;
  } else {
    scheduled = await geminiScheduleDay(env, dateStr, fixedItems, smartItems);
    _log.push(`[gemini] API scheduled ${scheduled.length}/${smartItems.length} items`);
    await env.KV.put(cacheKey, JSON.stringify(scheduled), { expirationTtl: 3600 });
  }

  // Apply Gemini-assigned times to DB
  const applyStmts: any[] = [];
  const scheduledIds = new Set(scheduled.map(r => r.id));
  for (const r of scheduled) {
    applyStmts.push(
      env.DB.prepare(`UPDATE Itineraries SET start_time = ?, end_time = ?, sync_conflict_warning = null WHERE id = ? AND trip_id = ?`)
        .bind(r.start_time, r.end_time, r.id, tripId)
    );
  }
  for (const item of smartItems) {
    if (!scheduledIds.has(item.id)) {
      applyStmts.push(
        env.DB.prepare(`UPDATE Itineraries SET start_time = '', end_time = '', sync_conflict_warning = ? WHERE id = ?`)
          .bind('⚠️ 無法插入，AI 未安排時間', item.id)
      );
    }
  }
  if (applyStmts.length > 0) await env.DB.batch(applyStmts);

  // Re-fetch with updated times, then compute transport times between consecutive items
  const { results: updatedItems } = await env.DB.prepare(
    `SELECT * FROM Itineraries WHERE trip_id = ? AND date = ?`
  ).bind(tripId, dateStr).all();

  const sortedAll = (updatedItems as any[])
    .filter(i => i.start_time && i.start_time !== '')
    .sort((a: any, b: any) => timeToMins(a.start_time) - timeToMins(b.start_time));

  const transportStmts: any[] = [];
  const transportMetaStmts: any[] = [];

  for (let i = 0; i < sortedAll.length - 1; i++) {
    const curr = sortedAll[i];
    const next = sortedAll[i + 1];
    if (curr.next_transport_time !== 'auto') continue;
    try {
      await computeTravelMins(curr, next, env, transportStmts, transportMetaStmts);
    } catch {
      _log.push(`[transport-skip] ${curr.title} → ${next.title}: no coords/mode`);
    }
  }

  if (transportStmts.length > 0) await env.DB.batch(transportStmts);
  if (transportMetaStmts.length > 0) await env.DB.batch(transportMetaStmts).catch(() => {});

  // Sub-item scheduling
  const subStatements: any[] = [];
  for (const parent of sortedAll) {
    const { results: updatedRows } = await env.DB.prepare(
      'SELECT start_time, end_time, lat, lng FROM Itineraries WHERE id = ?'
    ).bind(parent.id).all();
    const updated = (updatedRows as any[])[0];
    if (!updated?.start_time) continue;

    const { results: subs } = await env.DB.prepare(
      'SELECT * FROM SubItemItineraries WHERE itinerary_id = ? AND duration > 0 ORDER BY display_order, id'
    ).bind(parent.id).all();
    if ((subs as any[]).length === 0) continue;

    let subCursor = timeToMins(updated.start_time as string);
    const parentEnd = timeToMins(updated.end_time as string);

    for (let si = 0; si < (subs as any[]).length; si++) {
      const sub = (subs as any[])[si];
      const nextSub = (subs as any[])[si + 1];
      const dur = parseInt(String(sub.duration || '0')) || 0;
      const st = minsToTime(subCursor);
      const et = minsToTime(Math.min(subCursor + dur, parentEnd));

      let walkMins = 0;
      let saveWalk = false;
      if (sub.next_walk_mins) {
        walkMins = parseInt(String(sub.next_walk_mins));
      } else if (nextSub) {
        const result = await calcSubWalkMins(sub, nextSub, env);
        walkMins = result.mins;
        saveWalk = result.fromGmaps;
      }

      subCursor += dur + walkMins;
      subStatements.push(
        env.DB.prepare('UPDATE SubItemItineraries SET start_time = ?, end_time = ? WHERE id = ?')
          .bind(st, et, sub.id)
      );
      if (saveWalk) {
        subStatements.push(
          env.DB.prepare('UPDATE SubItemItineraries SET next_walk_mins = ? WHERE id = ?')
            .bind(walkMins, sub.id)
        );
      }
    }
  }

  if (subStatements.length > 0) await env.DB.batch(subStatements);
  return _log;
}
