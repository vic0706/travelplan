import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { app as honoApp } from "./src/api.ts";
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock KV Namespace
const kvStore = new Map<string, string>();
const kv = {
  get: async (key: string) => kvStore.get(key) || null,
  put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
    kvStore.set(key, value);
  },
  delete: async (key: string) => {
    kvStore.delete(key);
  }
};

async function startServer() {
  try {
    console.log("Executing startServer() with sql.js...");

    const SQL = await initSqlJs({
      locateFile: file => path.join(__dirname, file)
    });

    const dbFile = fs.existsSync("data.db") ? fs.readFileSync("data.db") : null;
    const db = new SQL.Database(dbFile || undefined);

    const schema = fs.readFileSync("db.sql", "utf8");
    db.exec(schema);
    console.log("Database initialized successfully with sql.js.");

    // Mock D1 Database interface with sql.js
    const d1 = {
      prepare: (sql: string) => {
        const stmt = db.prepare(sql);
        return {
          bind: (...params: any[]) => {
            stmt.bind(params);
            return {
              all: async () => {
                const results = [];
                stmt.step();
                while (stmt.step()) {
                  results.push(stmt.getAsObject());
                }
                stmt.free();
                return { results };
              },
              run: async () => {
                stmt.run();
                const changes = db.getRowsModified();
                // sql.js doesn't directly support last_row_id in the same way.
                // This is a limitation of this mock.
                const last_row_id_stmt = db.prepare("SELECT last_insert_rowid()");
                last_row_id_stmt.step();
                const last_row_id = last_row_id_stmt.get()[0] as number;
                last_row_id_stmt.free();
                stmt.free();
                return { meta: { last_row_id, changes } };
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
            const changes = db.getRowsModified();
            const last_row_id_stmt = db.prepare("SELECT last_insert_rowid()");
            last_row_id_stmt.step();
            const last_row_id = last_row_id_stmt.get()[0] as number;
            last_row_id_stmt.free();
            stmt.free();
            return { meta: { last_row_id, changes } };
          }
        };
      },
      batch: async (statements: any[]) => {
        const results = [];
        for (const stmt of statements) {
          // Each 'stmt' in the array is an object with a 'run' method from the bind() call
          results.push(await stmt.run());
        }
        return results;
      }
    };

    const app = express();
    const PORT = 3000;

    console.log("Creating Vite server...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    console.log("Vite server created.");

    app.use(async (req, res, next) => {
      if (req.url.startsWith("/api")) {
        try {
          const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
          const honoReq = new Request(url.toString(), {
            method: req.method,
            headers: req.headers as any,
            body: req.method !== "GET" && req.method !== "HEAD" ? (req as any) : undefined,
            // @ts-ignore
            duplex: 'half'
          });

          const env = {
            DB: d1,
            KV: kv,
            PASSWORD_SALT: process.env.PASSWORD_SALT || "default_salt",
            __STATIC_CONTENT: {},
            __STATIC_CONTENT_MANIFEST: "{}"
          };

          const honoRes = await honoApp.fetch(honoReq, env);
          
          res.status(honoRes.status);
          honoRes.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          
          const responseBody = await honoRes.arrayBuffer();
          res.send(Buffer.from(responseBody));
        } catch (err) {
          console.error("API handler error:", err);
          res.status(500).send("Internal Server Error");
        }
      } else {
        vite.middlewares(req, res, next);
      }
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server listening on http://0.0.0.0:${PORT}`);
    });

  } catch (err) {
    console.error("Critical error in startServer():", err);
    process.exit(1);
  }
}

startServer();
