DROP TABLE IF EXISTS TripMembers;
DROP TABLE IF EXISTS Sub_Itineraries;
DROP TABLE IF EXISTS Expenses;
DROP TABLE IF EXISTS Flights;
DROP TABLE IF EXISTS Accommodations;
DROP TABLE IF EXISTS Itineraries;
DROP TABLE IF EXISTS Trips;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS App_Settings;

CREATE TABLE Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL DEFAULT 'user',
    name TEXT NOT NULL,
    avatar_url TEXT,
    password_hash TEXT NOT NULL,
    allow_login INTEGER DEFAULT 1,
    created_at INTEGER, 
    updated_at INTEGER
);

CREATE TABLE Trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, 
    cover_image_url TEXT,
    start_date TEXT NOT NULL, 
    end_date TEXT NOT NULL, -- 格式 YYYY-MM-DD
    currencies TEXT DEFAULT '["TWD"]', 
    is_public INTEGER DEFAULT 0,
    default_city_id INTEGER,
    timezone TEXT DEFAULT 'UTC',
    created_at INTEGER, 
    updated_at INTEGER
);

CREATE TABLE TripMembers (
    trip_id INTEGER, 
    user_id INTEGER, 
    role TEXT DEFAULT 'Member',
    PRIMARY KEY (trip_id, user_id),
    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE Itineraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER, 
    date TEXT NOT NULL,
    start_time TEXT, 
    end_time TEXT,
    title TEXT NOT NULL, 
    address TEXT, 
    image_url TEXT, 
    notes TEXT, 
    tags TEXT DEFAULT '[]',
    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
);

CREATE TABLE Sub_Itineraries (
  id TEXT PRIMARY KEY,
  itinerary_id INTEGER,
  start_time TEXT,
  end_time TEXT,
  title TEXT,
  tags TEXT,
  notes TEXT,
  FOREIGN KEY (itinerary_id) REFERENCES Itineraries(id) ON DELETE CASCADE
);

CREATE TABLE Expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER, 
    item_name TEXT NOT NULL, 
    amount REAL NOT NULL,
    currency TEXT NOT NULL, 
    date TEXT NOT NULL,
    payer_id INTEGER, 
    split_members TEXT, 
    notes TEXT,
    created_at INTEGER, 
    updated_at INTEGER,
    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE,
    FOREIGN KEY (payer_id) REFERENCES Users(id)
);

CREATE TABLE Flights (
  id TEXT PRIMARY KEY,
  trip_id INTEGER,
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
  trip_id INTEGER,
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
