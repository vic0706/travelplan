import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { app as honoApp } from "./src/worker.js"; // Import the Hono app

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("data.db");

// Initialize DB with schema
const schema = fs.readFileSync("db.sql", "utf8");
db.exec(schema);

// Mock D1 Database interface
const d1 = {
  prepare: (sql: string) => ({
    bind: (...params: any[]) => ({
      all: async () => {
        const stmt = db.prepare(sql);
        return { results: stmt.all(...params) };
      },
      run: async () => {
        const stmt = db.prepare(sql);
        const info = stmt.run(...params);
        return { meta: { last_row_id: info.lastInsertRowid, changes: info.changes } };
      }
    }),
    all: async () => {
      const stmt = db.prepare(sql);
      return { results: stmt.all() };
    },
    run: async () => {
      const stmt = db.prepare(sql);
      const info = stmt.run();
      return { meta: { last_row_id: info.lastInsertRowid, changes: info.changes } };
    }
  }),
  batch: async (statements: any[]) => {
    const results = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }
};

// Mock KV Namespace
const kvStore = new Map<string, string>();
const kv = {
  get: async (key: string) => kvStore.get(key) || null,
  put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
    kvStore.set(key, value);
    // Expiration not implemented in mock
  },
  delete: async (key: string) => {
    kvStore.delete(key);
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to inject bindings into Hono
  app.use("/api", async (req, res, next) => {
    // We need to adapt Express request to Hono request or just use Hono's fetch
    // But Hono's fetch expects a standard Request object.
    // A better way is to use @hono/node-server's adapter but we want to mix with Vite.
    next();
  });

  // Since we are using Hono for API, let's use a more direct approach
  // We'll use Hono for everything and let it handle Vite or vice versa.
  // Actually, the easiest is to mount Hono on /api using a custom handler.

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(async (req, res, next) => {
    if (req.url.startsWith("/api")) {
      // Adapt Express to Hono
      const url = new URL(req.url, `http://${req.headers.host}`);
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
      
      const body = await honoRes.arrayBuffer();
      res.send(Buffer.from(body));
    } else {
      vite.middlewares(req, res, next);
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
