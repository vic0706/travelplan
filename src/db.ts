import Dexie, { Table } from 'dexie';

export interface Trip {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  timezone: string;
  cover_image_url?: string;
  visible_status: number;
  created_at?: string;
  // Local cache fields
  last_accessed?: number; 
  is_fully_synced?: boolean; // For deep caching status
}

export interface Itinerary {
  id: string;
  trip_id: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  location: string;
  notes?: string;
  cost?: number;
  created_at?: string;
}

export interface Expense {
  id: string;
  trip_id: string;
  date: string;
  category: string;
  amount: number;
  currency: string;
  notes?: string;
  created_at?: string;
}

export interface SyncOperation {
  id?: number;
  url: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body?: any;
  createdAt: number;
}

export class TravelPlanDB extends Dexie {
  trips!: Table<Trip, string>;
  itineraries!: Table<Itinerary, string>;
  expenses!: Table<Expense, string>;
  syncQueue!: Table<SyncOperation, number>;

  constructor() {
    super('TravelPlanDB');
    this.version(1).stores({
      trips: 'id, title, start_date, end_date, last_accessed',
      itineraries: 'id, trip_id, date, start_time',
      expenses: 'id, trip_id, date, category',
      syncQueue: '++id, createdAt'
    });
  }
}

export const db = new TravelPlanDB();
