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

CREATE TABLE Transportations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    type TEXT NOT NULL,           -- 'FLIGHT', 'TRAIN', 'BUS', 'FERRY', 'DRIVING'
    provider TEXT,                -- 航空公司/鐵路公司 (例如：JR East, 台灣高鐵)
    code TEXT,                    -- 班次編號 (例如：BR192, 0648)
    
    dep_station TEXT NOT NULL,    -- 出發站/碼頭/機場
    dep_time TEXT NOT NULL,       -- 出發時間 (ISO 8601 or YYYY-MM-DD HH:mm)
    arr_station TEXT NOT NULL,    -- 抵達站/碼頭/機場
    arr_time TEXT NOT NULL,       -- 抵達時間 (ISO 8601 or YYYY-MM-DD HH:mm)
    
    platform TEXT,                -- 月台/航廈/登船門
    seat_info TEXT,               -- 座位 (例如：2車 13A)
    order_id TEXT,                -- 訂購代號
    notes TEXT,
    
    -- Kept for logic compatibility
    checkin_duration INTEGER DEFAULT 120,
    exit_duration INTEGER DEFAULT 60,
    stay_duration INTEGER DEFAULT 0,

    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
);

CREATE TABLE Accommodations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    hotel_name TEXT NOT NULL,
    address TEXT,
    check_in_date TEXT NOT NULL,
    check_out_date TEXT NOT NULL,
    check_in_time TEXT DEFAULT '15:00',
    check_out_time TEXT DEFAULT '11:00',
    daily_start_time TEXT DEFAULT '08:00',
    daily_end_time TEXT DEFAULT '22:00',
    order_id TEXT,
    notes TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
);

CREATE TABLE App_Settings (
  id TEXT PRIMARY KEY,
  key_name TEXT UNIQUE,
  value TEXT
);
