import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, MapPin, CalendarDays, Users, Wallet, Clock, Receipt, CreditCard, Laptop, FileText, MessageSquare, ShieldCheck,
  Building2, LifeBuoy, Settings, Menu, Sun, Moon, Languages, HelpCircle, ChevronDown, CheckCheck, LogOut, User, Accessibility,
  Lock, Palette, ExternalLink, WifiOff, X, PanelLeftClose, PanelLeftOpen, Bell, Search, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { act, getRes } from '../lib/api';
import { Avatar, Badge, Btn, Drawer, IconBtn, Input, TONE, TONE_SOLID, Toggle } from './ui';
import { timeAgo, fmtDate } from '../lib/format';

export const NAV = [
  { to: '/', icon: LayoutDashboard, en: 'Dashboard', ar: 'لوحة المعلومات', roles: ['admin', 'employee', 'vendor'], tone: 'brand', help: 'dashboard' },
  { to: '/attendance', icon: MapPin, en: 'Attendance', ar: 'الحضور', roles: ['admin', 'employee'], tone: 'sky', help: 'attendance' },
  { to: '/leave', icon: CalendarDays, en: 'Leave', ar: 'الإجازات', roles: ['admin', 'employee'], tone: 'mint', help: 'leave' },
  { to: '/directory', icon: Users, en: 'Directory', ar: 'دليل الموظفين', enE: 'My Profile', arE: 'ملفي', roles: ['admin', 'employee'], tone: 'violet', help: 'directory' },
  { to: '/payroll', icon: Wallet, en: 'Payroll', ar: 'الرواتب', enE: 'My Payslips', arE: 'قسائم راتبي', roles: ['admin', 'employee'], tone: 'amber', help: 'payroll' },
  { to: '/timesheets', icon: Clock, en: 'Timesheets', ar: 'سجلات الساعات', roles: ['admin', 'employee', 'vendor'], tone: 'indigo', help: 'timesheets' },
  { to: '/invoices', icon: Receipt, en: 'Invoicing', ar: 'الفوترة', enV: 'My Invoices', arV: 'فواتيري', roles: ['admin', 'vendor'], tone: 'coral', help: 'invoices' },
  { to: '/expenses', icon: CreditCard, en: 'Expenses', ar: 'المصروفات', roles: ['admin', 'employee'], tone: 'rose', help: 'expenses' },
  { to: '/assets', icon: Laptop, en: 'Assets', ar: 'الأصول', enE: 'My Assets', arE: 'عُهدي', roles: ['admin', 'employee'], tone: 'sky', help: 'assets' },
  { to: '/documents', icon: FileText, en: 'Documents', ar: 'المستندات', roles: ['admin', 'employee'], tone: 'violet', help: 'documents' },
  { to: '/chat', icon: MessageSquare, en: 'Chat', ar: 'المحادثات', roles: ['admin', 'employee', 'vendor'], tone: 'mint', help: 'chat' },
  { to: '/policies', icon: ShieldCheck, en: 'Policies & Compliance', ar: 'السياسات والامتثال', enE: 'Policies', arE: 'السياسات', roles: ['admin', 'employee'], tone: 'gold', help: 'policies' },
  { to: '/company', icon: Building2, en: 'Company Setup', ar: 'إعداد الشركة', roles: ['admin'], tone: 'brand', help: 'company' },
  { to: '/support', icon: LifeBuoy, en: 'Support', ar: 'الدعم', roles: ['admin', 'employee', 'vendor'], tone: 'coral', help: 'support' },
  { to: '/settings', icon: Settings, en: 'Settings', ar: 'الإعدادات', roles: ['admin', 'employee', 'vendor'], tone: 'slate', help: 'settings' },
];
export function navLabel(n: any, role: string, L: any) {
  if (role === 'employee' && n.enE) return L(n.enE, n.arE);
  if (role === 'vendor' && n.enV) return L(n.enV, n.arV);
  return L(n.en, n.ar);
}

