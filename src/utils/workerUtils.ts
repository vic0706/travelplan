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

// 4. 圖片搜尋
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

// 💡 升級版：智慧地點細節同步 (含照片轉址與座標回填)
export async function syncPlaceDetails(env: Env, tripId: number) {
  const { results: items } = await env.DB.prepare(`
    SELECT id, date, start_time, end_time, google_place_id, lat, lng, image_url
    FROM Itineraries 
    WHERE trip_id = ? AND google_place_id IS NOT NULL AND google_place_id != ''
  `).bind(tripId).all();

  for (const item of items as any[]) {
    const placeId = item.google_place_id;
    const cacheKey = `place_details_v2:${placeId}`; // 升級版本號以刷新快取
    let placeData: any = await env.KV.get(cacheKey, 'json');

    if (!placeData) {
      // 💡 擴張 FieldMask，加入 location 和 photos
      const url = `https://places.googleapis.com/v1/places/${placeId}`;
      const res = await fetch(url, {
        headers: {
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'id,rating,userRatingCount,regularOpeningHours,websiteUri,internationalPhoneNumber,businessStatus,location,photos'
        }
      });

      if (res.ok) {
        placeData = await res.json();
        await env.KV.put(cacheKey, JSON.stringify(placeData), { expirationTtl: 604800 });
      } else continue;
    }

    // --- 1. 處理照片 (Photo to Media URI) ---
    let finalImageUrl = item.image_url;
    if (!finalImageUrl && placeData.photos && placeData.photos.length > 0) {
      const photoName = placeData.photos[0].name; // 格式如 places/xxx/photos/yyy
      const mediaRes = await fetch(`https://places.googleapis.com/v1/${photoName}/media?key=${env.GOOGLE_MAPS_API_KEY}&maxWidthPx=800&skipHttpRedirect=true`);
      if (mediaRes.ok) {
        const mediaData = await mediaRes.json() as any;
        finalImageUrl = mediaData.photoUri; // 拿到真正的圖片網址
      }
    }

    // --- 2. 處理座標 (回填缺少的部分) ---
    const finalLat = item.lat || placeData.location?.latitude;
    const finalLng = item.lng || placeData.location?.longitude;

    // --- 3. 處理狀態與警告 ---
    let warning = null;
    const status = placeData.businessStatus;
    if (status === 'CLOSED_TEMPORARILY') warning = '暫時停業';
    else if (status === 'CLOSED_PERMANENTLY') warning = '永久停業';
    else if (placeData.regularOpeningHours?.periods) {
      const dayOfWeek = new Date(item.date).getDay();
      const isOpen = placeData.regularOpeningHours.periods.some((p: any) => p.open && p.open.day === dayOfWeek);
      if (!isOpen) warning = '排定日期可能公休';
    }

    // --- 4. 寫入資料庫 (補齊所有欄位) ---
    await env.DB.prepare(`
      UPDATE Itineraries
      SET rating = ?, reviews_count = ?, opening_hours = ?, place_website = ?, 
          place_phone = ?, place_status = ?, sync_conflict_warning = ?,
          lat = ?, lng = ?, image_url = ?
      WHERE id = ?
    `).bind(
      placeData.rating || null,
      placeData.userRatingCount || null,
      placeData.regularOpeningHours ? JSON.stringify(placeData.regularOpeningHours) : null,
      placeData.websiteUri || null,
      placeData.internationalPhoneNumber || null,
      status || null,
      warning,
      finalLat,
      finalLng,
      finalImageUrl,
      item.id
    ).run();
  }
}

// ==========================================
// 💡 AI 排序引擎輔助函式
// ==========================================

const PREFERENCE_WINDOWS: Record<string, { start: number, end: number }> = {
  anytime: { start: 0, end: 1439 },
  morning: { start: 360, end: 720 },
  afternoon: { start: 720, end: 1080 },
  evening: { start: 1080, end: 1439 }
};

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null; // 💡 嚴格模式：無座標回傳 null
  try {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))); 
    return R * c;
  } catch (e) {
    return null;
  }
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

// ==========================================
// 💡 行程智慧排序引擎 3.1 (Smart Itinerary Optimizer)
// ==========================================

