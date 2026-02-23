export type Role = 'Guest' | 'Editor' | 'Admin';

export interface User {
  id: string;
  role: Role;
  name: string;
  password_hash?: string;
}

export interface AppSetting {
  id: string;
  key_name: string;
  value: string;
}

export interface Trip {
  id: string;
  title: string;
  cover_image_url: string;
  start_date: string; // UTC date string
  end_date: string; // UTC date string
  currencies: string | string[]; // JSON string or array of strings
  visible_status: number;
  timezone: string;
}

export interface TripMember {
  trip_id: string;
  user_id: string;
}

export interface Itinerary {
  id: string;
  trip_id: string;
  date: string; // UTC date string
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  title: string;
  address: string;
  image_url: string;
  notes: string;
  tags: string | string[]; // JSON string or array of strings
  next_transport_mode: string;
  custom_transport_time: number;
}

export interface SubItinerary {
  id: string;
  itinerary_id: string;
  start_time: string;
  end_time: string;
  title: string;
  tags: string;
  notes: string;
}

export interface Expense {
  id: string;
  trip_id: string;
  date: string; // UTC date string
  item_name: string;
  amount: number;
  currency: string;
  payer_id: string;
  split_members: string | string[]; // JSON string or array of user IDs
  notes: string;
}

export interface Flight {
  id: string;
  trip_id: string;
  flight_name: string;
  flight_code: string;
  departure_time: string; // UTC datetime string
  departure_terminal: string;
  arrival_time: string; // UTC datetime string
  arrival_terminal: string;
  notes: string;
}

export interface Accommodation {
  id: string;
  trip_id: string;
  hotel_name: string;
  address: string;
  check_in_date: string; // UTC date string
  check_out_date: string; // UTC date string
  notes: string;
}

declare global {
  interface ImportMetaEnv {
    VITE_WORKER_API_URL: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