function Brand({ c, collapsed }: any) {
  const { L } = usePrefs();
  return (
    <Link to="/" className="flex items-center gap-2.5 px-3 h-14 shrink-0" aria-label="HRplus home">
      {c?.logo_url ? <img src={c.logo_url} alt="" className="w-8 h-8 object-contain bg-white" /> : (
        <span className="relative w-8 h-8 grid place-items-center bg-brand text-white font-display font-bold text-sm shrink-0">H<span className="absolute -top-1 -end-1 w-3.5 h-3.5 bg-brand2 text-[#2a1d00] text-[10px] grid place-items-center leading-none">+</span></span>
      )}
      {!collapsed && <span className="min-w-0"><span className="block font-display font-bold text-[1.05rem] leading-none">HR<span className="text-brand">plus</span></span><span className="block text-[0.65rem] text-muted truncate mt-0.5">{L(c?.legal_name_en || 'Saudi HRMS', c?.legal_name_ar || 'نظام الموارد البشرية')}</span></span>}
    </Link>
  );
}

function Sidebar({ collapsed, onNavigate, links }: any) {
  const { me, role } = useAuth();
  const { L } = usePrefs();
  const items = NAV.filter((n) => n.roles.includes(role));
  return (
    <nav aria-label={L('Main navigation', 'التنقل الرئيسي')} className="flex flex-col h-full">
      <Brand c={me?.company} collapsed={collapsed} />
      <ul className="flex-1 overflow-y-auto scroll-thin px-2 py-1 flex flex-col gap-0.5">
        {items.map((n, i) => (
          <li key={n.to}>
            <NavLink to={n.to} end={n.to === '/'} onClick={onNavigate} title={collapsed ? navLabel(n, role, L) : undefined}
              className={({ isActive }) => `tap group relative flex items-center gap-2.5 h-9 px-2 text-sm transition ${isActive ? 'bg-brand/10 text-ink font-semibold' : 'text-muted hover:text-ink hover:bg-ink/5'}`}>
              {({ isActive }) => (<>
                {isActive && <span className="absolute inset-y-1 start-0 w-[3px] bg-brand" />}
                <span className={`grid place-items-center w-6 h-6 shrink-0 ${isActive ? TONE[n.tone] : 'text-current'}`}><n.icon size={15} aria-hidden /></span>
                {!collapsed && <span className="truncate flex-1">{navLabel(n, role, L)}</span>}
                {!collapsed && i < 9 && <kbd className="hidden lg:group-hover:inline text-[0.6rem] text-muted">Alt {i + 1}</kbd>}
              </>)}
            </NavLink>
          </li>
        ))}
        {links?.length > 0 && (
          <>
            {!collapsed && <li className="px-2 pt-3 pb-1 text-[0.65rem] uppercase tracking-wider text-muted">{L('Connected apps', 'تطبيقات مرتبطة')}</li>}
            {links.map((l: any) => (
              <li key={l.id}><a href={l.url} target="_blank" rel="noopener noreferrer" className="tap flex items-center gap-2.5 h-8 px-2 text-sm text-muted hover:text-ink hover:bg-ink/5" title={l.name}>
                <span className={`w-6 h-6 grid place-items-center shrink-0 ${TONE[l.color || 'sky']}`}><ExternalLink size={12} aria-hidden /></span>{!collapsed && <span className="truncate">{l.name}</span>}
              </a></li>
            ))}
          </>
        )}
      </ul>
      {!collapsed && (
        <div className="p-3 text-[0.65rem] text-muted leading-relaxed">
          <div className="flex gap-1 flex-wrap mb-1">{['GOSI', 'WPS', 'ZATCA', 'VAT 15%'].map((t, i) => <span key={t} className={`px-1 ${TONE[['mint', 'sky', 'coral', 'amber'][i]]}`}>{t}</span>)}</div>
          HRplus · {L('Kingdom of Saudi Arabia', 'المملكة العربية السعودية')}
        </div>
      )}
    </nav>
  );
}

