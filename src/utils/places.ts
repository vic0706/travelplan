import { Env } from '../worker';

export async function syncPlaceDetails(env: Env, tripId: number) {
  const { results: items } = await env.DB.prepare(`
    SELECT id, date, start_time, end_time, google_place_id, lat, lng, image_url
    FROM Itineraries WHERE trip_id = ? AND google_place_id IS NOT NULL AND google_place_id != ''
  `).bind(tripId).all();
  for (const item of items as any[]) {
    const placeId = item.google_place_id;
    const cacheKey = `place_details_v2:${placeId}`;
    let placeData: any = await env.KV.get(cacheKey, 'json');
    if (!placeData) {
      const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: { 'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': 'id,rating,userRatingCount,currentOpeningHours,regularOpeningHours,reviewSummary,websiteUri,internationalPhoneNumber,businessStatus,location,photos' }
      });
      if (res.ok) { placeData = await res.json(); await env.KV.put(cacheKey, JSON.stringify(placeData), { expirationTtl: 604800 }); } else continue;
    }
    let finalImageUrl = item.image_url;
    if (!finalImageUrl && placeData.photos?.length > 0) {
      const mediaRes = await fetch(`https://places.googleapis.com/v1/${placeData.photos[0].name}/media?key=${env.GOOGLE_MAPS_API_KEY}&maxWidthPx=800&skipHttpRedirect=true`);
      if (mediaRes.ok) { const mediaData = await mediaRes.json() as any; finalImageUrl = mediaData.photoUri; }
    }
    const finalLat = item.lat || placeData.location?.latitude;
    const finalLng = item.lng || placeData.location?.longitude;
    // Prefer currentOpeningHours (includes holiday overrides); fall back to regular weekly schedule
    const openingHours = placeData.currentOpeningHours || placeData.regularOpeningHours || null;
    let warning = null;
    const status = placeData.businessStatus;
    if (status === 'CLOSED_TEMPORARILY') warning = '暫時停業';
    else if (status === 'CLOSED_PERMANENTLY') warning = '永久停業';
    else if (openingHours?.periods) {
      const isOpen = openingHours.periods.some((p: any) => p.open && p.open.day === new Date(item.date).getDay());
      if (!isOpen) warning = '排定日期可能公休';
    }
    const reviewSummary = placeData.reviewSummary?.text?.text || null;
    await env.DB.prepare(`UPDATE Itineraries SET rating = ?, reviews_count = ?, opening_hours = ?, place_website = ?, place_phone = ?, place_status = ?, review_summary = ?, sync_conflict_warning = ?, lat = ?, lng = ?, image_url = ? WHERE id = ?`)
      .bind(placeData.rating || null, placeData.userRatingCount || null, openingHours ? JSON.stringify(openingHours) : null, placeData.websiteUri || null, placeData.internationalPhoneNumber || null, status || null, reviewSummary, warning, finalLat, finalLng, finalImageUrl, item.id).run();
  }
}

export async function extractCoordsFromUrl(url: string): Promise<{ coords: string | null; debug: string[] }> {
  const debug: string[] = [`Start with URL: ${url}`];
  try {
    let currentUrl = url, finalHtml = '';
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
    if (finalHtml) {
      const centerMatch = finalHtml.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/) || finalHtml.match(/center=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (centerMatch) return { coords: `${centerMatch[1]},${centerMatch[2]}`, debug };
    }
    return { coords: null, debug };
  } catch (e: any) { return { coords: null, debug }; }
}

export async function geocodeTextToCoords(text: string, apiKey: string, region = 'tw'): Promise<{ coords: string | null; debug: string }> {
  try {
    // Geocoding API v4 (replaces legacy geocode/json)
    const res = await fetch(`https://geocode.googleapis.com/v4/geocode/address?address=${encodeURIComponent(text)}&regionCode=${region}&key=${apiKey}`);
    const data = await res.json() as any;
    if (data.results?.length > 0) {
      const loc = data.results[0].geocode.location;
      return { coords: `${loc.latitude},${loc.longitude}`, debug: `Geocoded [${text}]` };
    }
    return { coords: null, debug: `Failed: no results` };
  } catch (e: any) { return { coords: null, debug: e.message }; }
}
