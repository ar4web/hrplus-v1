import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';

// Env naming differs between deploys of this project (Vercel/Next-style vars vs.
// Vite vars vs. plain Supabase names), so resolve the first one that is set.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  || process.env.SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || '';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  // Fail fast with an actionable message instead of a confusing downstream error.
  throw new Error(
    'Supabase is not configured for the API. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL / VITE_SUPABASE_URL) '
    + 'and SUPABASE_SERVICE_ROLE_KEY in the server environment.',
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SERVICE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, options) => {
        const res = await fetch(url, options);
        if (!res.ok && res.status >= 500) triggerRestore();
        return res;
      },
    },
  }
);

export default supabase;