export async function optimizeDailyItinerary(env: Env, tripId: number, dateStr: string) {
  const { results } = await env.DB.prepare(`
    SELECT * FROM Itineraries WHERE trip_id = ? AND date = ? ORDER BY start_time ASC
  `).bind(tripId, dateStr).all();

  if (results.length === 0) return;
  const items = results as any[];
  
  const fixedItems = items.filter(i => i.is_time_fixed === 1).map(i => ({
    ...i,
    durationMins: timeToMins(i.end_time) - timeToMins(i.start_time)
  })).sort((a, b) => timeToMins(a.start_time) - timeToMins(b.start_time));
  
  let flexItems = items.filter(i => i.is_time_fixed === 0 || !i.is_time_fixed).map(i => ({
    ...i,
    durationMins: parseInt(i.stay_duration) || 60,
    time_pref: i.time_preference || 'anytime'
  }));

  const statements = [];

  // 動態決定起點
  let currentMins = 540; 
  const morningFixed = fixedItems.find(i => timeToMins(i.start_time) < 720); 
  const hasMorningFlex = flexItems.some(i => i.time_pref === 'morning' || i.time_pref === 'anytime');
  
  if (morningFixed) {
    currentMins = Math.min(540, timeToMins(morningFixed.start_time));
  } else if (hasMorningFlex) {
    currentMins = 540;
  } else if (flexItems.some(i => i.time_pref === 'afternoon')) {
    currentMins = 720;
  } else {
    currentMins = 1080;
  }

  let currentLat = items[0]?.lat;
  let currentLng = items[0]?.lng;
  let lastProcessedItem: any = null; 
  
  const circuitBreakers = {
    morning: false,
    afternoon: false,
    evening: false
  };

  const PREF_ORDER: Record<string, number> = { morning: 1, afternoon: 2, evening: 3, anytime: 99 };

  while (flexItems.length > 0 || fixedItems.length > 0) {
    if (flexItems.length === 0) break;

    const nextFixed = fixedItems.length > 0 ? fixedItems[0] : null;

    let currentPeriod = 'morning';
    if (currentMins >= 720 && currentMins < 1080) currentPeriod = 'afternoon';
    else if (currentMins >= 1080) currentPeriod = 'evening';

    // --- 區塊 B：觸發跳電檢查 ---
    const isAutoAndNoCoords = lastProcessedItem?.next_transport_mode === 'auto' && (!lastProcessedItem.lat || !lastProcessedItem.lng);
    if (lastProcessedItem && (!lastProcessedItem.next_transport_mode || lastProcessedItem.next_transport_mode === '' || isAutoAndNoCoords)) {
      circuitBreakers[currentPeriod as keyof typeof circuitBreakers] = true;
    }

    // 處理跳電沉底邏輯
    if (circuitBreakers[currentPeriod as keyof typeof circuitBreakers]) {
      const failedItemIdx = flexItems.findIndex(i => i.time_pref === currentPeriod);
      
      if (failedItemIdx !== -1) {
        const failedItem = flexItems.splice(failedItemIdx, 1)[0];
        statements.push(
          env.DB.prepare(`UPDATE Itineraries SET start_time = '', end_time = '', sync_conflict_warning = ? WHERE id = ?`)
          .bind('⚠️ 因交通資料不全（沒座標或沒填），本時段暫停排程', failedItem.id)
        );
        continue;
      } else {
        if (currentPeriod === 'morning') currentMins = 720;
        else if (currentPeriod === 'afternoon') currentMins = 1080;
        else break; 
        
        lastProcessedItem = null;
        continue;
      }
    }

    // 處理固定行程
    if (nextFixed && timeToMins(nextFixed.start_time) <= currentMins + 30) {
      currentMins = Math.max(currentMins, timeToMins(nextFixed.end_time));
      currentLat = nextFixed.lat;
      currentLng = nextFixed.lng;
      lastProcessedItem = nextFixed;
      fixedItems.shift(); 
      continue;
    }

    // 嚴格時段選點
    let activePhase = 99;
    flexItems.forEach(item => {
      const order = PREF_ORDER[item.time_pref] || 99;
      if (order >= PREF_ORDER[currentPeriod] && order < activePhase) {
        activePhase = order;
      }
    });

    if (activePhase === 2 && currentMins < 720) { currentMins = 720; continue; }
    if (activePhase === 3 && currentMins < 1080) { currentMins = 1080; continue; }

    let bestIdx = -1;
    let minScore = Infinity;
    let bestDistance: number | null = null;

    flexItems.forEach((item, idx) => {
      const order = PREF_ORDER[item.time_pref] || 99;
      if (order === activePhase || item.time_pref === 'anytime') {
        const dist = getDistanceKm(currentLat, currentLng, item.lat, item.lng);
        let score = (dist ?? 5) + (item.time_pref === 'anytime' ? 2 : 0);
        if (score < minScore) {
          minScore = score;
          bestIdx = idx;
          bestDistance = dist;
        }
      }
    });

    if (bestIdx === -1) bestIdx = 0;
    const nextFlex = flexItems.splice(bestIdx, 1)[0];
    const window = PREFERENCE_WINDOWS[nextFlex.time_pref] || PREFERENCE_WINDOWS.anytime;
    
    // 💡 修改前的邏輯太嚴格，只有 mode === 'auto' 才算
    // 💡 修正後：只要有 mode，沒給具體時間就一律用座標估算！

    let travelTimeMins: number | null = null;

    // 條件 1：如果有手動填具體時間 (且不為 0)，優先使用手動時間
    if (lastProcessedItem.next_transport_time && parseInt(lastProcessedItem.next_transport_time) > 0) {
      travelTimeMins = parseInt(lastProcessedItem.next_transport_time);
    } 
    // 條件 2：只要有設定交通方式 (不管是 auto, transit 還是 driving)
    else if (lastProcessedItem.next_transport_mode && lastProcessedItem.next_transport_mode !== '') {
      // 嘗試使用座標進行距離推算兜底
      const dist = getDistanceKm(currentLat, currentLng, nextFlex.lat, nextFlex.lng);
      if (dist !== null) {
        travelTimeMins = Math.ceil(dist * 4) + 5; // 預設估算：每公里 4 分鐘 + 5 分鐘緩衝    
        // 💡 這裡可以針對不同交通工具微調係數 (可選)
        if (lastProcessedItem.next_transport_mode === 'walking') {
          travelTimeMins = Math.ceil(dist * 12); // 走路比較慢，每公里 12 分鐘
        } else if (lastProcessedItem.next_transport_mode === 'driving') {
          travelTimeMins = Math.ceil(dist * 3) + 5; // 開車比較快
        }
      }
     }

    // 如果連兜底都算不出來（例如完全沒填 mode，或兩個景點都沒有座標），才觸發斷路器跳電
    if (travelTimeMins === null) {
       circuitBreakers[timePref] = true;
       break;
    }


    
    let newStartMins = Math.max(currentMins + (travelTimeMins || 0), window.start);
    const newEndMins = newStartMins + nextFlex.durationMins;

    // 碰撞檢查
    if (nextFixed && newEndMins > timeToMins(nextFixed.start_time)) {
      statements.push(
        env.DB.prepare(`UPDATE Itineraries SET start_time = '', end_time = '', sync_conflict_warning = ? WHERE id = ?`)
        .bind('⚠️ 空檔時間不足以排入此行程', nextFlex.id)
      );
      currentMins = timeToMins(nextFixed.end_time);
      currentLat = nextFixed.lat;
      currentLng = nextFixed.lng;
      lastProcessedItem = nextFixed;
      fixedItems.shift(); 
      continue;
    }

    // 寫入時間
    statements.push(
      env.DB.prepare(`UPDATE Itineraries SET start_time = ?, end_time = ?, sync_conflict_warning = ? WHERE id = ?`)
      .bind(minsToTime(newStartMins), minsToTime(newEndMins), (newStartMins > window.end && nextFlex.time_pref !== 'anytime') ? '⚠️ 排程已被擠壓出偏好時段' : null, nextFlex.id)
    );
    
    currentMins = newEndMins;
    if (nextFlex.lat) { currentLat = nextFlex.lat; currentLng = nextFlex.lng; }
    lastProcessedItem = nextFlex;
  }

  if (statements.length > 0) await env.DB.batch(statements);

  // 最終校準 (Final Pass)
  const { results: sortedItems } = await env.DB.prepare(`
    SELECT id, lat, lng, next_transport_mode FROM Itineraries 
    WHERE trip_id = ? AND date = ? AND start_time != '' AND start_time IS NOT NULL
    ORDER BY start_time ASC
  `).bind(tripId, dateStr).all();

  const finalStatements = [];
  for (let i = 0; i < sortedItems.length - 1; i++) {
    const current = sortedItems[i] as any;
    const next = sortedItems[i + 1] as any;

    if (current.next_transport_mode === 'auto') {
      const dist = getDistanceKm(current.lat, current.lng, next.lat, next.lng);
      if (dist !== null) {
        finalStatements.push(
          env.DB.prepare(`UPDATE Itineraries SET next_transport_auto_time = ? WHERE id = ?`)
          .bind(Math.ceil(dist * 4) + 5, current.id)
        );
      } else {
        // 嚴格模式：沒座標就 NULL，不準預設 15
        finalStatements.push(
          env.DB.prepare(`UPDATE Itineraries SET next_transport_auto_time = NULL, sync_conflict_warning = ? WHERE id = ?`)
          .bind('⚠️ 無法計算 Auto 交通：缺少地點座標', current.id)
        );
      }
    }
  }
  
  if (finalStatements.length > 0) await env.DB.batch(finalStatements);
}