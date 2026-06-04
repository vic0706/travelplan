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

// Re-exports for backward compatibility
export { getWeatherForDate } from './weather';
export { syncPlaceDetails, extractCoordsFromUrl, geocodeTextToCoords } from './places';
export { searchUnsplash } from './unsplash';
export { generateDesiredAccommodationItems, generateDesiredRentalItems } from './bookingItems';
export { optimizeDailyItinerary } from './optimizer';
