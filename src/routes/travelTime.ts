import { Hono } from 'hono';
import { Env } from '../worker';
import { checkApiQuota, trackApiCall } from '../utils/apiQuota';

const travelTime = new Hono<{ Bindings: Env }>();

const TRAVEL_MODE_MAP: Record<string, string> = {
  WALKING:      'WALK',
  BICYCLING:    'BICYCLE',
  TRANSIT:      'TRANSIT',
  MOTORCYCLING: 'TWO_WHEELER',
  DRIVING:      'DRIVE',
};

travelTime.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { fromLat, fromLng, toLat, toLng, mode } = body;
  if (fromLat == null || fromLng == null || toLat == null || toLng == null || !mode) {
    return c.json({ error: 'Missing required fields: fromLat, fromLng, toLat, toLng, mode' }, 400);
  }

  const travelMode = TRAVEL_MODE_MAP[String(mode).toUpperCase()] || 'DRIVE';
  const fLat = parseFloat(fromLat), fLng = parseFloat(fromLng);
  const tLat = parseFloat(toLat),   tLng = parseFloat(toLng);

  if (isNaN(fLat) || isNaN(fLng) || isNaN(tLat) || isNaN(tLng)) {
    return c.json({ error: 'Invalid coordinates' }, 400);
  }

  if (!c.env.GOOGLE_MAPS_API_KEY) {
    return c.json({ error: 'Google Maps API key not configured' }, 503);
  }

  try {
    await checkApiQuota(c.env, 'compute_routes');

    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': c.env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration',
      },
      body: JSON.stringify({
        origin:      { location: { latLng: { latitude: fLat, longitude: fLng } } },
        destination: { location: { latLng: { latitude: tLat, longitude: tLng } } },
        travelMode,
      }),
    });

    await trackApiCall(c.env, 'compute_routes');

    if (!res.ok) {
      return c.json({ error: 'Routes API error', status: res.status }, 502);
    }

    const data = await res.json() as any;
    const duration = data.routes?.[0]?.duration;
    if (duration) {
      const secs = parseInt(duration);
      if (!isNaN(secs)) {
        const mins = Math.ceil(secs / 60);
        return c.json({ mins });
      }
    }

    return c.json({ error: 'No route found' }, 404);
  } catch (e: any) {
    if (e?.code === 'API_QUOTA_EXCEEDED') {
      return c.json({ error: 'API_QUOTA_EXCEEDED', api: 'compute_routes' }, 429);
    }
    return c.json({ error: 'Internal error' }, 500);
  }
});

export default travelTime;
