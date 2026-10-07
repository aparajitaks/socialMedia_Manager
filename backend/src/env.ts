import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Environment loading (MUST be the first import in the entry point)
// ---------------------------------------------------------------------------
// In ESM, every `import` in a module is fully evaluated before that module's
// own body runs. The previous inline dotenv.config() calls in server.ts
// therefore executed *after* modules such as db.ts / routes/auth.ts had already
// read process.env at module scope — so Supabase credentials in .env.local were
// silently ignored and the app fell back to the local JSON store.
// Loading dotenv from a module imported first fixes that ordering guarantee.
const candidatePaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '../.env.local'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
];

for (const envPath of candidatePaths) {
  if (fs.existsSync(envPath)) {
    // dotenv never overrides already-set variables, so the first file
    // defining a key wins (same precedence as before).
    dotenv.config({ path: envPath });
  }
}

dotenv.config();

export {};
