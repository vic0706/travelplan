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

function nearestNeighborSort(items: any[], startLat: number, startLng: number): any[] {
  const withCoords = items.filter(it => it.lat && it.lng);
  const withoutCoords = items.filter(it => !it.lat || !it.lng).sort((a, b) => a.id - b.id);

  const sorted: any[] = [];
  let remaining = [...withCoords];
  let curLat = startLat;
  let curLng = startLng;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = getDistanceKm(curLat, curLng, remaining[i].lat, remaining[i].lng);
      const dist = d !== null ? d : Infinity;
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    const chosen = remaining[bestIdx];
    sorted.push(chosen);
    curLat = chosen.lat;
    curLng = chosen.lng;
    remaining.splice(bestIdx, 1);
  }

  return [...sorted, ...withoutCoords];
}

export async function optimizeDailyItinerary(env: any, tripId: number, dateStr: string) {
  const { results: items } = await env.DB.prepare(`
    SELECT * FROM Itineraries WHERE trip_id = ? AND date = ? ORDER BY id ASC
  `).bind(tripId, dateStr).all();
  if (items.length === 0) return;

  const isAnchor = (item: any) => item.is_time_fixed === 1 || !!item.related_id;

  const anchors: any[] = (items as any[]).filter(isAnchor).sort((a, b) => timeToMins(a.start_time) - timeToMins(b.start_time));
  const floating: any[] = (items as any[]).filter(it => !isAnchor(it));

  // Build merged list: fill gaps between anchors with nearest-neighbor floating items
  const merged: any[] = [];
  const placed = new Set<number>();

  const estimateMins = (item: any) => (parseInt(item.stay_duration) || 60) + 15;

  for (let ai = 0; ai < anchors.length; ai++) {
    const anchor = anchors[ai];
    const prevAnchor = ai > 0 ? anchors[ai - 1] : null;
    const gapStart = prevAnchor ? timeToMins(prevAnchor.end_time || prevAnchor.start_time) : 0;
    const gapEnd = timeToMins(anchor.start_time);
    const gapMins = gapEnd - gapStart;

    const prevLat = prevAnchor?.lat || 0;
    const prevLng = prevAnchor?.lng || 0;

    const unplaced = floating.filter(it => !placed.has(it.id));
    const sorted = nearestNeighborSort(unplaced, prevLat, prevLng);

    let usedMins = 0;
    for (const fit of sorted) {
      const needed = estimateMins(fit);
      if (usedMins + needed <= gapMins) {
        merged.push(fit);
        placed.add(fit.id);
        usedMins += needed;
      }
    }

    merged.push(anchor);
  }

  // Append remaining floating sorted by NN from last anchor position
  const lastAnchor = anchors[anchors.length - 1];
  const tailLat = lastAnchor?.lat || 0;
  const tailLng = lastAnchor?.lng || 0;
  const remaining = floating.filter(it => !placed.has(it.id));
  const sortedRemaining = nearestNeighborSort(remaining, tailLat, tailLng);
  for (const fit of sortedRemaining) {
    merged.push(fit);
  }

  const statements: any[] = [];
  let currentMins = 9 * 60;
  let isCircuitBroken = false;

  const firstFixed = anchors.find(a => a.is_time_fixed === 1 && timeToMins(a.start_time) > 0);
  if (firstFixed) currentMins = Math.min(currentMins, timeToMins(firstFixed.start_time));

  for (let i = 0; i < merged.length; i++) {
    const item = merged[i] as any;

    if (isAnchor(item)) {
      currentMins = timeToMins(item.end_time || item.start_time);
      isCircuitBroken = false;
      if (item.is_time_fixed === 1) {
        statements.push(env.DB.prepare(`UPDATE Itineraries SET sync_conflict_warning = null WHERE id = ?`).bind(item.id));
      }
      continue;
    }

    if (isCircuitBroken) {
      statements.push(env.DB.prepare(`UPDATE Itineraries SET start_time = '', end_time = '', sync_conflict_warning = ? WHERE id = ?`).bind('⚠️ 前方交通未設定，AI 暫停排程', item.id));
      continue;
    }

    const prevItem = i > 0 ? (merged[i - 1] as any) : null;
    let transportMins = 0, transitionBuffer = 0;

    if (prevItem) {
      const prevNeedsTransportMode = !prevItem.related_id && prevItem.is_time_fixed !== 1;
      if (prevNeedsTransportMode && !prevItem.next_transport_mode) {
        isCircuitBroken = true;
        statements.push(env.DB.prepare(`UPDATE Itineraries SET start_time = '', end_time = '', sync_conflict_warning = ? WHERE id = ?`).bind('⚠️ 請設定前一站交通方式', item.id));
        continue;
      }
      if (prevItem.next_transport_time === 'auto') {
        const dist = getDistanceKm(prevItem.lat, prevItem.lng, item.lat, item.lng);
        let speedMultiplier = 4, buffer = 5;
        if (prevItem.next_transport_mode === 'WALKING') { speedMultiplier = 12; buffer = 2; }
        else if (prevItem.next_transport_mode === 'TRANSIT') { speedMultiplier = 4; buffer = 10; }
        transportMins = dist !== null ? Math.ceil(dist * speedMultiplier) + buffer : 15;
        transitionBuffer = 5;
        statements.push(env.DB.prepare(`UPDATE Itineraries SET next_transport_auto_time = ? WHERE id = ?`).bind(transportMins, prevItem.id));
      } else {
        transportMins = parseInt(prevItem.next_transport_time?.replace(/\D/g, '')) || 15;
      }
    }

    const startMins = currentMins + transportMins + transitionBuffer;
    const stayDuration = parseInt(item.stay_duration) || 60;
    const endMins = startMins + stayDuration;
    let warning = null;
    const nextFixed = merged.slice(i + 1).find((x: any) => x.is_time_fixed === 1);
    if (nextFixed && endMins > timeToMins(nextFixed.start_time)) warning = '⚠️ 停留時間與後方固定行程重疊';
    statements.push(env.DB.prepare(`UPDATE Itineraries SET start_time = ?, end_time = ?, sync_conflict_warning = ? WHERE id = ?`).bind(minsToTime(startMins), minsToTime(endMins), warning, item.id));
    currentMins = endMins;
  }

  if (statements.length > 0) await env.DB.batch(statements);
}
