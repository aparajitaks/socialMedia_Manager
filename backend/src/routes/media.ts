import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();

// ---------------------------------------------------------------------------
// Supabase Storage (preferred) — falls back to local disk when not configured
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'postline-media';

const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Local fallback upload dir
const UPLOAD_DIR = (() => {
  const candidates = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), '../uploads'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  const dir = candidates[0];
  fs.mkdirSync(dir, { recursive: true });
  return dir;
})();

// ---------------------------------------------------------------------------
// POST /api/media/upload
// Accepts: multipart/form-data with field "file" (binary)
//          OR application/json with field "data" (base64) + "filename" + "mimeType"
// Returns: { url: string }
// ---------------------------------------------------------------------------

// Simple base64 upload handler (no multer dependency required)
router.post('/upload', async (req: Request, res: Response) => {
  try {
    let buffer: Buffer;
    let originalName: string;
    let mimeType: string;

    // Handle JSON body with base64 data
    if (req.headers['content-type']?.includes('application/json')) {
      const { data, filename, mimeType: mt } = req.body;

      if (!data) {
        return res.status(400).json({ error: 'Missing base64 data field' });
      }

      // Strip data URI prefix if present (e.g. "data:image/png;base64,")
      const base64Data = data.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
      originalName = filename || 'upload';
      mimeType = mt || 'application/octet-stream';
    } else {
      return res.status(400).json({
        error: 'Send JSON body with { data: "<base64>", filename: "file.jpg", mimeType: "image/jpeg" }'
      });
    }

    // Validate file size (max 10MB)
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (max 10MB)' });
    }

    // Validate MIME type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ error: `Unsupported file type. Allowed: ${allowedTypes.join(', ')}` });
    }

    const ext = originalName.includes('.') ? originalName.split('.').pop() : mimeType.split('/')[1];
    const uniqueName = `${crypto.randomUUID()}.${ext}`;

    // Attempt Supabase Storage upload
    if (supabase) {
      const { data: uploadData, error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(`media/${uniqueName}`, buffer, {
          contentType: mimeType,
          upsert: false
        });

      if (error) {
        console.error('Supabase storage upload error:', error.message);
        // Fall through to local storage
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from(SUPABASE_BUCKET)
          .getPublicUrl(`media/${uniqueName}`);
        return res.json({ url: publicUrl, filename: uniqueName, source: 'supabase' });
      }
    }

    // Local disk fallback
    const localPath = path.join(UPLOAD_DIR, uniqueName);
    fs.writeFileSync(localPath, buffer);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 5001}`;
    const publicUrl = `${appUrl}/api/media/files/${uniqueName}`;

    res.json({ url: publicUrl, filename: uniqueName, source: 'local' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/media/files/:filename — serve locally-stored files
// ---------------------------------------------------------------------------
router.get('/files/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, ''); // sanitize
  const filePath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4'
  };
  const contentType = mimeMap[ext || ''] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  res.sendFile(filePath);
});

// ---------------------------------------------------------------------------
// GET /api/media/config — inform frontend of upload capabilities
// ---------------------------------------------------------------------------
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    max_size_bytes: 10 * 1024 * 1024,
    allowed_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'],
    storage: supabase ? 'supabase' : 'local',
    bucket: supabase ? SUPABASE_BUCKET : null
  });
});

export default router;
