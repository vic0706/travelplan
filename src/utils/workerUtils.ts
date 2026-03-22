import { Env } from '../worker';

// 1. 密碼雜湊
export async function generateHash(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 2. 檢查行程存取權限
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

// 3. 天氣抓取邏輯
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
        currentLat = item.lat; 
        currentLng = item.lng; 
        currentCity = item.city; 
        break;
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
        time: hour === '24:00' ? '00:00 (+1)' : hour, 
        city: currentCity,
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
       summary = { 
         max_temp: Math.round(mainWeather.daily.temperature_2m_max[0]), 
         min_temp: Math.round(mainWeather.daily.temperature_2m_min[0]), 
         weather_code: mainWeather.daily.weathercode[0] 
       };
     }
  }
  
  const finalJSON = { date: dateStr, summary, intervals };
  await env.KV.put(cacheKey, JSON.stringify(finalJSON), { expirationTtl: 3600 });
  return finalJSON;
}

// 4. 圖片搜尋 (保留供備用)
export async function searchUnsplash(query: string, env: Env): Promise<string | null> {
  try {
    const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`, { 
      headers: { 'Authorization': `Client-ID ${env.UNSPLASH_ACCESS_KEY}` } 
    });
    if (!response.ok) return null;
    const data = await response.json() as any;
    return data.results && data.results.length > 0 ? data.results[0].urls.regular : null;
  } catch (e) { return null; }
}

// 5. 自動生成住宿項目
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

// 6. 自動生成租車項目
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

// 7. URL 坐標提取引擎
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

// 8. 地址轉坐標引擎
export async function geocodeTextToCoords(text: string, apiKey: string, region: string = 'tw'): Promise<{coords: string | null, debug: string}> {
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

// 9. 💡 新增：智慧地點細節同步與防呆檢查引擎
export async function syncPlaceDetails(env: Env, tripId: number) {
  // 從資料庫抓取該行程中所有帶有 google_place_id 的活動
  const { results: items } = await env.DB.prepare(`
    SELECT id, date, start_time, end_time, google_place_id 
    FROM Itineraries 
    WHERE trip_id = ? AND google_place_id IS NOT NULL AND google_place_id != ''
  `).bind(tripId).all();

  for (const item of items as any[]) {
    const placeId = item.google_place_id;
    const cacheKey = `place_details:${placeId}`;
    
    // 省流第一防線：檢查 KV 是否已有該地點的快取 (保留 7 天)
    let placeData: any = await env.KV.get(cacheKey, 'json');

    if (!placeData) {
      // 只有 KV 沒有時，才向 Google Places API (New) 請求
      const url = `https://places.googleapis.com/v1/places/${placeId}`;
      const res = await fetch(url, {
        headers: {
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          // FieldMask 極致省流：只拿需要的欄位
          'X-Goog-FieldMask': 'rating,userRatingCount,regularOpeningHours,websiteUri,internationalPhoneNumber,businessStatus'
        }
      });

      if (res.ok) {
        placeData = await res.json();
        // 將結果存入 KV，快取 7 天 (604800 秒)
        await env.KV.put(cacheKey, JSON.stringify(placeData), { expirationTtl: 604800 });
      } else {
        console.error(`Failed to fetch details for place ${placeId}`);
        continue; 
      }
    }

    // 解析回傳資料
    const rating = placeData.rating || null;
    const reviewsCount = placeData.userRatingCount || null;
    const website = placeData.websiteUri || null;
    const phone = placeData.internationalPhoneNumber || null;
    const status = placeData.businessStatus || null;
    const openingHours = placeData.regularOpeningHours ? JSON.stringify(placeData.regularOpeningHours) : null;

    // 🚨 智慧防呆：營業時間衝突計算
    let warning = null;
    if (status === 'CLOSED_TEMPORARILY') {
      warning = '暫時停業 (Temporarily Closed)';
    } else if (status === 'CLOSED_PERMANENTLY') {
      warning = '永久停業 (Permanently Closed)';
    } else if (placeData.regularOpeningHours?.periods) {
      // 判斷該行程「星期幾」(0=週日, 1=週一... 6=週六)
      const dateObj = new Date(item.date);
      const dayOfWeek = dateObj.getDay(); 
      
      // 檢查 Google 回傳的營業時段中，是否有涵蓋這一天
      const hasHoursForDay = placeData.regularOpeningHours.periods.some((p: any) => p.open && p.open.day === dayOfWeek);
      
      // 如果 Periods 有資料，但這一天沒營業資料，代表公休
      if (!hasHoursForDay && placeData.regularOpeningHours.periods.length > 0) {
         warning = '排定日期可能公休 (Likely closed on this day)';
      }
    }

    // 將豐富的地點資訊與防呆警告寫回 D1 資料庫
    await env.DB.prepare(`
      UPDATE Itineraries
      SET rating = ?, reviews_count = ?, opening_hours = ?, place_website = ?, place_phone = ?, place_status = ?, sync_conflict_warning = ?
      WHERE id = ?
    `).bind(rating, reviewsCount, openingHours, website, phone, status, warning, item.id).run();
  }
}

