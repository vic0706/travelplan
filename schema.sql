-- 1. 使用者 (Users)
CREATE TABLE Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL DEFAULT 'user',
    name TEXT NOT NULL,
    avatar_url TEXT,
    password_hash TEXT NOT NULL,
    allow_login INTEGER DEFAULT 1,
    payment_info TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000), 
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- 2. 城市 (Cities)
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

-- 3. 行程表 (Trips)
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
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000), 
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (default_city_id) REFERENCES Cities(id)
);

-- 4. 行程成員 (TripMembers)
CREATE TABLE TripMembers (
    trip_id INTEGER, 
    user_id INTEGER, 
    role TEXT DEFAULT 'Member',
    PRIMARY KEY (trip_id, user_id),
    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- 5. 分類 (Categories) - 修正原本 ExpenseCategories 的命名，使其共用於行程與記帳
CREATE TABLE Categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'circle',
    color TEXT DEFAULT '#808080',
    is_default INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- 預設插入基礎分類
INSERT INTO Categories (name, icon, color, is_default) VALUES ('Food', 'utensils', '#f97316', 1);
INSERT INTO Categories (name, icon, color, is_default) VALUES ('Shopping', 'shopping-bag', '#ec4899', 0);
INSERT INTO Categories (name, icon, color, is_default) VALUES ('Attraction', 'camera', '#3b82f6', 0);
INSERT INTO Categories (name, icon, color, is_default) VALUES ('Transport', 'bus', '#10b981', 0);
INSERT INTO Categories (name, icon, color, is_default) VALUES ('Accommodation', 'bed', '#8b5cf6', 0);

-- 6. 活動排程 (Itineraries) - 已補齊 AI 與 Google 整合所需的完整欄位
CREATE TABLE Itineraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER, 
    city_id INTEGER,
    date TEXT NOT NULL,
    
    -- 基礎設定
    start_time TEXT, 
    end_time TEXT,
    title TEXT NOT NULL, 
    address TEXT, 
    image_url TEXT, 
    notes TEXT, 
    tags TEXT DEFAULT '[]',
    sub_items TEXT DEFAULT '[]', -- JSON Array (已取代舊的 Sub_Itineraries 表)
    type TEXT DEFAULT 'GENERAL',
    related_id INTEGER,
    icon TEXT DEFAULT '',
    
    -- AI 智慧排程專用欄位
    is_time_fixed INTEGER DEFAULT 0,
    time_preference TEXT DEFAULT 'anytime',
    stay_duration TEXT DEFAULT '60',
    
    -- 交通銜接專用欄位
    next_transport_mode TEXT DEFAULT '',
    next_transport_time TEXT DEFAULT '',
    next_transport_auto_time TEXT DEFAULT '',
    next_transport_resolved_mode TEXT DEFAULT '',
    next_transport_haversine_time TEXT DEFAULT '',
    next_transport_custom_label TEXT DEFAULT '',

    -- Google Places API 豐富化欄位
    lat REAL,
    lng REAL,
    google_place_id TEXT,
    rating REAL,
    reviews_count INTEGER,
    opening_hours TEXT, -- JSON Array
    place_website TEXT,
    place_phone TEXT,
    place_status TEXT,
    review_summary TEXT,
    sync_conflict_warning TEXT,
    display_order INTEGER DEFAULT NULL,
    backup_for_id INTEGER DEFAULT NULL REFERENCES Itineraries(id) ON DELETE CASCADE,

    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
);

-- 每日設定 (TripDaySettings)
CREATE TABLE IF NOT EXISTS TripDaySettings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    default_transport_mode TEXT DEFAULT 'AUTO',
    UNIQUE(trip_id, date),
    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
);

-- 6b. 子活動 (SubItemItineraries) — 獨立 table 取代 sub_items JSON 欄位
CREATE TABLE IF NOT EXISTS SubItemItineraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    itinerary_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    address TEXT DEFAULT '',
    lat REAL,
    lng REAL,
    start_time TEXT DEFAULT '',
    end_time TEXT DEFAULT '',
    duration INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    display_order INTEGER DEFAULT 0,
    next_walk_mins INTEGER DEFAULT 0,
    FOREIGN KEY (itinerary_id) REFERENCES Itineraries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sub_items_itinerary ON SubItemItineraries(itinerary_id);

-- 7. 記帳 (Expenses)
CREATE TABLE Expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER, 
    item_name TEXT NOT NULL, 
    amount REAL NOT NULL,
    currency TEXT NOT NULL, 
    date TEXT NOT NULL,
    payer_id INTEGER, 
    split_members TEXT, 
    category TEXT DEFAULT 'Other',
    notes TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000), 
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE,
    FOREIGN KEY (payer_id) REFERENCES Users(id)
);

-- 8. 預訂紀錄 (Bookings) - 已擴增支援 Google 欄位
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
    
    -- Google Places 輔助欄位
    google_place_id TEXT,
    rating REAL,
    reviews_count INTEGER,
    opening_hours TEXT,

    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
);

-- 9. 系統設定 (App_Settings)
CREATE TABLE App_Settings (
  id TEXT PRIMARY KEY,
  key_name TEXT UNIQUE,
  value TEXT
);