// Local demo client. When VITE_DEMO_MODE=1 the app runs against the bundled
// dev API server (see /dev) instead of a cloud Supabase project. Only the
// surface the UI actually touches is implemented here: session/auth helpers
// and realtime channel stubs. All data access goes through /api (see api.ts).
type Session = { access_token: string; refresh_token?: string; user?: unknown; expires_at?: number } | null;

const STORAGE_KEY = 'hrplus.demo.session';
const listeners = new Set<(event: string, session: Session) => void>();

function read(): Session {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (s?.expires_at && s.expires_at * 1000 < Date.now()) { localStorage.removeItem(STORAGE_KEY); return null; }
    return s;
  } catch { return null; }
}

function write(s: Session) {
  try { if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); else localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

function emit(event: string, session: Session) { for (const fn of listeners) { try { fn(event, session); } catch { /* ignore */ } } }

async function login(email: string): Promise<{ data: { session: Session }; error: Error | null }> {
  const res = await fetch('/api/demo/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { data: { session: null }, error: new Error(body?.error || 'Sign-in failed') };
  const session: Session = { access_token: body.access_token, refresh_token: body.refresh_token, user: body.user, expires_at: body.expires_at };
  write(session);
  return { data: { session }, error: null };
}

const ok = { data: {}, error: null };

const demoClient = {
  auth: {
    async getSession() { return { data: { session: read() }, error: null }; },
    async getUser() { const s = read(); return { data: { user: s?.user ?? null }, error: null }; },
    onAuthStateChange(cb: (event: string, session: Session) => void) {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe() { listeners.delete(cb); } } } };
    },
    async signInWithPassword({ email }: { email: string; password: string }) {
      const out = await login(email);
      if (out.data.session) emit('SIGNED_IN', out.data.session);
      return out;
    },
    async signUp({ email }: { email: string }) {
      return { data: { user: null, session: null }, error: new Error(`Sign-up is disabled in local demo mode. Use one of the demo accounts (e.g. ${email || 'admin@hrplus.sa'}).`) };
    },
    async signInWithIdToken() {
      return { data: { user: null, session: null }, error: new Error('Google sign-in requires a real Supabase project — use email or phone in demo mode.') };
    },
    async setSession(tokens: { access_token: string; refresh_token?: string }) {
      const session: Session = { ...tokens, expires_at: Math.floor(Date.now() / 1000) + 8 * 3600 };
      write(session);
      emit('SIGNED_IN', session);
      return { data: { session }, error: null };
    },
    async signOut() { write(null); emit('SIGNED_OUT', null); return { error: null }; },
    async resetPasswordForEmail() { return { data: {}, error: new Error('Password reset is not available in local demo mode.') }; },
    async updateUser() { return { data: { user: null }, error: new Error('Not available in demo mode') }; },
    mfa: {
      async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] }, error: null }; },
      async listFactors() { return { data: { all: [], totp: [] }, error: null }; },
      async enroll() { return { data: null, error: new Error('MFA enrolment needs a real Supabase project') }; },
      async unenroll() { return { data: null, error: new Error('MFA needs a real Supabase project') }; },
      async challengeAndVerify() { return { data: null, error: new Error('MFA needs a real Supabase project') }; },
    },
  },
  channel() {
    const ch: Record<string, unknown> = {};
    ch.on = () => ch;
    ch.subscribe = () => ch;
    ch.unsubscribe = () => Promise.resolve('ok');
    ch.send = () => Promise.resolve('ok');
    ch.track = () => Promise.resolve('ok');
    return ch;
  },
  removeChannel() { return Promise.resolve('ok'); },
  removeAllChannels() { return Promise.resolve('ok'); },
  from() {
    throw new Error('Demo mode: data access must go through the /api client (src/lib/api.ts).');
  },
  storage: {
    from() { throw new Error('Demo mode: file storage is emulated by the dev API server.'); },
  },
  ...ok,
};

export default demoClient as never;
export const DEMO_MODE = true;
