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

export async function optimizeDailyItinerary(env: any, tripId: number, dateStr: string) {
  const { results: rawItems } = await env.DB.prepare(`
    SELECT * FROM Itineraries WHERE trip_id = ? AND date = ?
    ORDER BY id ASC
  `).bind(tripId, dateStr).all();
  if (rawItems.length === 0) return;

  const isAnchor = (item: any) => item.is_time_fixed === 1 || !!item.related_id;

  // Anchors = fixed-time items or booking-generated items; sorted by their assigned start_time
  const anchors = (rawItems as any[])
    .filter(isAnchor)
    .sort((a: any, b: any) => timeToMins(a.start_time || '00:00') - timeToMins(b.start_time || '00:00'));

  // Floating = AI-schedulable items; sorted by creation order (id)
  const floating = (rawItems as any[])
    .filter((i: any) => !isAnchor(i))
    .sort((a: any, b: any) => a.id - b.id);

  // Build merged list: greedily fill floating items into gaps between anchors.
  // Items are placed in the first gap that has enough room (id order preserved within each gap).
  const placed = new Set<number>();
  const merged: any[] = [];
  const estimateMins = (item: any) => (parseInt(item.stay_duration) || 60) + 15;

  let segEndMins = 9 * 60; // day starts at 09:00
  if (anchors.length > 0 && timeToMins(anchors[0].start_time) > 0) {
    segEndMins = Math.min(segEndMins, timeToMins(anchors[0].start_time));
  }
  // Reset to day start for gap computation
  segEndMins = 9 * 60;

  for (const anchor of anchors) {
    const gapEnd = timeToMins(anchor.start_time || '00:00');
    let gapCurrent = segEndMins;
    // Try floating items in id order; stop when one doesn't fit (preserves relative order)
    for (const fl of floating) {
      if (placed.has(fl.id)) continue;
      const needed = estimateMins(fl);
      if (gapCurrent + needed <= gapEnd) {
        merged.push(fl);
        placed.add(fl.id);
        gapCurrent += needed;
      }
      // Don't break — try all unplaced items in case a smaller one fits after a large one
    }
    merged.push(anchor);
    segEndMins = timeToMins(anchor.end_time || anchor.start_time || '00:00');
  }
  // Remaining unplaced floating items go after all anchors
  for (const fl of floating) {
    if (!placed.has(fl.id)) merged.push(fl);
  }

  // Linear scheduling pass on the merged list
  const statements: any[] = [];
  let currentMins = 9 * 60;
  let isCircuitBroken = false;

  const firstAnchor = anchors[0];
  if (firstAnchor && timeToMins(firstAnchor.start_time) > 0) {
    currentMins = Math.min(currentMins, timeToMins(firstAnchor.start_time));
  }

  for (let i = 0; i < merged.length; i++) {
    const item = merged[i];

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

    const prevItem = i > 0 ? merged[i - 1] : null;
    let transportMins = 0, transitionBuffer = 0;
    if (prevItem) {
      // Booking-generated items and fixed-time items don't need next_transport_mode to continue scheduling
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
      } else if (prevItem.next_transport_mode) {
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
