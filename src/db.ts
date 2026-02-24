import Dexie, { Table } from 'dexie';
import { 
  User, Trip, TripMember, Itinerary, SubItinerary, 
  Expense, Flight, Accommodation, AppSetting 
} from './types';

export class TravelPlanDB extends Dexie {
  users!: Table<User, number>;
  trips!: Table<Trip, number>;
  tripMembers!: Table<TripMember, [number, number]>; // Compound key
  itineraries!: Table<Itinerary, number>;
  subItineraries!: Table<SubItinerary, string>;
  expenses!: Table<Expense, number>;
  flights!: Table<Flight, string>;
  accommodations!: Table<Accommodation, string>;
  appSettings!: Table<AppSetting, string>;

  constructor() {
    super('TravelPlanDB');
    this.version(3).stores({
      users: 'id, role, allow_login',
      trips: 'id, title, start_date, end_date, visible_status, last_accessed',
      tripMembers: '[trip_id+user_id], trip_id, user_id',
      itineraries: 'id, trip_id, date, start_time',
      subItineraries: 'id, itinerary_id, start_time',
      expenses: 'id, trip_id, date, payer_id',
      flights: 'id, trip_id, date',
      accommodations: 'id, trip_id, check_in_date',
      appSettings: 'id, key_name'
    });
  }
}

export const db = new TravelPlanDB();
