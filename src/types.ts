export interface User {
  id: string;
  role: 'Admin' | 'User' | 'Guest';
  name: string;
  avatar_url: string;
  allow_login: number;
}

export interface Trip {
  id: string;
  title: string;
  cover_image_url: string;
  start_date: string;
  end_date: string;
  currencies: string[]; // Parsed from JSON
  visible_status: number;
  timezone: string;
  // Local cache fields
  last_accessed?: number;
  is_fully_synced?: boolean;
}

export interface TripMember {
  trip_id: string;
  user_id: string;
}

export interface Itinerary {
  id: string;
  trip_id: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  address: string;
  image_url: string;
  notes: string;
  tags: string[]; // Parsed from JSON
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
  date: string;
  item_name: string;
  amount: number;
  currency: string;
  payer_id: string;
  split_members: string[]; // Parsed from JSON (User IDs)
  notes: string;
}

export interface Flight {
  id: string;
  trip_id: string;
  date: string;
  flight_number: string;
  departure_airport: string;
  arrival_airport: string;
  departure_time: string;
  arrival_time: string;
}

export interface Accommodation {
  id: string;
  trip_id: string;
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
