import Dexie, { Table } from 'dexie';
import { 
  User, Trip, TripMember, Itinerary, SubItinerary, 
  Expense, AppSetting, Booking, City 
} from './types';

export class TravelPlanDB extends Dexie {
  users!: Table<User, number>;
  trips!: Table<Trip, number>;
  tripMembers!: Table<TripMember, [number, number]>; // Compound key
  itineraries!: Table<Itinerary, number>;
  subItineraries!: Table<SubItinerary, string>;
  expenses!: Table<Expense, number>;
  bookings!: Table<Booking, number>;
  cities!: Table<City, number>;
  appSettings!: Table<AppSetting, string>;

  constructor() {
    super('TravelPlanDB');
    // Version 9: Removed transportations, accommodations, rentals
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
  }
}

export const db = new TravelPlanDB();