function NotificationStrip() {
  const { L, lang } = usePrefs();
  const nav = useNavigate();
  const [data, setData] = useState<any>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => { try { setData(await act('notifications.list')); } catch { /* ignore */ } }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); const h = () => load(); window.addEventListener('hrplus:notify', h); return () => { clearInterval(t); window.removeEventListener('hrplus:notify', h); }; }, [load]);
  const unread = data.items.filter((n: any) => !n.read);
  const ticker = unread.length ? unread : data.items.slice(0, 3);
  useEffect(() => { if (ticker.length < 2) return; const t = setInterval(() => setIdx((i) => (i + 1) % ticker.length), 5000); return () => clearInterval(t); }, [ticker.length]);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); document.addEventListener('mousedown', h); document.addEventListener('keydown', k); return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); }; }, [open]);
  const cur = ticker[idx % Math.max(1, ticker.length)];
  const level: Record<string, string> = { success: 'mint', warning: 'amber', action: 'coral', info: 'sky', error: 'rose' };
  const openItem = async (n: any) => { setOpen(false); if (!n.read) { await act('notifications.read', { id: n.id }).catch(() => {}); load(); } if (n.link) nav(n.link); };
  return (
    <div ref={ref} className="relative z-30">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" aria-label={L(`Notifications, ${data.unread} unread`, `الإشعارات، ${data.unread} غير مقروءة`)}
        className="w-full flex items-center gap-2 h-8 px-3 md:px-4 text-xs bg-gradient-to-r from-brand/12 via-sky/8 to-brand2/15 hover:from-brand/18 transition text-start">
        <span className={`inline-flex items-center gap-1 px-1.5 h-5 font-semibold shrink-0 ${data.unread ? 'bg-coral text-white' : 'bg-ink/10 text-muted'}`}>{data.unread} {L('new', 'جديد')}</span>
        <span className="flex-1 min-w-0 truncate" key={cur?.id}>
          {cur ? <span className="ticker inline"><b className="font-semibold">{L(cur.title, cur.title_ar || cur.title)}</b> <span className="text-muted">· {L(cur.body, cur.body_ar || cur.body)} · {timeAgo(cur.created_at, lang)}</span></span> : <span className="text-muted">{L('You are all caught up', 'لا توجد إشعارات جديدة')}</span>}
        </span>
        <span className="hidden sm:inline text-muted shrink-0">{L('View all', 'عرض الكل')}</span>
        <ChevronDown size={14} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
            className="absolute end-2 md:end-4 top-full mt-1 w-[min(420px,calc(100vw-1rem))] bg-surface shadow-2xl" role="region" aria-label={L('Notifications', 'الإشعارات')}>
            <div className="flex items-center justify-between px-3 h-10 bg-surface2">
              <span className="font-display font-semibold text-sm">{L('Notifications', 'الإشعارات')}</span>
              <button className="text-xs text-brand inline-flex items-center gap-1 hover:underline" onClick={async () => { await act('notifications.read'); load(); }}><CheckCheck size={13} />{L('Mark all read', 'تعليم الكل كمقروء')}</button>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto scroll-thin">
              {data.items.length === 0 && <li className="p-6 text-center text-sm text-muted">{L('No notifications yet', 'لا توجد إشعارات')}</li>}
              {data.items.map((n: any) => (
                <li key={n.id}><button onClick={() => openItem(n)} className={`w-full text-start flex gap-2.5 px-3 py-2.5 hover:bg-brand/5 ${n.read ? 'opacity-70' : ''}`}>
                  <span className={`w-1 self-stretch shrink-0 ${TONE_SOLID[level[n.level] || 'sky']}`} />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{L(n.title, n.title_ar || n.title)}</span><span className="block text-xs text-muted">{L(n.body, n.body_ar || n.body)}</span><span className="block text-[0.65rem] text-muted mt-0.5">{timeAgo(n.created_at, lang)}</span></span>
                  {!n.read && <span className="w-2 h-2 bg-coral mt-1.5 shrink-0" aria-label="unread" />}
                </button></li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfileDrawer({ open, onClose }: any) {
  const { me, role, signOut } = useAuth();
  const { L, prefs, setPrefs, isDark } = usePrefs();
  const nav = useNavigate();
  const p = me?.profile || {}; const e = me?.employee; const v = me?.vendor;
  const go = (to: string) => { onClose(); nav(to); };
  const roleTone: any = { admin: 'coral', employee: 'sky', vendor: 'violet' };
  const quick = role === 'admin'
    ? [['/leave?tab=approvals', L('Pending approvals', 'الموافقات المعلقة'), CalendarDays], ['/payroll', L('Run payroll', 'تشغيل الرواتب'), Wallet], ['/invoices', L('New invoice', 'فاتورة جديدة'), Receipt], ['/company', L('Company setup', 'إعداد الشركة'), Building2]]
    : role === 'vendor'
      ? [['/invoices', L('My invoices', 'فواتيري'), Receipt], ['/timesheets', L('Approve timesheets', 'اعتماد السجلات'), Clock], ['/chat', L('Message HR', 'راسل الموارد البشرية'), MessageSquare], ['/support', L('Get support', 'الدعم'), LifeBuoy]]
      : [['/attendance', L('Check in', 'تسجيل الحضور'), MapPin], ['/leave', L('Request leave', 'طلب إجازة'), CalendarDays], ['/payroll', L('My payslips', 'قسائم راتبي'), Wallet], ['/documents', L('Salary certificate', 'شهادة راتب'), FileText]];
  return (
    <Drawer open={open} onClose={onClose} title={L('Your profile', 'ملفك الشخصي')} width="max-w-sm">
      <div className="p-4 bg-gradient-to-br from-brand/15 to-brand2/15">
        <div className="flex items-center gap-3">
          <Avatar name={p.display_name} size={56} />
          <div className="min-w-0">
            <div className="font-display font-semibold text-lg truncate">{p.display_name}</div>
            <div className="text-xs text-muted truncate">{p.email}</div>
            <div className="flex gap-1 mt-1"><Badge tone={roleTone[role]}>{role === 'admin' ? L('Administrator', 'مسؤول') : role === 'vendor' ? L('Vendor', 'مورد') : L('Employee', 'موظف')}</Badge>{p.mfa_enabled ? <Badge tone="mint"><Lock size={10} />MFA</Badge> : <Badge tone="amber">{L('No MFA', 'بدون تحقق ثنائي')}</Badge>}</div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 mt-4 text-xs">
          {e && <><div><dt className="text-muted">{L('Employee ID', 'الرقم الوظيفي')}</dt><dd className="font-medium">{e.id}</dd></div><div><dt className="text-muted">{L('Department', 'الإدارة')}</dt><dd className="font-medium">{e.department}</dd></div><div><dt className="text-muted">{L('Job title', 'المسمى')}</dt><dd className="font-medium">{e.job_title}</dd></div><div><dt className="text-muted">{L('Joined', 'تاريخ الالتحاق')}</dt><dd className="font-medium">{fmtDate(e.hire_date)}</dd></div></>}
          {v && <><div><dt className="text-muted">{L('Company', 'الشركة')}</dt><dd className="font-medium">{v.name}</dd></div><div><dt className="text-muted">{L('VAT no.', 'الرقم الضريبي')}</dt><dd className="font-medium">{v.vat_number}</dd></div></>}
          <div><dt className="text-muted">{L('Phone', 'الجوال')}</dt><dd className="font-medium" dir="ltr">{p.phone || '—'}</dd></div>
          <div><dt className="text-muted">{L('Last sign-in', 'آخر دخول')}</dt><dd className="font-medium">{me?.user?.last_sign_in_at ? timeAgo(me.user.last_sign_in_at) : '—'}</dd></div>
        </dl>
      </div>
      <div className="p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted mb-2">{L('Quick links', 'روابط سريعة')}</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {quick.map(([to, label, Icon]: any, i) => (<button key={to} onClick={() => go(to)} className={`flex items-center gap-2 p-2.5 text-sm text-start ${TONE[['brand', 'sky', 'coral', 'violet'][i]]} hover:brightness-95`}><Icon size={15} aria-hidden /><span className="text-ink text-xs font-medium">{label}</span></button>))}
        </div>
        <h3 className="text-xs uppercase tracking-wider text-muted mt-5 mb-1">{L('Settings shortcuts', 'اختصارات الإعدادات')}</h3>
        <Toggle label={L('Dark mode', 'الوضع الداكن')} checked={isDark} onChange={(v: boolean) => setPrefs({ theme: v ? 'dark' : 'light' })} />
        <Toggle label={L('Arabic interface (RTL)', 'الواجهة العربية')} checked={prefs.lang === 'ar'} onChange={(v: boolean) => setPrefs({ lang: v ? 'ar' : 'en' })} />
        <Toggle label={L('High contrast', 'تباين عالٍ')} checked={prefs.highContrast} onChange={(v: boolean) => setPrefs({ highContrast: v })} />
        <div className="flex flex-col mt-2">
          {[['/settings?tab=profile', L('Edit profile', 'تعديل الملف'), User], ['/settings?tab=appearance', L('Appearance', 'المظهر'), Palette], ['/settings?tab=accessibility', L('Accessibility', 'إمكانية الوصول'), Accessibility], ['/settings?tab=security', L('Security & MFA', 'الأمان والتحقق الثنائي'), Lock]].map(([to, label, Icon]: any) => (
            <button key={to} onClick={() => go(to)} className="tap flex items-center gap-2.5 h-9 px-1 text-sm hover:bg-ink/5 text-start"><Icon size={15} className="text-muted" aria-hidden />{label}</button>
          ))}
        </div>
        <Btn variant="dangerSoft" icon={LogOut} className="w-full mt-4" onClick={() => { onClose(); signOut(); }}>{L('Sign out', 'تسجيل الخروج')}</Btn>
      </div>
    </Drawer>
  );
}

function HelpPanel({ open, onClose, context }: any) {
  const { L, lang } = usePrefs();
  const [faqs, setFaqs] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => { if (open && !faqs.length) getRes('faqs').then(setFaqs).catch(() => {}); }, [open, faqs.length]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const ctx = faqs.filter((f) => f.context === context);
    const base = s ? faqs : ctx.length ? ctx : faqs.slice(0, 6);
    return base.filter((f) => !s || [f.q_en, f.q_ar, f.a_en, f.a_ar].join(' ').toLowerCase().includes(s));
  }, [faqs, q, context]);
  return (
    <Drawer open={open} onClose={onClose} title={L('Help for this page', 'مساعدة هذه الصفحة')} width="max-w-md">
      <div className="p-4">
        <div className="relative mb-3"><Search size={14} className="absolute top-2.5 start-2.5 text-muted" aria-hidden /><Input className="ps-8" placeholder={L('Search all help articles…', 'ابحث في مقالات المساعدة…')} value={q} onChange={(e: any) => setQ(e.target.value)} aria-label="Search help" /></div>
        {!q && <p className="text-xs text-muted mb-2">{L('Showing tips for', 'نصائح خاصة بـ')} <Badge tone="brand">{context}</Badge></p>}
        <ul className="flex flex-col gap-1">
          {list.map((f) => (
            <li key={f.id} className="bg-surface2">
              <button className="w-full text-start px-3 py-2.5 text-sm font-medium flex items-center gap-2" aria-expanded={openId === f.id} onClick={() => setOpenId(openId === f.id ? null : f.id)}>
                <HelpCircle size={14} className="text-brand shrink-0" aria-hidden /><span className="flex-1">{lang === 'ar' ? f.q_ar : f.q_en}</span><ChevronDown size={14} className={`transition ${openId === f.id ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {openId === f.id && <p className="px-3 pb-3 text-sm text-muted leading-relaxed">{lang === 'ar' ? f.a_ar : f.a_en}</p>}
            </li>
          ))}
          {!list.length && <li className="text-sm text-muted p-4 text-center">{L('No matching articles', 'لا توجد نتائج')}</li>}
        </ul>
        <Link to={`/support?tab=tickets&context=${context}`} onClick={onClose} className="mt-4 flex items-center gap-2 p-3 bg-coral/10 text-sm"><LifeBuoy size={16} className="text-coral" />{L('Still stuck? Open a support ticket', 'هل تحتاج مساعدة إضافية؟ افتح تذكرة دعم')}</Link>
      </div>
    </Drawer>
  );
}

function useIdleLogout() {
  const { me, signOut } = useAuth();
  const [warn, setWarn] = useState(false);
  const minutes = Number(me?.company?.settings?.security?.session_timeout_minutes) || 30;
  const last = useRef(Date.now());
  useEffect(() => {
    const bump = () => { last.current = Date.now(); if (warn) setWarn(false); };
    const evs = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      const idle = Date.now() - last.current;
      if (idle > minutes * 60000) signOut('expired');
      else if (idle > (minutes * 60 - 60) * 1000) setWarn(true);
    }, 5000);
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); clearInterval(t); };
  }, [minutes, signOut, warn]);
  return { warn, minutes, stay: () => { last.current = Date.now(); setWarn(false); } };
}

export default function Shell({ children }: any) {
  const { me, role } = useAuth();
  const { L, prefs, setPrefs, isDark } = usePrefs();
  const loc = useLocation();
  const nav = useNavigate();
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('hrplus.sidebar') === '1');
  const [profile, setProfile] = useState(false);
  const [help, setHelp] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [links, setLinks] = useState<any[]>([]);
  const idle = useIdleLogout();
  const items = NAV.filter((n) => n.roles.includes(role));
  const current = items.find((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to))) || items[0];
  useEffect(() => { getRes('app_links').then((d) => setLinks((d || []).filter((l: any) => !l.roles?.length || l.roles.includes(role)))).catch(() => {}); }, [role]);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  useEffect(() => { localStorage.setItem('hrplus.sidebar', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { setMobile(false); document.getElementById('main')?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    if (!prefs.shortcuts) return;
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable;
      if (e.altKey && /^[1-9]$/.test(e.key)) { const n = items[Number(e.key) - 1]; if (n) { e.preventDefault(); nav(n.to); } }
      else if (!typing && e.key === '?' ) { e.preventDefault(); setHelp(true); }
      else if (e.altKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); setPrefs({ lang: prefs.lang === 'ar' ? 'en' : 'ar' }); }
      else if (e.altKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); setPrefs({ theme: isDark ? 'light' : 'dark' }); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [items, nav, prefs.shortcuts, prefs.lang, isDark, setPrefs]);
  const pending = me?.profile?.status === 'pending';
  const mfaPolicy = role === 'admin' && me?.company?.settings?.security?.require_mfa_admin && !me?.profile?.mfa_enabled;

  return (
    <div className="min-h-screen flex">
      <a href="#main" className="skip-link">{L('Skip to content', 'انتقل إلى المحتوى')}</a>
      <aside className={`hidden md:flex flex-col fixed inset-y-0 start-0 z-30 bg-surface transition-[width] ${collapsed ? 'w-[60px]' : 'w-60'}`}>
        <Sidebar collapsed={collapsed} links={links} />
      </aside>
      <AnimatePresence>
        {mobile && (
          <div className="md:hidden fixed inset-0 z-50">
            <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobile(false)} />
            <motion.aside className="absolute inset-y-0 start-0 w-72 bg-surface" initial={{ x: prefs.lang === 'ar' ? '100%' : '-100%' }} animate={{ x: 0 }} exit={{ x: prefs.lang === 'ar' ? '100%' : '-100%' }} transition={{ type: 'tween', duration: 0.2 }}>
              <IconBtn icon={X} label={L('Close menu', 'إغلاق القائمة')} className="absolute top-3 end-2 z-10" onClick={() => setMobile(false)} />
              <Sidebar collapsed={false} links={links} onNavigate={() => setMobile(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
      <div className={`flex-1 min-w-0 flex flex-col ${collapsed ? 'md:ms-[60px]' : 'md:ms-60'} transition-[margin]`}>
        <div className="sticky top-0 z-20">
          <header className="flex items-center gap-1.5 h-14 px-2 md:px-4 bg-surface">
            <IconBtn icon={Menu} label={L('Open menu', 'فتح القائمة')} className="md:hidden" onClick={() => setMobile(true)} />
            <IconBtn icon={collapsed ? (prefs.lang === 'ar' ? PanelLeftClose : PanelLeftOpen) : (prefs.lang === 'ar' ? PanelLeftOpen : PanelLeftClose)} label={L('Toggle sidebar', 'إظهار/إخفاء الشريط')} className="hidden md:inline-grid" onClick={() => setCollapsed((c) => !c)} />
            {current && <span className={`hidden sm:grid place-items-center w-7 h-7 ${TONE[current.tone]}`}><current.icon size={15} aria-hidden /></span>}
            <div className="min-w-0 flex-1 px-1">
              <div className="font-display font-semibold truncate leading-tight">{current ? navLabel(current, role, L) : 'HRplus'}</div>
              <div className="text-[0.68rem] text-muted truncate hidden sm:block">{fmtDate(new Date().toISOString(), prefs.lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
            {!online && <Badge tone="amber" className="h-7"><WifiOff size={12} />{L('Offline', 'غير متصل')}</Badge>}
            <button onClick={() => setPrefs({ lang: prefs.lang === 'ar' ? 'en' : 'ar' })} className="icon-btn h-8 px-2 text-sm font-semibold hover:bg-ink/6 inline-flex items-center gap-1" aria-label={L('Switch to Arabic', 'Switch to English')} title="Alt+L">
              <Languages size={15} aria-hidden /><span className="hidden sm:inline">{prefs.lang === 'ar' ? 'EN' : 'ع'}</span>
            </button>
            <IconBtn icon={isDark ? Sun : Moon} label={L('Toggle dark mode', 'تبديل الوضع الداكن')} onClick={() => setPrefs({ theme: isDark ? 'light' : 'dark' })} title="Alt+T" />
            <IconBtn icon={HelpCircle} label={L('Help for this page (?)', 'مساعدة (?)')} onClick={() => setHelp(true)} />
            <button onClick={() => setProfile(true)} className="flex items-center gap-2 ps-1 pe-1 sm:pe-2 h-10 hover:bg-ink/5" aria-label={L('Open profile', 'فتح الملف الشخصي')}>
              <Avatar name={me?.profile?.display_name} size={32} />
              <span className="hidden lg:block text-start leading-tight"><span className="block text-sm font-medium max-w-[140px] truncate">{me?.profile?.display_name}</span><span className="block text-[0.65rem] text-muted capitalize">{role}</span></span>
            </button>
          </header>
          <NotificationStrip />
        </div>
        {pending && <div className="m-3 md:mx-4 p-3 bg-amber/15 text-sm flex gap-2"><AlertTriangle size={16} className="text-amber shrink-0 mt-0.5" />{L('Your account is awaiting approval. An administrator must link it to an employee or vendor record before you can see any data.', 'حسابك بانتظار الموافقة. يجب على المسؤول ربطه بسجل موظف أو مورد قبل عرض أي بيانات.')}</div>}
        {mfaPolicy && <Link to="/settings?tab=security" className="m-3 md:mx-4 mb-0 p-3 bg-coral/12 text-sm flex gap-2"><Lock size={16} className="text-coral shrink-0 mt-0.5" />{L('Company policy requires administrators to enable multi-factor authentication. Set it up now →', 'تتطلب سياسة الشركة تفعيل التحقق الثنائي للمسؤولين. فعّله الآن ←')}</Link>}
        <main id="main" tabIndex={-1} className="flex-1 p-3 md:p-4 outline-none w-full max-w-[1600px] mx-auto">{children}</main>
      </div>
      <ProfileDrawer open={profile} onClose={() => setProfile(false)} />
      <HelpPanel open={help} onClose={() => setHelp(false)} context={current?.help || 'dashboard'} />
      {idle.warn && (
        <div className="fixed bottom-4 end-4 z-[70] bg-surface shadow-2xl p-4 max-w-sm" role="alertdialog" aria-live="assertive">
          <div className="flex gap-2"><Bell size={18} className="text-amber shrink-0" /><div><div className="font-semibold text-sm">{L('Session about to expire', 'الجلسة على وشك الانتهاء')}</div><p className="text-xs text-muted">{L(`For your security you'll be signed out after ${idle.minutes} minutes of inactivity.`, `لحمايتك سيتم تسجيل خروجك بعد ${idle.minutes} دقيقة من عدم النشاط.`)}</p><Btn size="sm" className="mt-2" onClick={idle.stay}>{L('Stay signed in', 'البقاء متصلاً')}</Btn></div></div>
        </div>
      )}
    </div>
  );
}
