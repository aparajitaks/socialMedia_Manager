import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db, DEFAULT_CLIENT_ID } from '../db.js';
import { requireAuth } from './auth.js';

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
// GET /api/media — List client media assets
// ---------------------------------------------------------------------------
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const callerOrgId: string | undefined = (req as any).organizationId;
    const clientId = (req.query.clientId || req.query.client_id) as string || DEFAULT_CLIENT_ID;

    // Validate that the client belongs to caller's org
    if (callerOrgId) {
      const client = await db.getClient(clientId);
      if (!client || client.organization_id !== callerOrgId) {
        return res.status(403).json({ error: 'Access to this client is not authorized' });
      }
    }

    const assets = await db.getMediaAssets(clientId);
    res.json(assets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/media/upload
// Accepts JSON with { data: "<base64>", filename: "...", mimeType: "..." }
// ---------------------------------------------------------------------------
router.post('/upload', requireAuth, async (req: Request, res: Response) => {
  try {
    const callerOrgId: string | undefined = (req as any).organizationId;
    const uploadClientId = (req.query.clientId || req.body.client_id) as string || DEFAULT_CLIENT_ID;

    // Validate client ownership before accepting the upload
    if (callerOrgId) {
      const client = await db.getClient(uploadClientId);
      if (!client || client.organization_id !== callerOrgId) {
        return res.status(403).json({ error: 'Access to this client is not authorized' });
      }
    }
    let buffer: Buffer;
    let originalName: string;
    let mimeType: string;

    if (req.headers['content-type']?.includes('application/json')) {
      const { data, filename, mimeType: mt } = req.body;
      if (!data) return res.status(400).json({ error: 'Missing base64 data field' });

      const base64Data = data.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
      originalName = filename || 'upload';
      mimeType = mt || 'application/octet-stream';
    } else {
      return res.status(400).json({
        error: 'Send JSON body with { data: "<base64>", filename: "file.jpg", mimeType: "image/jpeg" }',
      });
    }

    // Size limit (10MB)
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (max 10MB)' });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ error: `Unsupported file type. Allowed: ${allowedTypes.join(', ')}` });
    }

    const ext = originalName.includes('.') ? originalName.split('.').pop() : mimeType.split('/')[1];
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    let finalUrl = '';
    let storageKey = `media/${uniqueName}`;

    // Supabase Storage
    if (supabase) {
      const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(storageKey, buffer, { contentType: mimeType, upsert: false });

      if (!error) {
        const { data: { publicUrl } } = supabase.storage
          .from(SUPABASE_BUCKET)
          .getPublicUrl(storageKey);
        finalUrl = publicUrl;
      }
    }

    // Local disk fallback
    if (!finalUrl) {
      const localPath = path.join(UPLOAD_DIR, uniqueName);
      fs.writeFileSync(localPath, buffer);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 5001}`;
      finalUrl = `${appUrl}/api/media/files/${uniqueName}`;
    }

    // Create database asset record
    const asset = await db.createMediaAsset({
      client_id: uploadClientId,
      file_name: originalName,
      mime_type: mimeType,
      size: buffer.length,
      storage_key: storageKey,
      url: finalUrl,
      checksum,
    });

    res.json({
      url: finalUrl,
      filename: uniqueName,
      source: supabase ? 'supabase' : 'local',
      asset,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/media/files/:filename — serve locally-stored files
// ---------------------------------------------------------------------------
router.get('/files/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '');
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
// GET /api/media/config
// ---------------------------------------------------------------------------
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    max_size_bytes: 10 * 1024 * 1024,
    allowed_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'],
    storage: supabase ? 'supabase' : 'local',
    bucket: supabase ? SUPABASE_BUCKET : null,
  });
});

export default router;
