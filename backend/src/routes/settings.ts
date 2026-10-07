import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { requireAuth } from './auth.js';

const router = Router();

function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  const role = ((req as any).userRole || (req.headers['x-user-role'] as string) || '').toLowerCase();
  if (process.env.NODE_ENV === 'production') {
    if (role !== 'admin' && role !== 'owner') {
      return res.status(403).json({ error: 'Forbidden: admin or owner role required to manage OAuth settings' });
    }
  } else {
    // In dev zero-config mode, if role is explicitly non-admin, restrict access
    if (role && role !== 'admin' && role !== 'owner') {
      return res.status(403).json({ error: 'Forbidden: admin role required to manage OAuth settings' });
    }
  }
  next();
}

router.use(requireAuth);
router.use(requireAdminRole);

function isValidMetaAppId(value?: string): boolean {
  return !!value && /^\d+$/.test(value);
}

function getEnvFilePath(): string {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '../.env.local'),
    path.resolve(process.cwd(), '../../.env.local'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(process.cwd(), '.env.local');
}

function readEnvFile(): Record<string, string> {
  const envPath = getEnvFilePath();
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, 'utf8');
  const parsed = dotenv.parse(raw);
  return parsed;
}

function writeEnvFile(existing: Record<string, string>, updates: Record<string, string>) {
  const envPath = getEnvFilePath();
  let raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  for (const [key, value] of Object.entries(updates)) {
    const escapedVal = value.includes(' ') ? `"${value}"` : value;
    const lineRegex = new RegExp(`^(${key}=.*)$`, 'm');
    if (lineRegex.test(raw)) {
      raw = raw.replace(lineRegex, `${key}=${escapedVal}`);
    } else {
      raw += `\n${key}=${escapedVal}`;
    }
  }

  fs.writeFileSync(envPath, raw.trimStart(), 'utf8');

  // Reload into process.env immediately (no restart needed)
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}

const mask = (val: string | undefined) => {
  if (!val) return '';
  if (val.length <= 8) return '•'.repeat(val.length);
  return val.slice(0, 4) + '•'.repeat(val.length - 8) + val.slice(-4);
};

// GET /api/settings/oauth — masked config status
router.get('/oauth', (req: Request, res: Response) => {
  const env = readEnvFile();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  res.json({
    linkedin: {
      configured: !!(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET),
      client_id: mask(env.LINKEDIN_CLIENT_ID),
      client_id_set: !!env.LINKEDIN_CLIENT_ID,
      client_secret_set: !!env.LINKEDIN_CLIENT_SECRET,
      redirect_uri: `${appUrl}/api/accounts/linkedin/callback`,
      docs_url: 'https://www.linkedin.com/developers/apps',
    },
    facebook: {
      configured: isValidMetaAppId(env.META_APP_ID || env.META_CLIENT_ID) && !!(env.META_APP_SECRET || env.META_CLIENT_SECRET),
      app_id: mask(env.META_APP_ID || env.META_CLIENT_ID),
      app_id_set: !!(env.META_APP_ID || env.META_CLIENT_ID),
      app_secret_set: !!(env.META_APP_SECRET || env.META_CLIENT_SECRET),
      redirect_uri: `${appUrl}/api/accounts/facebook/callback`,
      docs_url: 'https://developers.facebook.com/apps',
      instagram_note: 'Instagram uses the same Meta App credentials as Facebook',
    },
    google_business: {
      configured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      client_id: mask(env.GOOGLE_CLIENT_ID),
      client_id_set: !!env.GOOGLE_CLIENT_ID,
      client_secret_set: !!env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${appUrl}/api/accounts/google_business/callback`,
      docs_url: 'https://console.cloud.google.com/',
    },
    x: {
      configured: !!((env.X_API_KEY || env.X_CLIENT_ID) && (env.X_API_SECRET || env.X_CLIENT_SECRET)),
      api_key: mask(env.X_API_KEY || env.X_CLIENT_ID),
      api_key_set: !!(env.X_API_KEY || env.X_CLIENT_ID),
      api_secret_set: !!(env.X_API_SECRET || env.X_CLIENT_SECRET),
      redirect_uri: `${appUrl}/api/accounts/x/callback`,
      docs_url: 'https://developer.twitter.com/en/portal/dashboard',
    },
    app_url: appUrl,
  });
});

// POST /api/settings/oauth — save credentials to .env.local (dev/staging only)
router.post('/oauth', (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Directly modifying environment configuration via API is disabled in production. Please set environment variables in your deployment environment.' });
    }

    const {
      linkedin_client_id, linkedin_client_secret,
      meta_app_id, meta_app_secret,
      google_client_id, google_client_secret,
      x_api_key, x_api_secret,
      app_url,
    } = req.body;

    const existing = readEnvFile();
    const updates: Record<string, string> = {};

    if (linkedin_client_id !== undefined && linkedin_client_id !== '') updates.LINKEDIN_CLIENT_ID = linkedin_client_id;
    if (linkedin_client_secret !== undefined && linkedin_client_secret !== '') updates.LINKEDIN_CLIENT_SECRET = linkedin_client_secret;
    if (meta_app_id !== undefined && meta_app_id !== '') {
      if (!/^\d+$/.test(meta_app_id.trim())) {
        return res.status(400).json({ error: 'Meta App ID must be the numeric App ID from developers.facebook.com/apps (not an email or app name).' });
      }
      updates.META_APP_ID = meta_app_id;
      updates.META_CLIENT_ID = meta_app_id;
    }
    if (meta_app_secret !== undefined && meta_app_secret !== '') {
      updates.META_APP_SECRET = meta_app_secret;
      updates.META_CLIENT_SECRET = meta_app_secret;
    }
    if (google_client_id !== undefined && google_client_id !== '') updates.GOOGLE_CLIENT_ID = google_client_id;
    if (google_client_secret !== undefined && google_client_secret !== '') updates.GOOGLE_CLIENT_SECRET = google_client_secret;
    if (x_api_key !== undefined && x_api_key !== '') {
      updates.X_API_KEY = x_api_key;
      updates.X_CLIENT_ID = x_api_key;
    }
    if (x_api_secret !== undefined && x_api_secret !== '') {
      updates.X_API_SECRET = x_api_secret;
      updates.X_CLIENT_SECRET = x_api_secret;
    }
    if (app_url !== undefined && app_url !== '') updates.NEXT_PUBLIC_APP_URL = app_url;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No credentials provided to save.' });
    }

    writeEnvFile(existing, updates);
    res.json({ success: true, message: 'Credentials saved. OAuth is now live — no server restart needed.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
