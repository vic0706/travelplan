-- 行程卡片拖曳排序：加入 display_order 欄位
ALTER TABLE Itineraries ADD COLUMN display_order INTEGER DEFAULT NULL;

-- 每日設定（預設交通方式）
CREATE TABLE IF NOT EXISTS TripDaySettings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    default_transport_mode TEXT DEFAULT 'AUTO',
    UNIQUE(trip_id, date),
    FOREIGN KEY (trip_id) REFERENCES Trips(id) ON DELETE CASCADE
);
