import supabase from './supabase';

const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Only accept auth results posted back from our own origin or the configured
// OAuth proxy. Without this check any window that can reach this page could
// postMessage a token pair and hijack the session.
function trustedOrigins(): Set<string> {
  const out = new Set<string>([window.location.origin]);
  const proxy = import.meta.env.VITE_GOOGLE_AUTH_PROXY;
  if (proxy) { try { out.add(new URL(proxy).origin); } catch { /* ignore invalid config */ } }
  return out;
}

function buildGoogleUrl(appName: string) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_GOOGLE_AUTH_PROXY;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!clientId || !redirectUri) return null;
  const state = btoa(JSON.stringify({ origin: window.location.origin, appName, supabaseUrl, supabaseAnonKey }));
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&prompt=select_account&state=${encodeURIComponent(state)}`;
}

// One handler at a time: clicking "Sign in with Google" twice used to stack
// listeners, so a single result was processed once per click.
let activeHandler: ((event: MessageEvent) => void) | null = null;
function detachHandler() {
  if (activeHandler) window.removeEventListener('message', activeHandler);
  activeHandler = null;
}

export function signInWithGoogle(appName = 'HRplus') {
  const url = buildGoogleUrl(appName);
  if (!url) { console.warn('[google-auth] Missing VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_AUTH_PROXY'); return; }
  detachHandler();
  window.open(url, 'google-auth', isMobile() ? '' : 'width=500,height=600');
  const handler = async (event: MessageEvent) => {
    if (!trustedOrigins().has(event.origin)) return;
    if (event.data?.type === 'google-auth-denied') { detachHandler(); return; }
    if (event.data?.type !== 'google-auth-success') return;
    const hasSession = typeof event.data.access_token === 'string' && typeof event.data.refresh_token === 'string';
    const hasIdToken = typeof event.data.id_token === 'string';
    if (!hasSession && !hasIdToken) return;
    detachHandler();
    if (event.data.access_token && event.data.refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token: event.data.access_token, refresh_token: event.data.refresh_token });
      if (error) console.error('[google-auth] setSession failed:', error.message);
    } else if (event.data.id_token) {
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: event.data.id_token });
      if (error) console.error('[google-auth] signInWithIdToken failed:', error.message);
    }
  };
  activeHandler = handler;
  window.addEventListener('message', handler);
}

export async function handleGoogleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('google_id_token');
  if (!token) return;
  window.history.replaceState({}, '', window.location.pathname);
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token });
  if (error) { console.error('[google-auth] signInWithIdToken failed:', error.message); return; }
  try { window.close(); } catch { /* ignore */ }
}
