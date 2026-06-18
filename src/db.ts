import Dexie, { Table } from 'dexie';
import {
  User, Trip, TripMember, Itinerary, SubItinerary,
  Expense, AppSetting, Booking, City, TripDaySetting
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
  subItineraries!: Table<SubItinerary, number>;
  expenses!: Table<Expense, number>;
  bookings!: Table<Booking, number>;
  cities!: Table<City, number>;
  appSettings!: Table<AppSetting, string>;
  placesCache!: Table<PlacesCacheEntry, string>;
  placeDetailsCache!: Table<PlaceDetailsCacheEntry, string>;
  tripDaySettings!: Table<TripDaySetting, number>;

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
    // v12: subItineraries uses DB autoincrement id (number), compound index for ordering
    this.version(12).stores({
      users: 'id, role, allow_login',
      trips: 'id, title, start_date, end_date, visible_status, is_public, last_accessed',
      tripMembers: '[trip_id+user_id], trip_id, user_id',
      itineraries: 'id, trip_id, date, start_time, google_place_id',
      subItineraries: '++id, itinerary_id, [itinerary_id+display_order], start_time',
      expenses: 'id, trip_id, date, payer_id',
      bookings: 'id, trip_id, start_date, category, google_place_id',
      cities: 'id, name, country',
      appSettings: 'id, key_name',
      placesCache: 'query, cachedAt',
      placeDetailsCache: 'place_id, cachedAt'
    });
    // v13: itineraries get display_order for manual sorting; new tripDaySettings store
    this.version(13).stores({
      users: 'id, role, allow_login',
      trips: 'id, title, start_date, end_date, visible_status, is_public, last_accessed',
      tripMembers: '[trip_id+user_id], trip_id, user_id',
      itineraries: 'id, trip_id, date, start_time, display_order, google_place_id',
      subItineraries: '++id, itinerary_id, [itinerary_id+display_order], start_time',
      expenses: 'id, trip_id, date, payer_id',
      bookings: 'id, trip_id, start_date, category, google_place_id',
      cities: 'id, name, country',
      appSettings: 'id, key_name',
      placesCache: 'query, cachedAt',
      placeDetailsCache: 'place_id, cachedAt',
      tripDaySettings: '++id, [trip_id+date]'
    });
    // v14: itineraries get backup_for_id for backup plan feature
    this.version(14).stores({
      users: 'id, role, allow_login',
      trips: 'id, title, start_date, end_date, visible_status, is_public, last_accessed',
      tripMembers: '[trip_id+user_id], trip_id, user_id',
      itineraries: 'id, trip_id, date, start_time, display_order, google_place_id, backup_for_id',
      subItineraries: '++id, itinerary_id, [itinerary_id+display_order], start_time',
      expenses: 'id, trip_id, date, payer_id',
      bookings: 'id, trip_id, start_date, category, google_place_id',
      cities: 'id, name, country',
      appSettings: 'id, key_name',
      placesCache: 'query, cachedAt',
      placeDetailsCache: 'place_id, cachedAt',
      tripDaySettings: '++id, [trip_id+date]'
    });
  }
}

export const db = new TravelPlanDB();