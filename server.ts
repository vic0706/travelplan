import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Local SQLite for development
  const db = new Database('local.db');
  
  // Initialize DB if needed
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  app.use(express.json());

  // Helper: Generate SHA-256 Hash
  const generateHash = (password: string, salt: string) => {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
  };

  // API Routes (Mimicking Worker)
  app.post('/api/init', (req, res) => {
    const row = db.prepare('SELECT COUNT(*) as count FROM Users').get() as { count: number };
    if (row.count === 0) {
      const salt = process.env.PASSWORD_SALT || 'default_salt';
      const passwordHash = generateHash('123456', salt);
      const adminId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO Users (id, role, name, avatar_url, password_hash, allow_login) 
        VALUES (?, 'Admin', 'Admin', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin', ?, 1)
      `).run(adminId, passwordHash);
      return res.json({ success: true, message: 'Admin user created.' });
    }
    res.json({ success: false, message: 'Already initialized.' });
  });

  app.get('/api/users/login-list', (req, res) => {
    const users = db.prepare('SELECT id, name, avatar_url, role FROM Users WHERE allow_login = 1').all();
    res.json(users);
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM Users WHERE name = ?').get(username) as any;
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const salt = process.env.PASSWORD_SALT || 'default_salt';
    if (user.password_hash !== generateHash(password, salt)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser });
  });

  app.get('/api/trips', (req, res) => {
    const trips = db.prepare('SELECT * FROM Trips WHERE visible_status = 1 ORDER BY start_date DESC').all();
    res.json(trips);
  });

  app.get('/api/trips/:id', (req, res) => {
    const trip = db.prepare('SELECT * FROM Trips WHERE id = ?').get(req.params.id) as any;
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.currencies) trip.currencies = JSON.parse(trip.currencies);
    res.json(trip);
  });

  app.get('/api/trips/:id/itineraries', (req, res) => {
    const items = db.prepare('SELECT * FROM Itineraries WHERE trip_id = ? ORDER BY date, start_time').all(req.params.id) as any[];
    res.json(items.map(i => ({ ...i, tags: i.tags ? JSON.parse(i.tags) : [] })));
  });

  app.get('/api/trips/:id/expenses', (req, res) => {
    const items = db.prepare('SELECT * FROM Expenses WHERE trip_id = ? ORDER BY date').all(req.params.id) as any[];
    res.json(items.map(i => ({ ...i, split_members: i.split_members ? JSON.parse(i.split_members) : [] })));
  });

  app.get('/api/settings', (req, res) => {
    const settings = db.prepare('SELECT * FROM App_Settings').all();
    res.json(settings);
  });

  app.get('/api/users', (req, res) => {
    const users = db.prepare('SELECT id, name, avatar_url, role FROM Users').all();
    res.json(users);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist/index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
