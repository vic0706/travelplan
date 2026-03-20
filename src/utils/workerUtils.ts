import { Env } from '../worker';

// 密碼雜湊 [cite: 117-119]
export async function generateHash(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 檢查行程存取權限 [cite: 125-129]
export async function checkTripAccess(c: any, tripId: number, level: 'view' | 'edit' | 'admin') {
  const user = c.get('user');
  if (user && user.role === 'Admin') return true;
  const trip = await c.env.DB.prepare('SELECT is_public FROM Trips WHERE id = ?').bind(tripId).first();
  if (!trip) return false;
  let isMember = false;
  if (user) {
    const memberRecord = await c.env.DB.prepare('SELECT 1 FROM TripMembers WHERE trip_id = ? AND user_id = ?').bind(tripId, user.id).first();
    isMember = !!memberRecord;
  }
  if (level === 'admin') return user?.role === 'Admin';
  if (level === 'edit') return isMember;
  if (level === 'view') return trip.is_public === 1 || isMember;
  return false;
}

// 天氣抓取邏輯 [cite: 130-148]
export async function getWeatherForDate(tripId: number, dateStr: string, env: Env, forceRefresh = false) {
  const cacheKey = `weather:trip:${tripId}:${dateStr}`;
  if (!forceRefresh) {
    const cached = await env.KV.get(cacheKey, 'json');
    if (cached) return cached;
  }
  const { results: tripResults } = await env.DB.prepare(`SELECT t.id, c.name as default_city, c.lat as default_lat, c.lng as default_lng FROM Trips t JOIN Cities c ON t.default_city_id = c.id WHERE t.id = ?`).bind(tripId).all();
  if (tripResults.length === 0) return null;
  const trip = tripResults[0] as any;
  const targetHours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'];
  const { results: itineraries } = await env.DB.prepare(`SELECT i.start_time, i.end_time, c.name as city, c.lat, c.lng FROM Itineraries i JOIN Cities c ON i.city_id = c.id WHERE i.trip_id = ? AND i.date = ?`).bind(trip.id, dateStr).all();
  const intervals = [];
  const uniqueCoords = new Map();
  const nextDate = new Date(dateStr);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split('T')[0];

  for (const hour of targetHours) {
    let currentLat = trip.default_lat;
    let currentLng = trip.default_lng;
    let currentCity = trip.default_city;
    let checkHour = hour === '24:00' ? '23:59' : hour;
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
      intervals.push({
        time: hour === '24:00' ? '00:00 (+1)' : hour, city: currentCity,
        temp: index !== -1 ? Math.round(weatherData.hourly.temperature_2m[index]) : null,
        pop: index !== -1 ? weatherData.hourly.precipitation_probability[index] : null,
        code: index !== -1 ? weatherData.hourly.weathercode[index] : null
      });
    }
  }
  let summary = null;
  const noonData = intervals.find(i => i.time === '12:00');
  if (noonData) {
     const coordKey = [...uniqueCoords.keys()].find(k => uniqueCoords.get(k).hourly.time.includes(`${dateStr}T12:00`)) || [...uniqueCoords.keys()][0];
     const mainWeather = uniqueCoords.get(coordKey);
     if (mainWeather && mainWeather.daily) {
       summary = { max_temp: Math.round(mainWeather.daily.temperature_2m_max[0]), min_temp: Math.round(mainWeather.daily.temperature_2m_min[0]), weather_code: mainWeather.daily.weathercode[0] };
     }
  }
  const finalJSON = { date: dateStr, summary, intervals };
  await env.KV.put(cacheKey, JSON.stringify(finalJSON), { expirationTtl: 3600 });
  return finalJSON;
}

// 圖片搜尋 [cite: 149-151]
export async function searchUnsplash(query: string, env: Env): Promise<string | null> {
  try {
    const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`, { headers: { 'Authorization': `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } });
    if (!response.ok) return null;
    const data = await response.json() as any;
    return data.results && data.results.length > 0 ? data.results[0].urls.regular : null;
  } catch (e) { return null; }
}

