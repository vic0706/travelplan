import { Env } from '../worker';

export async function getWeatherForDate(tripId: number, dateStr: string, env: Env, forceRefresh = false) {
  const cacheKey = `weather:trip:${tripId}:${dateStr}`;
  if (!forceRefresh) {
    const cached = await env.KV.get(cacheKey, 'json');
    if (cached) return cached;
  }
  const { results: tripResults } = await env.DB.prepare(`
    SELECT t.id, c.name as default_city, c.lat as default_lat, c.lng as default_lng
    FROM Trips t JOIN Cities c ON t.default_city_id = c.id WHERE t.id = ?
  `).bind(tripId).all();
  if (tripResults.length === 0) return null;
  const trip = tripResults[0] as any;
  const targetHours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'];
  const { results: itineraries } = await env.DB.prepare(`
    SELECT i.start_time, i.end_time, c.name as city, c.lat, c.lng
    FROM Itineraries i JOIN Cities c ON i.city_id = c.id
    WHERE i.trip_id = ? AND i.date = ?
  `).bind(trip.id, dateStr).all();
  const intervals: any[] = [];
  const uniqueCoords = new Map();
  const nextDate = new Date(dateStr);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split('T')[0];
  for (const hour of targetHours) {
    let currentLat = trip.default_lat, currentLng = trip.default_lng, currentCity = trip.default_city;
    const checkHour = hour === '24:00' ? '23:59' : hour;
    for (const item of itineraries as any[]) {
      if (item.start_time && item.end_time && checkHour >= item.start_time && checkHour <= item.end_time) {
        currentLat = item.lat; currentLng = item.lng; currentCity = item.city; break;
      }
    }
    const coordKey = `${currentLat},${currentLng}`;
    if (!uniqueCoords.has(coordKey)) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${currentLat}&longitude=${currentLng}&hourly=temperature_2m,precipitation_probability,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&start_date=${dateStr}&end_date=${nextDateStr}`;
      const res = await fetch(url);
      if (res.ok) uniqueCoords.set(coordKey, await res.json());
    }
    const weatherData = uniqueCoords.get(coordKey);
    if (weatherData) {
      const timeString = hour === '24:00' ? `${nextDateStr}T00:00` : `${dateStr}T${hour}`;
      const index = weatherData.hourly.time.indexOf(timeString);
      intervals.push({ time: hour === '24:00' ? '00:00 (+1)' : hour, city: currentCity, temp: index !== -1 ? Math.round(weatherData.hourly.temperature_2m[index]) : null, pop: index !== -1 ? weatherData.hourly.precipitation_probability[index] : null, code: index !== -1 ? weatherData.hourly.weathercode[index] : null });
    }
  }
  let summary = null;
  const noonData = intervals.find(i => i.time === '12:00');
  if (noonData) {
    const coordKey = [...uniqueCoords.keys()].find((k: string) => uniqueCoords.get(k).hourly.time.includes(`${dateStr}T12:00`)) || [...uniqueCoords.keys()][0];
    const mainWeather = uniqueCoords.get(coordKey);
    if (mainWeather?.daily) summary = { max_temp: Math.round(mainWeather.daily.temperature_2m_max[0]), min_temp: Math.round(mainWeather.daily.temperature_2m_min[0]), weather_code: mainWeather.daily.weathercode[0] };
  }
  const finalJSON = { date: dateStr, summary, intervals };
  await env.KV.put(cacheKey, JSON.stringify(finalJSON), { expirationTtl: 3600 });
  return finalJSON;
}
