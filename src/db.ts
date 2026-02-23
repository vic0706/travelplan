import Dexie, { Table } from 'dexie';
import { 
  User, Trip, TripMember, Itinerary, Expense
} from './types';

export interface SyncOperation {
  id?: number;
  url: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body?: any;
  createdAt: number;
}

export class TravelPlanDB extends Dexie {
  users!: Table<User, number>;
  trips!: Table<Trip, number>;
  tripMembers!: Table<TripMember, [number, number]>; // Compound key
  itineraries!: Table<Itinerary, number>;
  expenses!: Table<Expense, number>;
  syncQueue!: Table<SyncOperation, number>;

  constructor() {
    super('TravelPlanDB');
    this.version(3).stores({
      users: 'id, role, allow_login',
      trips: 'id, title, start_date, end_date, visible_status',
      tripMembers: '[trip_id+user_id], trip_id, user_id',
      itineraries: 'id, trip_id, date',
      expenses: 'id, trip_id, date, payer_id',
      syncQueue: '++id, createdAt'
    });
  }
}

export const db = new TravelPlanDB();
