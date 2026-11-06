import { createClient } from '@supabase/supabase-js';
import demoClient from './demo';

// Two modes:
//  - VITE_DEMO_MODE=1 → talk to the bundled local API server (dev/), no cloud needed
//  - otherwise       → the real Supabase project configured in .env.local
const DEMO = String(import.meta.env.VITE_DEMO_MODE ?? '') === '1';

function makeRealClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const message = 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, or set VITE_DEMO_MODE=1 to run the local demo.';
    // Fail loudly but don't crash the whole bundle — the login screen shows this.
    console.error(`[hrplus] ${message}`);
    const reject = () => Promise.resolve({ data: { user: null, session: null, factors: [] }, error: new Error(message) });
    const stub: Record<string, unknown> = {
      auth: {
        getSession: reject, getUser: reject, refreshSession: reject, signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithPassword: reject, signUp: reject, signInWithIdToken: reject, setSession: reject,
        resetPasswordForEmail: reject, updateUser: reject,
        mfa: { getAuthenticatorAssuranceLevel: reject, listFactors: reject, enroll: reject, unenroll: reject, challengeAndVerify: reject },
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
    };
    return stub as never;
  }
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hrplus.auth' } });
}

const supabase = DEMO ? demoClient : makeRealClient();

export const IS_DEMO = DEMO;
export default supabase;
