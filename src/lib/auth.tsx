import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import supabase from './supabase';
import { api, act } from './api';
import { usePrefs } from './prefs';

export interface Me { profile: any; employee: any; vendor: any; company: any; user: any; session: any }
interface Ctx { session: any; me: Me | null; loading: boolean; mfaNeeded: boolean; error: string; notice: string; setNotice: (s: string) => void; reloadMe: () => Promise<void>; signOut: (reason?: string) => Promise<void>; setCompany: (c: any) => void; role: string; }
const AuthCtx = createContext<Ctx>(null as any);

export function applyBrand(c: any) {
  const el = document.documentElement;
  if (c?.primary_color && /^#[0-9a-f]{6}$/i.test(c.primary_color)) el.style.setProperty('--brand', c.primary_color);
  if (c?.secondary_color && /^#[0-9a-f]{6}$/i.test(c.secondary_color)) el.style.setProperty('--brand-2', c.secondary_color);
}

export function AuthProvider({ children }: { children: any }) {
  const { hydrate } = usePrefs();
  const [session, setSession] = useState<any>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = useRef(false);

  const loadMe = useCallback(async () => {
    try {
      setError('');
      const d = await api('/api/me');
      setMe(d); applyBrand(d.company);
      if (d.profile?.prefs && Object.keys(d.profile.prefs).length) hydrate(d.profile.prefs);
    } catch (e: any) {
      if (e.message === 'mfa_required') setMfaNeeded(true);
      else if (e.status !== 440) setError(e.message);
    }
  }, [hydrate]);

  const evaluate = useCallback(async (s: any) => {
    if (busy.current) return; busy.current = true;
    try {
      setSession(s);
      if (!s) { setMe(null); setMfaNeeded(false); return; }
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') { setMfaNeeded(true); return; }
      setMfaNeeded(false);
      await loadMe();
    } finally { busy.current = false; setLoading(false); }
  }, [loadMe]);

  const signOut = useCallback(async (reason?: string) => {
    try { await act('audit.event', { event: reason === 'expired' ? 'auth.idle_timeout' : 'auth.logout' }); } catch { /* ignore */ }
    await supabase.auth.signOut();
    setMe(null); setSession(null); setMfaNeeded(false);
    if (reason === 'expired') setNotice('expired');
  }, []);

  useEffect(() => {
    fetch('/api/me?public=1').then((r) => r.json()).then((d) => applyBrand(d.company)).catch(() => {});
    supabase.auth.getSession().then(({ data }) => evaluate(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'TOKEN_REFRESHED') { setSession(s); return; }
      if (event === 'SIGNED_IN' || event === 'MFA_CHALLENGE_VERIFIED') { setTimeout(() => evaluate(s), 0); return; }
      if (event === 'SIGNED_OUT') { setSession(null); setMe(null); setMfaNeeded(false); setLoading(false); }
    });
    const onExpired = async () => { await supabase.auth.signOut(); setMe(null); setSession(null); setNotice('expired'); };
    const onMfa = () => setMfaNeeded(true);
    window.addEventListener('hrplus:expired', onExpired);
    window.addEventListener('hrplus:mfa', onMfa);
    return () => { subscription.unsubscribe(); window.removeEventListener('hrplus:expired', onExpired); window.removeEventListener('hrplus:mfa', onMfa); };
  }, [evaluate]);

  const setCompany = useCallback((c: any) => { setMe((m) => (m ? { ...m, company: c } : m)); applyBrand(c); }, []);

  return (
    <AuthCtx.Provider value={{ session, me, loading, mfaNeeded, error, notice, setNotice, reloadMe: loadMe, signOut, setCompany, role: me?.profile?.role || '' }}>
      {children}
    </AuthCtx.Provider>
  );
}
export const useAuth = () => useContext(AuthCtx);
