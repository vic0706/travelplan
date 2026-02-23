export interface User {
  id: number;
  role: 'Admin' | 'User' | 'Guest';
  name: string;
  avatar_url: string;
  allow_login: number;
}

export interface Trip {
  id: number;
  title: string;
  cover_image_url: string;
  start_date: string;
  end_date: string;
  currencies: string[]; // Parsed from JSON
  visible_status: number;
  last_accessed?: number;
  is_fully_synced?: boolean;
  created_at?: number;
  updated_at?: number;
}

export interface TripMember {
  trip_id: number;
  user_id: number;
  role: string;
}

export interface Itinerary {
  id: number;
  trip_id: number;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  address: string;
  image_url: string;
  notes: string;
  tags: string[]; // Parsed from JSON
  next_transport_mode?: string;
  custom_transport_time?: number;
}

export interface Expense {
  id: number;
  trip_id: number;
  item_name: string;
  amount: number;
  currency: string;
  date: string;
  payer_id: number;
  split_members: number[]; // Parsed from JSON (User IDs)
  notes: string;
  created_at?: number;
  updated_at?: number;
}
