import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';

const app = express();
const PORT = 3000;

app.use(express.json());

// --- Database Setup ---
const db = new Database(':memory:');

db.exec(`
  CREATE TABLE IF NOT EXISTS Users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'guest',
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'
  );

  CREATE TABLE IF NOT EXISTS Trips (
    id TEXT PRIMARY KEY,
    title TEXT,
    cover_image_url TEXT,
    start_date TEXT,
    end_date TEXT,
    currencies TEXT, -- JSON
    visible_status INTEGER,
    timezone TEXT
  );

  CREATE TABLE IF NOT EXISTS Trip_Members (
    trip_id TEXT,
    user_id TEXT,
    PRIMARY KEY (trip_id, user_id),
    FOREIGN KEY(trip_id) REFERENCES Trips(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES Users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS Itineraries (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    date TEXT,
    start_time TEXT,
    end_time TEXT,
    title TEXT,
    address TEXT,
    image_url TEXT,
    notes TEXT,
    tags TEXT, -- JSON
    next_transport_mode TEXT,
    custom_transport_time INTEGER,
    FOREIGN KEY(trip_id) REFERENCES Trips(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS Sub_Itineraries (
    id TEXT PRIMARY KEY,
    itinerary_id TEXT,
    start_time TEXT,
    end_time TEXT,
    title TEXT,
    tags TEXT,
    notes TEXT,
    FOREIGN KEY(itinerary_id) REFERENCES Itineraries(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS Expenses (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    date TEXT,
    item_name TEXT,
    amount REAL,
    currency TEXT,
    payer_id TEXT,
    split_members TEXT, -- JSON
    notes TEXT,
    FOREIGN KEY(trip_id) REFERENCES Trips(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS Flights (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    flight_name TEXT,
    flight_code TEXT,
    departure_time TEXT,
    departure_terminal TEXT,
    arrival_time TEXT,
    arrival_terminal TEXT,
    notes TEXT,
    FOREIGN KEY(trip_id) REFERENCES Trips(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS Accommodations (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    hotel_name TEXT,
    address TEXT,
    check_in_date TEXT,
    check_out_date TEXT,
    notes TEXT,
    FOREIGN KEY(trip_id) REFERENCES Trips(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS App_Settings (
    id TEXT PRIMARY KEY,
    key_name TEXT,
    value TEXT
  );
`);

// Seed Data
db.exec(`
  INSERT INTO Users (id, role, name, password_hash) VALUES 
  ('admin', 'Admin', 'Admin User', '0192023a7bbd73250516f069df18b5004348d494e18c8c6a0865c589237b7c2a'),
  ('editor', 'Editor', 'Editor User', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'),
  ('guest', 'Guest', 'Guest User', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');

  INSERT INTO App_Settings (id, key_name, value) VALUES 
  ('s1', 'top_bar_bg', 'https://picsum.photos/seed/travel/800/200');

  INSERT INTO Trips (id, title, cover_image_url, start_date, end_date, currencies, visible_status, timezone) VALUES 
  ('t1', 'Japan Adventure', 'https://picsum.photos/seed/japan/800/400', '2026-03-01', '2026-03-10', '["JPY", "TWD"]', 1, 'Asia/Tokyo'),
  ('t2', 'Europe Tour', 'https://picsum.photos/seed/europe/800/400', '2026-05-01', '2026-05-15', '["EUR", "TWD"]', 1, 'Europe/Paris');

  INSERT INTO Trip_Members (trip_id, user_id) VALUES 
  ('t1', 'u1'), ('t1', 'u2'), ('t2', 'u1');

  INSERT INTO Itineraries (id, trip_id, date, start_time, end_time, title, address, image_url, notes, tags, next_transport_mode, custom_transport_time) VALUES 
  ('i1', 't1', '2026-03-01', '09:00', '11:00', 'Arrive at NRT', 'Narita Airport', 'https://picsum.photos/seed/nrt/400/200', 'Pick up JR Pass', '["Flight"]', 'Train', 60),
  ('i2', 't1', '2026-03-01', '12:00', '14:00', 'Check-in Hotel', 'Shinjuku', 'https://picsum.photos/seed/hotel/400/200', 'Rest', '["Accommodation"]', 'Walk', 15),
  ('i3', 't1', '2026-03-02', '10:00', '12:00', 'Senso-ji Temple', 'Asakusa', 'https://picsum.photos/seed/temple/400/200', 'Buy souvenirs', '["Sightseeing"]', 'Train', 30);

  INSERT INTO Expenses (id, trip_id, date, item_name, amount, currency, payer_id, split_members, notes) VALUES
  ('e1', 't1', '2026-03-01', 'JR Pass', 30000, 'JPY', 'u1', '["u1", "u2"]', 'Bought at airport');
`);

// --- API Routes ---

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  // Mock login: search by id (which is the login account)
  const user = db.prepare('SELECT * FROM Users WHERE id = ?').get(username);
  if (user) {
    res.json({ token: 'mock-token', user });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

import { AppSetting, Trip, Itinerary, Expense, User, TripMember } from './src/types';

app.get('/api/settings', (req, res) => {
  const settings = db.prepare('SELECT * FROM App_Settings').all() as AppSetting[];
  res.json(settings);
});

app.get('/api/trips', (req, res) => {
  const trips = db.prepare('SELECT * FROM Trips WHERE visible_status = 1').all() as Trip[];
  res.json(trips.map(t => ({ ...t, currencies: JSON.parse(t.currencies as string) })));
});

app.get('/api/trips/:id', (req, res) => {
  const trip = db.prepare('SELECT * FROM Trips WHERE id = ?').get(req.params.id) as Trip | undefined;
  if (trip) {
    trip.currencies = JSON.parse(trip.currencies as string);
    res.json(trip);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.get('/api/trips/:id/itineraries', (req, res) => {
  const itineraries = db.prepare('SELECT * FROM Itineraries WHERE trip_id = ? ORDER BY date, start_time').all(req.params.id) as Itinerary[];
  res.json(itineraries.map(i => ({ ...i, tags: JSON.parse(i.tags as string) })));
});

app.get('/api/trips/:id/expenses', (req, res) => {
  const expenses = db.prepare('SELECT * FROM Expenses WHERE trip_id = ? ORDER BY date').all(req.params.id) as Expense[];
  res.json(expenses.map(e => ({ ...e, split_members: JSON.parse(e.split_members as string) })));
});

app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT * FROM Users').all() as User[];
  const members = db.prepare('SELECT * FROM Trip_Members').all() as TripMember[];
  const trips = db.prepare('SELECT * FROM Trips').all() as Trip[];
  
  const usersWithTrips = users.map(u => {
    const userTrips = members.filter(m => m.user_id === u.id).map(m => trips.find(t => t.id === m.trip_id));
    const hasPublicTrip = userTrips.some(t => t && t.visible_status === 1);
    return { ...u, hasPublicTrip };
  });
  
  // Sort: hasPublicTrip first
  usersWithTrips.sort((a, b) => (b.hasPublicTrip ? 1 : 0) - (a.hasPublicTrip ? 1 : 0));
  
  res.json(usersWithTrips);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
