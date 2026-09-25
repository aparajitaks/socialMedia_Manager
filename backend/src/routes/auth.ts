import { Router, Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { db } from '../db.js';
import { UserRole } from '../types/index.js';

const router = Router();

// ---------------------------------------------------------------------------
// Supabase Auth client (uses anon key for client-facing auth operations)
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAuth = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// ---------------------------------------------------------------------------
// Middleware: verify Supabase JWT (attach user to req)
// ---------------------------------------------------------------------------
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Zero-config mode: no Supabase credentials → skip auth
  if (!supabaseAuth) {
    (req as any).userId = null;
    (req as any).userRole = (req.headers['x-user-role'] as UserRole) || 'admin';
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  (req as any).authUser = user;
  (req as any).userId = user.id;
  next();
}

// ---------------------------------------------------------------------------
// POST /api/auth/signup — create Supabase Auth user + our users table row
// ---------------------------------------------------------------------------
router.post('/signup', async (req: Request, res: Response) => {
  if (!supabaseAdmin) {
    return res.status(501).json({ error: 'Auth not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY' });
  }

  const { email, password, name, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password, and name are required' });
  }

  try {
    // Create the Supabase Auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm for internal tool
      user_metadata: { name, role: role || 'editor' }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Create corresponding row in our users table
    const user = await db.createUser({
      name,
      email: email.toLowerCase(),
      role: (role as UserRole) || 'editor'
    });

    res.status(201).json({ user, auth_id: authData.user?.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login — exchange credentials for JWT session
// ---------------------------------------------------------------------------
router.post('/login', async (req: Request, res: Response) => {
  if (!supabaseAuth) {
    // Zero-config fallback: accept any email, return mock user
    const { email } = req.body;
    try {
      const user = await db.getUserByEmail(email || 'admin@company.internal') || (await db.getUsers())[0];
      return res.json({
        user,
        session: null,
        message: 'Zero-config mode: Supabase not configured, returning mock session'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });

    // Look up our internal users table for role info
    const user = await db.getUserByEmail(email);

    res.json({
      user,
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_at: data.session?.expires_at
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout — invalidate Supabase session
// ---------------------------------------------------------------------------
router.post('/logout', async (req: Request, res: Response) => {
  if (!supabaseAuth) return res.json({ success: true });

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    // Best-effort sign-out
    await supabaseAuth.auth.signOut();
  }
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh — refresh an expired JWT using a refresh_token
// ---------------------------------------------------------------------------
router.post('/refresh', async (req: Request, res: Response) => {
  if (!supabaseAuth) return res.json({ session: null });

  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token is required' });

  try {
    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token });
    if (error) return res.status(401).json({ error: error.message });

    res.json({
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_at: data.session?.expires_at
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me — return current user profile (requires auth header or role header)
// ---------------------------------------------------------------------------
router.get('/me', async (req: Request, res: Response) => {
  try {
    // If Supabase is configured, verify JWT
    if (supabaseAuth) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

      if (token) {
        const { data: { user: authUser }, error } = await supabaseAuth.auth.getUser(token);
        if (!error && authUser?.email) {
          const dbUser = await db.getUserByEmail(authUser.email);
          if (dbUser) return res.json(dbUser);

          // Auto-create on first login (Supabase user exists but not in our table yet)
          const name = authUser.user_metadata?.name || authUser.email.split('@')[0];
          const role = (authUser.user_metadata?.role as UserRole) || 'editor';
          const newUser = await db.createUser({ name, email: authUser.email, role });
          return res.json(newUser);
        }
      }
    }

    // Zero-config fallback: use x-user-role header
    const role = (req.headers['x-user-role'] as UserRole) || 'admin';
    const users = await db.getUsers();
    const user = users.find((u) => u.role === role) || users[0];
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
