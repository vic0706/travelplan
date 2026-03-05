import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { Request as ExpressRequest } from 'express';

interface MulterRequest extends ExpressRequest {
  file: Express.Multer.File;
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseClient: any = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  
  if (!supabaseUrl) {
    console.error('ERROR: VITE_SUPABASE_URL is missing');
    return null;
  }

  const key = supabaseServiceKey || supabaseAnonKey;
  if (!key) {
    console.error('ERROR: Both SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_ANON_KEY are missing');
    return null;
  }

  if (supabaseServiceKey) {
    console.log('Initializing Supabase with SERVICE_ROLE_KEY (Bypassing RLS)');
  } else {
    console.warn('Initializing Supabase with ANON_KEY (RLS might block uploads)');
  }

  supabaseClient = createClient(supabaseUrl, key);
  return supabaseClient;
}

async function startServer() {
  console.log('Starting server...');
  const app = express();
  const PORT = 3000;

  app.use(express.json()); // Enable JSON body parsing

  // Multer setup for file uploads
  const upload = multer({ storage: multer.memoryStorage() });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Proxy /api/* to External Worker
  app.all('/api/*', async (req, res, next) => {
    // Skip /api/upload as it's handled below
    if (req.path === '/api/upload') return next();

    console.log(`[Proxy] ${req.method} ${req.originalUrl}`);

    const workerUrl = process.env.VITE_WORKER_URL || 'https://travelplan.vic070680.workers.dev';

    if (!workerUrl) {
      console.error('ERROR: VITE_WORKER_URL is not set.');
      return res.status(500).json({ 
        error: 'Configuration Error', 
        message: 'VITE_WORKER_URL environment variable is missing. Please set it to your Cloudflare Worker URL.' 
      });
    }

    try {
      // Create a fetch-like request for the external Worker
      // Use originalUrl to ensure we have the full path including /api
      // Note: req.originalUrl includes the query string
      const remoteUrl = new URL(req.originalUrl, workerUrl);
      
      console.log(`[Proxy] Forwarding to: ${remoteUrl.toString()}`);

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value && key !== 'host') { // Do not forward host header
          if (Array.isArray(value)) {
            value.forEach(v => headers.append(key, v));
          } else {
            headers.set(key, value);
          }
        }
      }

      // Remove content-length as we might change the body size by stringifying (or fetch handles it)
      headers.delete('content-length');

      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) && req.body 
        ? JSON.stringify(req.body) 
        : undefined;

      const workerRes = await fetch(remoteUrl.toString(), {
        method: req.method,
        headers,
        body
      });
      
      res.status(workerRes.status);
      
      let hasContentType = false;
      workerRes.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'content-type') hasContentType = true;
        res.setHeader(key, value);
      });

      // Ensure we always have a content-type for API responses
      if (!hasContentType) {
        res.setHeader('Content-Type', 'application/json');
      }

      const responseBody = await workerRes.text();
      
      // Log non-JSON responses for debugging
      if (workerRes.status >= 400 || !hasContentType || !workerRes.headers.get('content-type')?.includes('json')) {
        console.warn(`[Proxy] Non-JSON or Error Response from Worker: ${workerRes.status}`, responseBody.substring(0, 200));
      }

      res.send(responseBody);
    } catch (err) {
      console.error('Worker proxy error:', err);
      res.status(500).json({ error: 'Internal Server Error', details: String(err) });
    }
  });

  // Final catch-all for /api/* to prevent falling through to Vite SPA fallback
  app.all('/api/*', (req, res) => {
    console.warn(`[Server] Unhandled API route: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
      error: 'API route not found', 
      path: req.originalUrl,
      method: req.method,
      tip: 'This request fell through the proxy and was caught by the API catch-all.'
    });
  });

  app.post('/api/upload', upload.single('file'), async (req: MulterRequest, res) => {
    console.log(`[${new Date().toISOString()}] POST /api/upload - Received file: ${req.file?.originalname}`);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase client not initialized. Check server logs.' });
    }

    try {
      const folder = req.body.folder || 'misc';
      const fileExtension = req.file.originalname.split('.').pop();
      const fileName = `${folder}/${uuidv4()}.${fileExtension}`;

      console.log(`Uploading to bucket 'travelplan' as ${fileName}...`);

      const { data, error } = await supabase.storage
        .from('travelplan')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (error) {
        console.error('Supabase upload error detail:', JSON.stringify(error, null, 2));
        return res.status(500).json({ 
          error: error.message, 
          details: error,
          tip: 'If you see RLS error, ensure SUPABASE_SERVICE_ROLE_KEY is correctly set in environment variables.'
        });
      }

      const publicUrl = supabase.storage.from('travelplan').getPublicUrl(fileName).data.publicUrl;
      console.log('Upload successful! Public URL:', publicUrl);

      res.status(200).json({ publicUrl });
    } catch (err: any) {
      console.error('Upload failed with exception:', err);
      res.status(500).json({ error: err.message || 'Upload failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
