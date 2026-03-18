import Dexie, { Table } from 'dexie';
import { 
  User, Trip, TripMember, Itinerary, SubItinerary, 
  Expense, Transportation, Accommodation, Rental, AppSetting, Booking, City 
} from './types';

export class TravelPlanDB extends Dexie {
  users!: Table<User, number>;
  trips!: Table<Trip, number>;
  tripMembers!: Table<TripMember, [number, number]>; // Compound key
  itineraries!: Table<Itinerary, number>;
  subItineraries!: Table<SubItinerary, string>;
  expenses!: Table<Expense, number>;
  transportations!: Table<Transportation, number>;
  accommodations!: Table<Accommodation, number>;
  rentals!: Table<Rental, number>;
  bookings!: Table<Booking, number>;
  cities!: Table<City, number>;
  appSettings!: Table<AppSetting, string>;

  constructor() {
    super('TravelPlanDB');
    this.version(8).stores({
      users: 'id, role, allow_login',
      trips: 'id, title, start_date, end_date, visible_status, is_public, last_accessed',
      tripMembers: '[trip_id+user_id], trip_id, user_id',
      itineraries: 'id, trip_id, date, start_time',
      subItineraries: 'id, itinerary_id, start_time',
      expenses: 'id, trip_id, date, payer_id',
      transportations: 'id, trip_id, dep_date, type',
      accommodations: 'id, trip_id, check_in_date',
      rentals: 'id, trip_id, check_in_date',
      bookings: 'id, trip_id, start_date, category',
      cities: 'id, name, country',
      appSettings: 'id, key_name'
    });
  }
}

export const db = new TravelPlanDB();
