import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';

interface MulterRequest extends Request {
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
  const app = express();
  const PORT = 3000;

  app.use(express.json()); // Enable JSON body parsing

  // Multer setup for file uploads
  const upload = multer({ storage: multer.memoryStorage() });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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
