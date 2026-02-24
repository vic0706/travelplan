export interface User {
  id: number;
  role: string;
  name: string;
  avatar_url: string;
  allow_login: number;
  created_at?: number;
  updated_at?: number;
}

export interface Trip {
  id: number;
  title: string;
  cover_image_url: string;
  start_date: string;
  end_date: string;
  currencies: string[]; // Parsed from JSON
  visible_status: number;
  created_at?: number;
  updated_at?: number;
  // Local cache fields
  last_accessed?: number;
  is_fully_synced?: boolean;
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
}

export interface SubItinerary {
  id: string;
  itinerary_id: number;
  start_time: string;
  end_time: string;
  title: string;
  tags: string;
  notes: string;
}

export interface Expense {
  id: number;
  trip_id: number;
  date: string;
  item_name: string;
  amount: number;
  currency: string;
  payer_id: number;
  split_members: number[]; // Parsed from JSON (User IDs)
  notes: string;
  created_at?: number;
  updated_at?: number;
}

export interface Flight {
  id: string;
  trip_id: number;
  date: string;
  flight_number: string;
  departure_airport: string;
  arrival_airport: string;
  departure_time: string;
  arrival_time: string;
}

export interface Accommodation {
  id: string;
  trip_id: number;
  check_in_date: string;
  check_out_date: string;
  name: string;
  address: string;
  notes: string;
}

export interface AppSetting {
  id: string;
  key_name: string;
  value: string;
}
