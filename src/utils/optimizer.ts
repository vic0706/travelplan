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
  const { results: items } = await env.DB.prepare(`
    SELECT * FROM Itineraries WHERE trip_id = ? AND date = ?
    ORDER BY CASE WHEN start_time = '' OR start_time IS NULL THEN 1 ELSE 0 END, start_time ASC, id ASC
  `).bind(tripId, dateStr).all();
  if (items.length === 0) return;
  const statements: any[] = [];
  let currentMins = 9 * 60;
  let isCircuitBroken = false;
  const firstFixed = items.find((item: any) => item.is_time_fixed === 1);
  if (firstFixed && timeToMins(firstFixed.start_time) > 0) currentMins = Math.min(currentMins, timeToMins(firstFixed.start_time));
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as any;
    if (item.is_time_fixed === 1) {
      currentMins = timeToMins(item.end_time); isCircuitBroken = false;
      statements.push(env.DB.prepare(`UPDATE Itineraries SET sync_conflict_warning = null WHERE id = ?`).bind(item.id));
      continue;
    }
    if (isCircuitBroken) {
      statements.push(env.DB.prepare(`UPDATE Itineraries SET start_time = '', end_time = '', sync_conflict_warning = ? WHERE id = ?`).bind('⚠️ 前方交通未設定，AI 暫停排程', item.id));
      continue;
    }
    const prevItem = i > 0 ? (items[i - 1] as any) : null;
    let transportMins = 0, transitionBuffer = 0;
    if (prevItem) {
      // Booking-generated items (related_id set) represent actual bookings and don't need next_transport_mode
      const prevIsBookingCard = !!prevItem.related_id;
      if (!prevIsBookingCard && !prevItem.next_transport_mode) {
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
    const nextFixed = items.slice(i + 1).find((x: any) => x.is_time_fixed === 1);
    if (nextFixed && endMins > timeToMins(nextFixed.start_time)) warning = '⚠️ 停留時間與後方固定行程重疊';
    statements.push(env.DB.prepare(`UPDATE Itineraries SET start_time = ?, end_time = ?, sync_conflict_warning = ? WHERE id = ?`).bind(minsToTime(startMins), minsToTime(endMins), warning, item.id));
    currentMins = endMins;
  }
  if (statements.length > 0) await env.DB.batch(statements);
}