// ==========================================
// 💡 行程智慧排序引擎 (Smart Itinerary Optimizer)
// ==========================================

// 輔助：計算兩點之間的直線距離 (公里 - Haversine 公式)
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c;
}

// 輔助：將 HH:MM 轉為分鐘數
function timeToMins(timeStr: string) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

// 輔助：將分鐘數轉為 HH:MM
function minsToTime(mins: number) {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.floor(mins % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export async function optimizeDailyItinerary(env: Env, tripId: number, dateStr: string) {
  // 1. 抓出該天所有的行程
  const { results } = await env.DB.prepare(`
    SELECT * FROM Itineraries WHERE trip_id = ? AND date = ? ORDER BY start_time ASC
  `).bind(tripId, dateStr).all();

  if (results.length === 0) return;

  const items = results as any[];
  
  // 2. 區分「固樁 (Fixed)」與「彈性 (Flexible)」活動
  // 並計算每個活動原本設定的「停留時間 (Duration)」
  const fixedItems = items.filter(i => i.is_time_fixed === 1).map(i => ({
    ...i,
    durationMins: timeToMins(i.end_time) - timeToMins(i.start_time)
  }));
  
  let flexItems = items.filter(i => i.is_time_fixed === 0 || !i.is_time_fixed).map(i => ({
    ...i,
    // 如果原本沒設好，預設給 60 分鐘停留
    durationMins: Math.max(15, timeToMins(i.end_time) - timeToMins(i.start_time)) 
  }));

  // 3. 開始模擬時間軸 (假設一天從第一個活動的時間開始，或預設 09:00)
  let currentMins = items.length > 0 ? timeToMins(items[0].start_time) : 540; 
  let currentLat = items[0]?.lat;
  let currentLng = items[0]?.lng;

  const statements = [];

  // 簡單的貪婪演算法 (Greedy Algorithm) 來排行程
  while (flexItems.length > 0 || fixedItems.length > 0) {
    // 檢查有沒有「固樁活動」的時間快到了 (例如 1 小時內)
    const nextFixed = fixedItems.length > 0 ? fixedItems[0] : null;
    
    if (nextFixed && timeToMins(nextFixed.start_time) <= currentMins + 60) {
      // 撞到固樁時間了，直接跳到該活動
      currentMins = timeToMins(nextFixed.end_time);
      currentLat = nextFixed.lat;
      currentLng = nextFixed.lng;
      fixedItems.shift(); // 移除已處理的
      continue;
    }

    if (flexItems.length > 0) {
      // 🌍 地理聚類優化：找出距離「當前位置」最近的彈性景點
      let bestIdx = 0;
      let minDistance = Infinity;

      if (currentLat && currentLng) {
        flexItems.forEach((item, idx) => {
          if (item.lat && item.lng) {
            const dist = getDistanceKm(currentLat, currentLng, item.lat, item.lng);
            if (dist < minDistance) {
              minDistance = dist;
              bestIdx = idx;
            }
          }
        });
      }

      const nextFlex = flexItems.splice(bestIdx, 1)[0]; // 取出並移除

      // 🚗 交通模式緩衝：直線距離(公里) * 4分鐘 (假設市區平均車速)，加上 5 分鐘緩衝
      const travelTimeMins = minDistance !== Infinity ? Math.ceil(minDistance * 4) + 5 : 15;
      
      // 更新這個彈性活動的時間
      const newStartMins = currentMins + travelTimeMins;
      const newEndMins = newStartMins + nextFlex.durationMins;

      // 檢查是否會擠壓到下一個「固樁活動」
      if (nextFixed && newEndMins > timeToMins(nextFixed.start_time)) {
        // 放不下！這代表行程太滿了，標記衝突警告
        statements.push(
          env.DB.prepare(`UPDATE Itineraries SET sync_conflict_warning = ? WHERE id = ?`)
            .bind(`⚠️ 距離下個行程時間不足，建議刪減`, nextFlex.id)
        );
        // 先把它塞在原位，但時間被壓縮
        currentMins = timeToMins(nextFixed.start_time); 
      } else {
        // 放得下，更新資料庫的時間
        statements.push(
          env.DB.prepare(`UPDATE Itineraries SET start_time = ?, end_time = ?, sync_conflict_warning = NULL WHERE id = ?`)
            .bind(minsToTime(newStartMins), minsToTime(newEndMins), nextFlex.id)
        );
        currentMins = newEndMins;
        if (nextFlex.lat) currentLat = nextFlex.lat;
        if (nextFlex.lng) currentLng = nextFlex.lng;
      }
    }
  }

  // 4. 批次執行更新
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
}