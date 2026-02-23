DROP TABLE IF EXISTS Trip_Members;
DROP TABLE IF EXISTS Sub_Itineraries;
DROP TABLE IF EXISTS Expenses;
DROP TABLE IF EXISTS Flights;
DROP TABLE IF EXISTS Accommodations;
DROP TABLE IF EXISTS Itineraries;
DROP TABLE IF EXISTS Trips;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS App_Settings;

CREATE TABLE Users (
  id TEXT PRIMARY KEY,
  role TEXT,
  name TEXT,
  avatar_url TEXT,
  password_hash TEXT,
  allow_login INTEGER DEFAULT 1
);

CREATE TABLE Trips (
  id TEXT PRIMARY KEY,
  title TEXT,
  cover_image_url TEXT,
  start_date TEXT,
  end_date TEXT,
  currencies TEXT, -- JSON TEXT
  visible_status INTEGER,
  timezone TEXT
);

CREATE TABLE Trip_Members (
  trip_id TEXT,
  user_id TEXT,
  PRIMARY KEY (trip_id, user_id),
  FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE Itineraries (
  id TEXT PRIMARY KEY,
  trip_id TEXT,
  date TEXT,
  start_time TEXT,
  end_time TEXT,
  title TEXT,
  address TEXT,
  image_url TEXT,
  notes TEXT,
  tags TEXT, -- JSON TEXT
  next_transport_mode TEXT,
  custom_transport_time INTEGER,
  FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
);

CREATE TABLE Sub_Itineraries (
  id TEXT PRIMARY KEY,
  itinerary_id TEXT,
  start_time TEXT,
  end_time TEXT,
  title TEXT,
  tags TEXT,
  notes TEXT,
  FOREIGN KEY (itinerary_id) REFERENCES Itineraries(id) ON DELETE CASCADE
);

CREATE TABLE Expenses (
  id TEXT PRIMARY KEY,
  trip_id TEXT,
  date TEXT,
  item_name TEXT,
  amount REAL,
  currency TEXT,
  payer_id TEXT,
  split_members TEXT, -- JSON TEXT
  notes TEXT,
  FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE,
  FOREIGN KEY (payer_id) REFERENCES Users(id)
);

CREATE TABLE Flights (
  id TEXT PRIMARY KEY,
  trip_id TEXT,
  date TEXT,
  flight_number TEXT,
  departure_airport TEXT,
  arrival_airport TEXT,
  departure_time TEXT,
  arrival_time TEXT,
  FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
);

CREATE TABLE Accommodations (
  id TEXT PRIMARY KEY,
  trip_id TEXT,
  check_in_date TEXT,
  check_out_date TEXT,
  name TEXT,
  address TEXT,
  notes TEXT,
  FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
);

CREATE TABLE App_Settings (
  id TEXT PRIMARY KEY,
  key_name TEXT UNIQUE,
  value TEXT
);
