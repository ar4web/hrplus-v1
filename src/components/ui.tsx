import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, Inbox, RefreshCw } from 'lucide-react';
import { getRes } from '../lib/api';
import { usePrefs } from '../lib/prefs';
import { initials, toneFor } from '../lib/format';

export const TONE: Record<string, string> = {
  brand: 'bg-brand/12 text-brand', coral: 'bg-coral/15 text-coral', sky: 'bg-sky/15 text-sky', violet: 'bg-violet/15 text-violet',
  mint: 'bg-mint/15 text-mint', amber: 'bg-amber/15 text-amber', rose: 'bg-rose/15 text-rose', indigo: 'bg-indigo/15 text-indigo',
  gold: 'bg-brand2/20 text-amber', slate: 'bg-ink/8 text-muted',
};
export const TONE_SOLID: Record<string, string> = {
  brand: 'bg-brand', coral: 'bg-coral', sky: 'bg-sky', violet: 'bg-violet', mint: 'bg-mint', amber: 'bg-amber', rose: 'bg-rose', indigo: 'bg-indigo', gold: 'bg-brand2', slate: 'bg-muted',
};
export const TONE_TEXT: Record<string, string> = {
  brand: 'text-brand', coral: 'text-coral', sky: 'text-sky', violet: 'text-violet', mint: 'text-mint', amber: 'text-amber', rose: 'text-rose', indigo: 'text-indigo', gold: 'text-amber', slate: 'text-muted',
};

