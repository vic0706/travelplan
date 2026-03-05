export interface User {
  id: number;
  role: string;
  name: string;
  avatar_url: string;
  allow_login: number;
  payment_info?: string; // JSON string
  created_at?: number;
  updated_at?: number;
}

export interface City {
  id: number;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

export interface Trip {
  id: number;
  title: string;
  cover_image_url: string;
  start_date: string;
  end_date: string;
  currencies: string[]; // Parsed from JSON
  default_city_id?: number;
  created_at?: number;
  updated_at?: number;
  // Local cache fields
  last_accessed?: number;
  is_fully_synced?: boolean;
  is_public?: boolean; // New field for public/private status
  members?: TripMember[]; // New field to store trip members for access control
}

export interface TripMember {
  trip_id: number;
  user_id: number;
  role: string;
}

export interface Itinerary {
  id: number;
  trip_id: number;
  city_id?: number;
  city_name?: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  address: string;
  image_url: string;
  notes: string;
  tags: string[]; // Parsed from JSON
  icon?: string; // New field for activity icon
  sub_items?: string; // JSON string of sub-items (Legacy, but kept for compatibility if needed, or we can remove if we fully switch)
  stay_duration?: string;
  type?: 'GENERAL' | 'TRANSPORTATION' | 'ACCOMMODATION';
  related_id?: number;
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
  category?: string;
  payer_id: number;
  split_members: number[]; // Parsed from JSON (User IDs)
  notes: string;
  created_at?: number;
  updated_at?: number;
}

export interface Transportation {
  id: number;
  trip_id: number;
  type: 'FLIGHT' | 'TRAIN' | 'BUS' | 'FERRY' | 'DRIVING';
  provider?: string;
  code?: string;
  
  // Departure
  dep_station: string;
  dep_date: string; // YYYY-MM-DD
  dep_time: string; // HH:mm
  dep_terminal?: string;
  dep_checkin_buffer?: number; // Minutes

  // Arrival
  arr_station: string;
  arr_date: string; // YYYY-MM-DD
  arr_time: string; // HH:mm
  arr_terminal?: string;
  arr_exit_buffer?: number; // Minutes

  order_id?: string;
  notes?: string;
}

export interface Accommodation {
  id: number;
  trip_id: number;
  hotel_name: string;
  address?: string;
  check_in_date: string;
  check_in_time?: string;
  check_out_date: string;
  check_out_time?: string;
  daily_start_time?: string;
  daily_end_time?: string;
  order_id?: string;
  notes?: string;
  image_url?: string;
  created_at?: number;
}

export interface AppSetting {
  id: string;
  key_name: string;
  value: string;
}
