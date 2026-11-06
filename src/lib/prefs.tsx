import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import supabase from './supabase';
import { act } from './api';

export type Lang = 'en' | 'ar';
export interface Prefs {
  lang: Lang; theme: 'light' | 'dark' | 'system'; fontScale: number; highContrast: boolean; reduceMotion: boolean;
  largeTargets: boolean; density: 'compact' | 'comfortable'; announce: boolean; shortcuts: boolean;
  dashboard?: { order?: string[]; wide?: string[]; hidden?: string[] };
}
const DEFAULTS: Prefs = { lang: 'en', theme: 'light', fontScale: 1, highContrast: false, reduceMotion: false, largeTargets: false, density: 'compact', announce: true, shortcuts: true };

interface Ctx { prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; savePrefs: (p: Partial<Prefs>) => Promise<void>; hydrate: (p: any) => void; L: (en: string, ar: string) => string; lang: Lang; dir: 'ltr' | 'rtl'; isDark: boolean; announce: (msg: string) => void; }
const PrefsCtx = createContext<Ctx>(null as any);

export function PrefsProvider({ children }: { children: any }) {
  const [prefs, setState] = useState<Prefs>(() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('hrplus.prefs') || '{}') }; } catch { return DEFAULTS; } });
  const [systemDark, setSystemDark] = useState(() => !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const [live, setLive] = useState('');
  const timer = useRef<any>(null);
  const pending = useRef<any>({});

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', h); return () => mq.removeEventListener('change', h);
  }, []);
  useEffect(() => {
    if (!prefs.reduceMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches && localStorage.getItem('hrplus.prefs') == null) setState((s) => ({ ...s, reduceMotion: true }));
  }, []);

  const isDark = prefs.theme === 'dark' || (prefs.theme === 'system' && systemDark);
  useEffect(() => {
    const el = document.documentElement;
    el.lang = prefs.lang; el.dir = prefs.lang === 'ar' ? 'rtl' : 'ltr';
    el.classList.toggle('dark', isDark); el.classList.toggle('hc', !!prefs.highContrast);
    el.classList.toggle('rm', !!prefs.reduceMotion); el.classList.toggle('lt', !!prefs.largeTargets);
    el.classList.toggle('comfy', prefs.density === 'comfortable');
    el.style.setProperty('--fs', String(prefs.fontScale || 1));
    localStorage.setItem('hrplus.prefs', JSON.stringify(prefs));
  }, [prefs, isDark]);

  const flush = useCallback(async () => {
    const p = pending.current; pending.current = {};
    if (!Object.keys(p).length) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await act('prefs.save', { prefs: p });
  }, []);
  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setState((s) => ({ ...s, ...patch }));
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush().catch(() => {}); }, 600);
  }, [flush]);
  const savePrefs = useCallback(async (patch: Partial<Prefs>) => {
    setState((s) => ({ ...s, ...patch }));
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    await flush();
  }, [flush]);
  const hydrate = useCallback((p: any) => { if (p && typeof p === 'object') setState((s) => ({ ...s, ...p })); }, []);
  const L = useCallback((en: string, ar: string) => (prefs.lang === 'ar' ? ar : en), [prefs.lang]);
  const announce = useCallback((msg: string) => { setLive(''); setTimeout(() => setLive(msg), 30); }, []);

  return (
    <PrefsCtx.Provider value={{ prefs, setPrefs, savePrefs, hydrate, L, lang: prefs.lang, dir: prefs.lang === 'ar' ? 'rtl' : 'ltr', isDark, announce }}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="sr-only">{prefs.announce ? live : ''}</div>
    </PrefsCtx.Provider>
  );
}
export const usePrefs = () => useContext(PrefsCtx);
