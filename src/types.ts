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
  is_public?: boolean;
  members?: TripMember[];
}

export interface TripMember {
  trip_id: number;
  user_id: number;
  id?: number; // Alias for user_id returned by some queries
  role: string;
  name?: string;
  avatar_url?: string;
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
  tags: string[];
  icon?: string;
  sub_items?: string;
  stay_duration?: string;
  type?: 'GENERAL' | 'TRANSPORTATION' | 'ACCOMMODATION' | 'RENTAL';
  related_id?: number;
  next_transport_mode?: string;
  next_transport_time?: string;
  next_transport_auto_time?: string;
  lat?: number;
  lng?: number;
  
  // 💡 新增的智慧同步欄位
  google_place_id?: string;
  rating?: number;
  reviews_count?: number;
  opening_hours?: string; // 儲存為 JSON 字串
  place_website?: string;
  place_phone?: string;
  place_status?: string;
  review_summary?: string;
  sync_conflict_warning?: string;
}

export interface SubItinerary {
  id: string;
  itinerary_id: number;
  start_time: string;
  end_time: string;
  title: string;
  tags: string;
  notes: string;
  address?: string;
  lat?: number;
  lng?: number;
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

export interface AppSetting {
  id: string;
  key_name: string;
  value: string;
}

export type BookingCategory = 'FLIGHT' | 'TRAIN' | 'FERRY' | 'RENTAL' | 'PRIVATE_TRANSFER' | 'HOTEL' | 'BUS';

export interface Booking {
  id: number;
  trip_id: number;
  category: BookingCategory;
  title: string;
  provider?: string;
  order_id?: string;
  city_id?: number;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  start_location: string;
  end_location?: string;
  notes?: string;
  image_url?: string;
  details: string | any;
  created_at?: number;

  // 💡 新增的智慧同步欄位
  google_place_id?: string;
  rating?: number;
  reviews_count?: number;
  opening_hours?: string;
}

export interface TransportBookingDetails {
  code?: string;
  dep_terminal?: string;
  arr_terminal?: string;
  dep_buffer?: number;
  arr_buffer?: number;
}

export interface HotelBookingDetails {
  daily_start_time?: string;
  daily_end_time?: string;
}