export function Card({ title, subtitle, icon: Icon, actions, children, className = '', pad = true, tone, id, ...rest }: any) {
  return (
    <section id={id} className={`card bg-surface ${className}`} {...rest}>
      {(title || actions) && (
        <header className="flex items-center gap-2 px-3 pt-3 pb-2 min-h-[44px]">
          {Icon && <span className={`grid place-items-center w-7 h-7 shrink-0 ${TONE[tone || 'brand']}`}><Icon size={15} aria-hidden /></span>}
          <div className="min-w-0 flex-1">
            {title && <h2 className="font-display text-[0.95rem] font-semibold leading-tight truncate">{title}</h2>}
            {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'px-3 pb-3' : ''}>{children}</div>
    </section>
  );
}

export function Btn({ variant = 'primary', size = 'md', icon: Icon, children, loading, className = '', type = 'button', ...props }: any) {
  const v: Record<string, string> = {
    primary: 'bg-brand text-white hover:brightness-110',
    secondary: 'bg-brand2 text-[#2a1d00] hover:brightness-105',
    soft: 'bg-brand/12 text-brand hover:bg-brand/20',
    ghost: 'bg-transparent text-ink hover:bg-ink/6',
    subtle: 'bg-sunken text-ink hover:bg-ink/10',
    danger: 'bg-coral text-white hover:brightness-110',
    dangerSoft: 'bg-coral/12 text-coral hover:bg-coral/20',
    success: 'bg-mint text-white hover:brightness-110',
  };
  const s: Record<string, string> = { xs: 'h-7 px-2 text-xs gap-1', sm: 'h-8 px-2.5 text-[0.8rem] gap-1.5', md: 'h-9 px-3.5 text-sm gap-2', lg: 'h-11 px-5 text-[0.95rem] gap-2' };
  return (
    <button type={type} className={`inline-flex items-center justify-center font-medium transition disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap ${v[variant]} ${s[size]} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 size={size === 'xs' ? 12 : 15} className="animate-spin" aria-hidden /> : Icon ? <Icon size={size === 'xs' ? 12 : 15} aria-hidden /> : null}
      {children}
    </button>
  );
}
export function IconBtn({ icon: Icon, label, className = '', tone, ...props }: any) {
  return (
    <button type="button" aria-label={label} title={label} className={`icon-btn inline-grid place-items-center w-8 h-8 text-muted hover:text-ink hover:bg-ink/6 transition ${tone ? TONE_TEXT[tone] : ''} ${className}`} {...props}>
      <Icon size={16} aria-hidden />
    </button>
  );
}

const fieldCls = 'w-full bg-surface2 text-ink px-2.5 h-9 text-sm placeholder:text-muted/70 border-0 outline-none ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand transition';
export const Input = ({ className = '', ...p }: any) => <input className={`${fieldCls} ${className}`} {...p} />;
export const Select = ({ className = '', children, ...p }: any) => <select className={`${fieldCls} pe-7 ${className}`} {...p}>{children}</select>;
export const Textarea = ({ className = '', ...p }: any) => <textarea className={`${fieldCls} h-auto py-2 min-h-[80px] ${className}`} {...p} />;
export function Field({ label, error, hint, children, className = '', htmlFor }: any) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label htmlFor={htmlFor} className="text-xs font-medium text-muted">{label}</label>}
      {children}
      {error ? <p className="text-xs text-coral" role="alert">{error}</p> : hint ? <p className="text-[0.7rem] text-muted">{hint}</p> : null}
    </div>
  );
}
export function Toggle({ checked, onChange, label, desc, id }: any) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-1.5" htmlFor={id}>
      <span className="relative mt-0.5 shrink-0">
        <input id={id} type="checkbox" role="switch" aria-checked={!!checked} className="peer sr-only" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={`block w-10 h-[22px] transition ${checked ? 'bg-brand' : 'bg-ink/20'} peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2`} />
        <span className={`absolute top-[3px] w-4 h-4 bg-white transition-all ${checked ? 'start-[21px]' : 'start-[3px]'}`} />
      </span>
      <span className="min-w-0"><span className="text-sm font-medium block">{label}</span>{desc && <span className="text-xs text-muted block">{desc}</span>}</span>
    </label>
  );
}

export const Badge = ({ tone = 'slate', children, className = '' }: any) => <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.7rem] font-medium whitespace-nowrap ${TONE[tone] || TONE.slate} ${className}`}>{children}</span>;
export const Dot = ({ tone = 'brand' }: any) => <span className={`inline-block w-2 h-2 shrink-0 ${TONE_SOLID[tone]}`} aria-hidden />;

export function Avatar({ name = '', size = 32, tone }: any) {
  const t = tone || toneFor(name);
  return <span className={`inline-grid place-items-center shrink-0 font-display font-semibold ${TONE_SOLID[t]} text-white`} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>{initials(name) || '?'}</span>;
}

export function Spinner({ label }: any) {
  return <div className="flex items-center justify-center gap-2 py-10 text-muted text-sm" role="status"><Loader2 className="animate-spin" size={18} aria-hidden />{label}</div>;
}
export function Skeleton({ className = '' }: any) { return <div className={`animate-pulse bg-ink/8 ${className}`} aria-hidden />; }
export function Empty({ icon: Icon = Inbox, title, hint, action }: any) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 gap-2">
      <span className="grid place-items-center w-11 h-11 bg-brand/10 text-brand"><Icon size={20} aria-hidden /></span>
      <p className="font-medium text-sm">{title}</p>
      {hint && <p className="text-xs text-muted max-w-sm">{hint}</p>}
      {action}
    </div>
  );
}
export function ErrorBox({ error, retry }: any) {
  const { L } = usePrefs();
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 p-3 bg-coral/10 text-coral text-sm" role="alert">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span className="flex-1">{error}</span>
      {retry && <button onClick={retry} className="inline-flex items-center gap-1 text-xs font-medium underline"><RefreshCw size={12} />{L('Retry', 'إعادة')}</button>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className = '' }: any) {
  return (
    <div role="tablist" className={`flex gap-0.5 overflow-x-auto scroll-thin ${className}`}>
      {tabs.filter(Boolean).map((t: any) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={`relative px-3 h-9 text-sm whitespace-nowrap transition flex items-center gap-1.5 ${value === t.value ? 'text-brand font-semibold bg-brand/10' : 'text-muted hover:text-ink hover:bg-ink/5'}`}>
          {t.icon && <t.icon size={14} aria-hidden />}{t.label}
          {t.count != null && t.count > 0 && <span className="text-[0.65rem] px-1 bg-coral text-white">{t.count}</span>}
          {value === t.value && <span className="absolute bottom-0 inset-x-0 h-0.5 bg-brand" />}
        </button>
      ))}
    </div>
  );
}
export function Segmented({ options, value, onChange, size = 'sm', label }: any) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex bg-sunken p-0.5">
      {options.map((o: any) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`${size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm'} font-medium transition flex items-center gap-1 ${value === o.value ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-ink'}`}>
          {o.icon && <o.icon size={13} aria-hidden />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide, size }: any) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement;
    const t = setTimeout(() => { const f = ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])'); f?.focus(); }, 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const els = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')];
        if (!els.length) return; const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, onClose]);
  const w = size === 'xl' ? 'max-w-5xl' : wide ? 'max-w-3xl' : 'max-w-lg';
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
            className={`relative bg-surface w-full ${w} max-h-[92vh] flex flex-col shadow-2xl`} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ duration: 0.18 }}>
            <header className="flex items-center gap-2 px-4 h-12 shrink-0 bg-surface2">
              <h2 className="font-display font-semibold flex-1 truncate">{title}</h2>
              <IconBtn icon={X} label="Close" onClick={onClose} data-close />
            </header>
            <div className="p-4 overflow-y-auto scroll-thin">{children}</div>
            {footer && <footer className="flex flex-wrap justify-end gap-2 px-4 py-3 bg-surface2 shrink-0">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({ open, onClose, title, children, width = 'max-w-md', footer }: any) {
  const { dir } = usePrefs();
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [open, onClose]);
  const from = dir === 'rtl' ? '-100%' : '100%';
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/40" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-hidden />
          <motion.aside role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Panel'} className={`absolute top-0 bottom-0 end-0 w-full ${width} bg-surface flex flex-col shadow-2xl`}
            initial={{ x: from }} animate={{ x: 0 }} exit={{ x: from }} transition={{ type: 'tween', duration: 0.22 }}>
            {title !== null && (
              <header className="flex items-center gap-2 px-4 h-12 shrink-0 bg-surface2">
                <h2 className="font-display font-semibold flex-1 truncate">{title}</h2>
                <IconBtn icon={X} label="Close" onClick={onClose} />
              </header>
            )}
            <div className="flex-1 overflow-y-auto scroll-thin">{children}</div>
            {footer && <footer className="flex flex-wrap gap-2 px-4 py-3 bg-surface2">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function PageHeader({ title, subtitle, actions, icon: Icon, tone = 'brand' }: any) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      {Icon && <span className={`grid place-items-center w-10 h-10 ${TONE[tone]}`}><Icon size={20} aria-hidden /></span>}
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-xl font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, tone = 'brand', sub, icon: Icon }: any) {
  return (
    <div className={`p-3 ${TONE[tone]} !text-ink`}>
      <div className="flex items-center gap-1.5 text-xs text-muted">{Icon && <Icon size={13} className={TONE_TEXT[tone]} aria-hidden />}{label}</div>
      <div className={`font-display text-lg font-semibold num mt-0.5 ${TONE_TEXT[tone]}`}>{value}</div>
      {sub && <div className="text-[0.7rem] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function Table({ columns, rows, onRowClick, empty, rowKey = 'id', dense }: any) {
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-start text-xs text-muted bg-surface2">
            {columns.map((c: any) => <th key={c.key} scope="col" className={`px-3 py-2 font-medium text-start whitespace-nowrap ${c.className || ''}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={r[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r); } : undefined} tabIndex={onRowClick ? 0 : undefined}
              className={`border-t border-line/60 ${onRowClick ? 'cursor-pointer hover:bg-brand/5 focus:bg-brand/5' : ''}`}>
              {columns.map((c: any) => <td key={c.key} className={`px-3 ${dense ? 'py-1.5' : 'py-2'} align-middle ${c.className || ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (empty || <Empty title="Nothing here yet" />)}
    </div>
  );
}

/* ---------- toasts ---------- */
const ToastCtx = createContext<(msg: string, tone?: string) => void>(() => {});
export function ToastProvider({ children }: any) {
  const [items, setItems] = useState<any[]>([]);
  const push = useCallback((msg: string, tone = 'success') => {
    const id = Math.random();
    setItems((s) => [...s, { id, msg, tone }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-4" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} role="status"
              className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 shadow-xl text-sm text-white max-w-md ${t.tone === 'error' ? 'bg-coral' : t.tone === 'info' ? 'bg-sky' : 'bg-ink dark:bg-sunken'}`}>
              {t.tone === 'error' ? <AlertTriangle size={16} /> : t.tone === 'info' ? <Info size={16} /> : <CheckCircle2 size={16} className="text-mint" />}
              <span className={t.tone === 'success' ? 'text-white dark:text-ink' : ''}>{t.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- data hook ---------- */
export function useData<T = any>(resource: string | null, params: Record<string, any> = {}) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const key = JSON.stringify(params);
  const reload = useCallback(async (silent = false) => {
    if (!resource) { setLoading(false); return; }
    if (!silent) setLoading(true);
    setError('');
    try { setData(await getRes(resource, params)); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, key]);
  useEffect(() => { reload(); }, [reload]);
  return { data, setData, loading, error, reload };
}

export function Confirm({ open, title, message, onConfirm, onClose, danger = true, confirmLabel }: any) {
  const { L } = usePrefs();
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<>
      <Btn variant="ghost" onClick={onClose}>{L('Cancel', 'إلغاء')}</Btn>
      <Btn variant={danger ? 'danger' : 'primary'} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>{confirmLabel || L('Confirm', 'تأكيد')}</Btn>
    </>}>
      <p className="text-sm">{message}</p>
    </Modal>
  );
}

export function ScaleToFit({ width = 794, children }: any) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [h, setH] = useState<number | undefined>(undefined);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const w = ref.current?.clientWidth || width;
      const s = Math.min(1, w / width); setScale(s);
      setH((inner.current?.offsetHeight || 0) * s);
    });
    if (ref.current) ro.observe(ref.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className="w-full overflow-hidden" style={{ height: h }} dir="ltr">
      <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}
