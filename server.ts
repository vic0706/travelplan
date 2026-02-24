import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { app as honoApp } from './src/api';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createServer() {
  const app = express();
  console.log('Starting server with DB initialization...');

  try {
    console.log('Initializing sql.js...');
    const SQL = await initSqlJs({
      locateFile: file => {
        const wasmPath = path.join(__dirname, `../node_modules/sql.js/dist/${file}`);
        console.log(`Locating sql.js WASM file at: ${wasmPath}`);
        return wasmPath;
      }
    });
    console.log('sql.js initialized.');

    console.log('Reading database file...');
    const dbFile = fs.existsSync('data.db') ? fs.readFileSync('data.db') : null;
    const db = new SQL.Database(dbFile || undefined);
    console.log('Database object created.');

    console.log('Reading and executing schema...');
    const schema = fs.readFileSync('db.sql', 'utf8');
    db.exec(schema);
    console.log('Database schema executed successfully.');

    // Mock D1 for Hono
    const d1 = {
      prepare: (sql: string) => {
        const stmt = db.prepare(sql);
        return {
          bind: (...params: any[]) => {
            stmt.bind(params);
            return {
              all: async () => {
                const results = [];
                while (stmt.step()) {
                  results.push(stmt.getAsObject());
                }
                stmt.free();
                return { results };
              },
              run: async () => {
                stmt.run();
                stmt.free();
                return { meta: { changes: db.getRowsModified(), last_row_id: db.exec("select last_insert_rowid()")[0].values[0][0] } };
              }
            };
          },
          all: async () => {
            const results = [];
            while (stmt.step()) {
              results.push(stmt.getAsObject());
            }
            stmt.free();
            return { results };
          },
          run: async () => {
            stmt.run();
            stmt.free();
            return { meta: { changes: db.getRowsModified(), last_row_id: db.exec("select last_insert_rowid()")[0].values[0][0] } };
          }
        };
      },
      batch: async (statements: any[]) => {
          const results = [];
          for (const stmt of statements) {
            results.push(await stmt.run());
          }
          return results;
        }
    };

    // API Middleware
    app.use('/api/*', async (req, res) => {
      const env = { DB: d1, KV: {}, PASSWORD_SALT: 'salt' };
      const honoReq = new Request(req.protocol + '://' + req.get('host') + req.originalUrl, {
        method: req.method,
        headers: req.headers as any,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? (req as any) : undefined,
      });
      const honoRes = await honoApp.fetch(honoReq, env);
      res.status(honoRes.status);
      honoRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      res.send(await honoRes.text());
    });

    // Create Vite server in middleware mode.
    console.log('Creating Vite server...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    console.log('Vite server created.');

    // Use vite's connect instance as middleware
    app.use(vite.middlewares);

    app.listen(3000, '0.0.0.0', () => {
      console.log('Server with DB listening on http://localhost:3000');
    });

  } catch (error) {
    console.error('CRITICAL ERROR during server startup:', error);
    process.exit(1);
  }
}

createServer();
