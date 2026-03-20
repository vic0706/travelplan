CREATE TABLE Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL DEFAULT 'user',
    name TEXT NOT NULL,
    avatar_url TEXT,
    password_hash TEXT NOT NULL,
    allow_login INTEGER DEFAULT 1,
    payment_info TEXT DEFAULT '{}',
    created_at INTEGER, 
    updated_at INTEGER
);

CREATE TABLE Cities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
);

INSERT INTO Cities (name, country, lat, lng) VALUES ('台北', '台灣', 25.0330, 121.5654);
INSERT INTO Cities (name, country, lat, lng) VALUES ('東京', '日本', 35.6762, 139.6503);
INSERT INTO Cities (name, country, lat, lng) VALUES ('大阪', '日本', 34.6937, 135.5023);
INSERT INTO Cities (name, country, lat, lng) VALUES ('首爾', '韓國', 37.5665, 126.9780);
INSERT INTO Cities (name, country, lat, lng) VALUES ('曼谷', '泰國', 13.7563, 100.5018);
INSERT INTO Cities (name, country, lat, lng) VALUES ('倫敦', '英國', 51.5074, -0.1278);
INSERT INTO Cities (name, country, lat, lng) VALUES ('巴黎', '法國', 48.8566, 2.3522);
INSERT INTO Cities (name, country, lat, lng) VALUES ('紐約', '美國', 40.7128, -74.0060);

CREATE TABLE Trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, 
    cover_image_url TEXT,
    start_date TEXT NOT NULL, 
    end_date TEXT NOT NULL,
    currencies TEXT DEFAULT '["TWD"]', 
    timezone TEXT DEFAULT 'UTC',
    default_city_id INTEGER,
    is_public INTEGER DEFAULT 0,
    created_at INTEGER, 
    updated_at INTEGER,
    FOREIGN KEY (default_city_id) REFERENCES Cities(id)
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
    city_id INTEGER,
    date TEXT NOT NULL,
    start_time TEXT, 
    end_time TEXT,
    title TEXT NOT NULL, 
    address TEXT, 
    image_url TEXT, 
    notes TEXT, 
    tags TEXT DEFAULT '[]',
    sub_items TEXT DEFAULT '[]',
    stay_duration TEXT DEFAULT '',
    type TEXT DEFAULT 'GENERAL',
    related_id INTEGER,
    icon TEXT DEFAULT '',
    next_transport_mode TEXT DEFAULT '',
    next_transport_time TEXT DEFAULT '',
    next_transport_auto_time TEXT DEFAULT '',
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

CREATE TABLE ExpenseCategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'circle',
    color TEXT DEFAULT '#808080',
    is_default INTEGER DEFAULT 0,
    created_at INTEGER
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
    category TEXT DEFAULT 'other',
    notes TEXT,
    created_at INTEGER, 
    updated_at INTEGER,
    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE,
    FOREIGN KEY (payer_id) REFERENCES Users(id)
);

CREATE TABLE Bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    category TEXT NOT NULL,       -- 'FLIGHT', 'TRAIN', 'FERRY', 'RENTAL', 'PRIVATE_TRANSFER', 'HOTEL'
    title TEXT NOT NULL,
    provider TEXT,
    order_id TEXT,
    start_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_date TEXT NOT NULL,
    end_time TEXT NOT NULL,
    start_location TEXT NOT NULL,
    end_location TEXT,
    notes TEXT,
    image_url TEXT,
    details TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
);

CREATE TABLE App_Settings (
  id TEXT PRIMARY KEY,
  key_name TEXT UNIQUE,
  value TEXT
);