// 自動生成住宿項目 [cite: 152-163]
export function generateDesiredAccommodationItems(b: any, bookingId: string | number, hotelImage: string) {
  const desiredItems = [];
  const startDate = new Date(b.check_in_date);
  const endDate = new Date(b.check_out_date);
  const checkInTime = b.check_in_time || '16:00';
  const checkOutTime = b.check_out_time || '11:00';
  const dailyStartTime = b.daily_start_time || '08:00';
  const dailyEndTime = b.daily_end_time || '22:00';
  const currentDate = new Date(startDate);
  const notesWithOrder = b.order_id ? `Order ID: ${b.order_id}\n${b.notes || ''}` : (b.notes || '');
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const isCheckInDay = dateStr === b.check_in_date;
    const isCheckOutDay = dateStr === b.check_out_date;
    const itemName = b.name || b.hotel_name;
    if (isCheckInDay) {
      desiredItems.push({ date: dateStr, start_time: checkInTime, end_time: checkInTime, title: `Check-in ${itemName}`, notes: notesWithOrder, image_url: hotelImage, address: b.start_location || '', matchType: 'Check-in' });
      if (!isCheckOutDay) desiredItems.push({ date: dateStr, start_time: dailyEndTime, end_time: dailyEndTime, title: `Back to ${itemName}`, notes: '', image_url: hotelImage, address: b.start_location || '', matchType: 'Back to Hotel' });
    } else if (isCheckOutDay) {
      desiredItems.push({ date: dateStr, start_time: checkOutTime, end_time: checkOutTime, title: `Check-out ${itemName}`, notes: notesWithOrder, image_url: hotelImage, address: b.start_location || '', matchType: 'Check-out' });
    } else {
      desiredItems.push({ date: dateStr, start_time: dailyStartTime, end_time: dailyStartTime, title: `Leave ${itemName}`, notes: '', image_url: hotelImage, address: b.start_location || '', matchType: 'Leave Hotel' });
      desiredItems.push({ date: dateStr, start_time: dailyEndTime, end_time: dailyEndTime, title: `Back to ${itemName}`, notes: '', image_url: hotelImage, address: b.start_location || '', matchType: 'Back to Hotel' });
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return desiredItems;
}

// 自動生成租車項目 [cite: 164-171]
export function generateDesiredRentalItems(b: any, bookingId: string | number, rentalImage: string) {
  const desiredItems = [];
  const titlePrefix = b.provider ? `${b.provider} ` : '';
  const name = b.title || '';
  const notesWithOrder = b.order_id ? `Order ID: ${b.order_id}\n${b.notes || ''}` : (b.notes || '');
  const details = typeof b.details === 'string' ? JSON.parse(b.details) : (b.details || {});
  const depBuffer = details.dep_buffer || 0; 
  const arrBuffer = details.arr_buffer || 0;
  const pad = (n: number) => n.toString().padStart(2, '0');
  const pickUpStart = new Date(`1970-01-01T${b.start_time || '10:00'}:00`);
  const pickUpEnd = new Date(pickUpStart.getTime() + (depBuffer * 60000));
  desiredItems.push({
    date: b.start_date,
    start_time: b.start_time || '10:00',
    end_time: `${pad(pickUpEnd.getHours())}:${pad(pickUpEnd.getMinutes())}`,
    title: `Pick-up ${titlePrefix}${name}`.trim(),
    notes: notesWithOrder,
    image_url: rentalImage,
    address: b.start_location || '',
    matchType: 'Pick-up'
  });
  const returnStart = new Date(`1970-01-01T${b.end_time || '10:00'}:00`);
  const returnEnd = new Date(returnStart.getTime() + (arrBuffer * 60000));
  desiredItems.push({
    date: b.end_date,
    start_time: b.end_time || '10:00',
    end_time: `${pad(returnEnd.getHours())}:${pad(returnEnd.getMinutes())}`,
    title: `Return ${titlePrefix}${name}`.trim(),
    notes: notesWithOrder,
    image_url: rentalImage,
    address: b.end_location || b.start_location || '',
    matchType: 'Return'
  });
  return desiredItems;
}

// URL 坐標提取引擎 [cite: 172-198]
export async function extractCoordsFromUrl(url: string): Promise<{coords: string | null, debug: string[]}> {
  const debug: string[] = [];
  debug.push(`Start with URL: ${url}`);
  try {
    let currentUrl = url;
    let finalHtml = '';
    for (let i = 0; i < 5; i++) {
      const response = await fetch(currentUrl, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (response.status >= 300 && response.status < 400) {
        const loc = response.headers.get('location');
        if (loc) { currentUrl = loc.startsWith('/') ? new URL(loc, currentUrl).toString() : loc; debug.push(`Redirect ${i+1} -> ${currentUrl}`); continue; }
      }
      if (currentUrl.includes('google.com') || currentUrl.includes('goo.gl')) { try { finalHtml = await response.text(); } catch(e) {} }
      currentUrl = response.url || currentUrl; break;
    }
    const atMatch = currentUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) return { coords: `${atMatch[1]},${atMatch[2]}`, debug };
    const bangMatch = currentUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (bangMatch) return { coords: `${bangMatch[1]},${bangMatch[2]}`, debug };
    if (finalHtml && (currentUrl.includes('google.com') || currentUrl.includes('goo.gl'))) {
       const centerMatch = finalHtml.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/) || finalHtml.match(/center=(-?\d+\.\d+),(-?\d+\.\d+)/);
       if (centerMatch) return { coords: `${centerMatch[1]},${centerMatch[2]}`, debug };
    }
    return { coords: null, debug };
  } catch (e: any) { return { coords: null, debug }; }
}

// 地址轉坐標引擎 [cite: 199-204]
export async function geocodeTextToCoords(text: string, apiKey: string, region: string = 'jp'): Promise<{coords: string | null, debug: string}> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}&key=${apiKey}&region=${region}`;
    const res = await fetch(url);
    const data = await res.json() as any;
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return { coords: `${location.lat},${location.lng}`, debug: `Geocoded [${text}]` };
    }
    return { coords: null, debug: `Failed: ${data.status}` };
  } catch (e: any) { return { coords: null, debug: e.message }; }
}