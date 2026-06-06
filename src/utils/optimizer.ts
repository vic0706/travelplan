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

interface GapSlot {
  start: number;
  end: number;
  cursor: number;
  lastLat: number | null;
  lastLng: number | null;
  lastItem: any | null;
}

export async function optimizeDailyItinerary(env: any, tripId: number, dateStr: string) {
  const { results: rawItems } = await env.DB.prepare(`
    SELECT * FROM Itineraries WHERE trip_id = ? AND date = ?
  `).bind(tripId, dateStr).all();

  if (rawItems.length === 0) return;

  const statements: any[] = [];

  // Separate fixed vs smart items; sort fixed by their locked start_time
  const fixedItems = (rawItems as any[])
    .filter(i => i.is_time_fixed === 1)
    .sort((a: any, b: any) => timeToMins(a.start_time) - timeToMins(b.start_time));

  const smartItems = (rawItems as any[]).filter(i => i.is_time_fixed !== 1);

  // Clear warnings on fixed items
  for (const item of fixedItems) {
    statements.push(env.DB.prepare(`UPDATE Itineraries SET sync_conflict_warning = null WHERE id = ?`).bind(item.id));
  }

  if (smartItems.length === 0) {
    if (statements.length > 0) await env.DB.batch(statements);
    return;
  }

  // Build free time gaps around fixed items
  const DAY_START = 9 * 60;  // 09:00
  const DAY_END   = 22 * 60; // 22:00

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
  // Gap after the last fixed item (or whole day if no fixed items)
  if (prevEnd < DAY_END) {
    gaps.push({ start: prevEnd, end: DAY_END, cursor: prevEnd, lastLat: prevLat, lastLng: prevLng, lastItem: null });
  }

  if (gaps.length === 0) {
    // Fixed items occupy the entire day — no room for smart items
    for (const item of smartItems) {
      statements.push(
        env.DB.prepare(`UPDATE Itineraries SET start_time = '', end_time = '', sync_conflict_warning = ? WHERE id = ?`)
          .bind('⚠️ 無法插入，固定行程已佔滿當天時段', item.id)
      );
    }
    await env.DB.batch(statements);
    return;
  }

  // Try to fit each smart item into the first gap that has enough space
  for (const item of smartItems as any[]) {
    const stayDuration = parseInt(item.stay_duration) || 60;
    let placed = false;

    for (const gap of gaps) {
      // Calculate travel time from the previous item in this gap
      let travelMins = 0;
      if (gap.lastItem) {
        const prev = gap.lastItem;
        if (prev.next_transport_time === 'auto') {
          const dist = getDistanceKm(gap.lastLat!, gap.lastLng!, item.lat, item.lng);
          let speedMultiplier = 4, buffer = 5;
          if (prev.next_transport_mode === 'WALKING')  { speedMultiplier = 12; buffer = 2; }
          if (prev.next_transport_mode === 'TRANSIT')  { speedMultiplier = 4;  buffer = 10; }
          travelMins = dist !== null ? Math.ceil(dist * speedMultiplier) + buffer : 15;
          statements.push(env.DB.prepare(`UPDATE Itineraries SET next_transport_auto_time = ? WHERE id = ?`).bind(travelMins, prev.id));
        } else if (prev.next_transport_time) {
          travelMins = parseInt(prev.next_transport_time.replace(/\D/g, '')) || 15;
        } else {
          travelMins = 15; // default buffer when no transport info set
        }
      }

      const startMins = gap.cursor + travelMins;
      const endMins   = startMins + stayDuration;

      if (endMins <= gap.end) {
        statements.push(
          env.DB.prepare(`UPDATE Itineraries SET start_time = ?, end_time = ?, sync_conflict_warning = null WHERE id = ?`)
            .bind(minsToTime(startMins), minsToTime(endMins), item.id)
        );
        gap.cursor  = endMins;
        gap.lastLat = item.lat;
        gap.lastLng = item.lng;
        gap.lastItem = item;
        placed = true;
        break;
      }
    }

    if (!placed) {
      statements.push(
        env.DB.prepare(`UPDATE Itineraries SET start_time = '', end_time = '', sync_conflict_warning = ? WHERE id = ?`)
          .bind('⚠️ 無法插入，可用時間不足', item.id)
      );
    }
  }

  if (statements.length > 0) await env.DB.batch(statements);
}
