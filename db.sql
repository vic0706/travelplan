-- 1. 使用者表
CREATE TABLE IF NOT EXISTS Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL DEFAULT 'user',
    name TEXT NOT NULL,
    avatar_url TEXT,
    password_hash TEXT NOT NULL,
    allow_login INTEGER DEFAULT 1,
    created_at INTEGER, updated_at INTEGER
);
-- 2. 旅遊行程表 
CREATE TABLE IF NOT EXISTS Trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, cover_image_url TEXT,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, -- 格式 YYYY-MM-DD
    currencies TEXT DEFAULT '["TWD"]', visible_status INTEGER DEFAULT 1,
    created_at INTEGER, updated_at INTEGER
);
-- 3. 行程成員關聯表
CREATE TABLE IF NOT EXISTS TripMembers (
    trip_id INTEGER, user_id INTEGER, role TEXT DEFAULT 'Member',
    PRIMARY KEY (trip_id, user_id)
);
-- 4. 每日詳細行程表
CREATE TABLE IF NOT EXISTS Itineraries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER, date TEXT NOT NULL,
    start_time TEXT, end_time TEXT,
    title TEXT NOT NULL, address TEXT, image_url TEXT, notes TEXT, tags TEXT DEFAULT '[]'
);
-- 5. 支出帳務表
CREATE TABLE IF NOT EXISTS Expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER, item_name TEXT NOT NULL, amount REAL NOT NULL,
    currency TEXT NOT NULL, date TEXT NOT NULL,
    payer_id INTEGER, split_members TEXT, notes TEXT,
    created_at INTEGER, updated_at INTEGER
);
-- 6. 設定表 (worker.ts 裡面有用到)
CREATE TABLE IF NOT EXISTS Settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER
);
