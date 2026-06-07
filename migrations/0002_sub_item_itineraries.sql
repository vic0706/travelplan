-- Migration: create SubItemItineraries table
-- Run once against your D1 database:
--   wrangler d1 execute travelplan --file=migrations/0002_sub_item_itineraries.sql

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
  FOREIGN KEY (itinerary_id) REFERENCES Itineraries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sub_items_itinerary ON SubItemItineraries(itinerary_id);
