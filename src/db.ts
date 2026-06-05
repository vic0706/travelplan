import Dexie, { Table } from 'dexie';
import {
  User, Trip, TripMember, Itinerary, SubItinerary,
  Expense, AppSetting, Booking, City
} from './types';

export interface PlacesCacheEntry {
  query: string;
  suggestions: any[];
  cachedAt: number;
}

export interface PlaceDetailsCacheEntry {
  place_id: string;
  details: any;
  cachedAt: number;
}

const PLACE_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day

export async function getCachedPlaceSuggestions(query: string): Promise<any[] | null> {
  try {
    const entry = await db.placesCache.get(query.toLowerCase().trim());
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > PLACE_CACHE_TTL) { db.placesCache.delete(query.toLowerCase().trim()); return null; }
    return entry.suggestions;
  } catch { return null; }
}

export async function cachePlaceSuggestions(query: string, suggestions: any[]): Promise<void> {
  try { await db.placesCache.put({ query: query.toLowerCase().trim(), suggestions, cachedAt: Date.now() }); } catch {}
}

export async function getCachedPlaceDetails(placeId: string): Promise<any | null> {
  try {
    const entry = await db.placeDetailsCache.get(placeId);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > PLACE_CACHE_TTL) { db.placeDetailsCache.delete(placeId); return null; }
    return entry.details;
  } catch { return null; }
}

export async function cachePlaceDetails(placeId: string, details: any): Promise<void> {
  try { await db.placeDetailsCache.put({ place_id: placeId, details, cachedAt: Date.now() }); } catch {}
}

export class TravelPlanDB extends Dexie {
  users!: Table<User, number>;
  trips!: Table<Trip, number>;
  tripMembers!: Table<TripMember, [number, number]>;
  itineraries!: Table<Itinerary, number>;
  subItineraries!: Table<SubItinerary, string>;
  expenses!: Table<Expense, number>;
  bookings!: Table<Booking, number>;
  cities!: Table<City, number>;
  appSettings!: Table<AppSetting, string>;
  placesCache!: Table<PlacesCacheEntry, string>;
  placeDetailsCache!: Table<PlaceDetailsCacheEntry, string>;

  constructor() {
    super('TravelPlanDB');
    this.version(10).stores({
      users: 'id, role, allow_login',
      trips: 'id, title, start_date, end_date, visible_status, is_public, last_accessed',
      tripMembers: '[trip_id+user_id], trip_id, user_id',
      itineraries: 'id, trip_id, date, start_time, google_place_id',
      subItineraries: 'id, itinerary_id, start_time',
      expenses: 'id, trip_id, date, payer_id',
      bookings: 'id, trip_id, start_date, category, google_place_id',
      cities: 'id, name, country',
      appSettings: 'id, key_name'
    });
    this.version(11).stores({
      users: 'id, role, allow_login',
      trips: 'id, title, start_date, end_date, visible_status, is_public, last_accessed',
      tripMembers: '[trip_id+user_id], trip_id, user_id',
      itineraries: 'id, trip_id, date, start_time, google_place_id',
      subItineraries: 'id, itinerary_id, start_time',
      expenses: 'id, trip_id, date, payer_id',
      bookings: 'id, trip_id, start_date, category, google_place_id',
      cities: 'id, name, country',
      appSettings: 'id, key_name',
      placesCache: 'query, cachedAt',
      placeDetailsCache: 'place_id, cachedAt'
    });
  }
}

export const db = new TravelPlanDB();