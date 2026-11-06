import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GripVertical, Maximize2, Minimize2, EyeOff, Eye, ArrowUp, ArrowDown, TrendingUp, TrendingDown, RotateCcw, RefreshCw, MapPin, CalendarDays, FileText, Receipt, Wallet, Users, Clock, MessageSquare, Activity, ChevronRight } from 'lucide-react';
import { act } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Segmented, Select, Toggle, ErrorBox, Skeleton, Badge, TONE, TONE_TEXT, IconBtn, Btn, Dot } from '../components/ui';
import { LineChart, BarChart, HBar, Donut } from '../components/charts';
import { fmtVal, timeAgo, fmtDate, num } from '../lib/format';
import { deptAr } from '../lib/saudi';

const DEFAULT_WIDE = ['payroll_trend', 'attendance_trend', 'hours_trend', 'invoiced_monthly', 'net_pay_trend'];
const ACTION_TONE: [RegExp, string, any][] = [[/^auth/, 'sky', Users], [/payroll/, 'amber', Wallet], [/invoice/, 'coral', Receipt], [/leave/, 'mint', CalendarDays], [/expense/, 'rose', Receipt], [/attendance/, 'sky', MapPin], [/rule|policy/, 'gold', FileText], [/timesheet/, 'indigo', Clock], [/chat/, 'mint', MessageSquare]];
const humanize = (a: string) => a.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function Kpi({ k, i }: any) {
  const { lang, L } = usePrefs();
  const hasPrev = k.prev != null && k.value != null && Number(k.prev) !== 0;
  const diff = hasPrev ? ((Number(k.value) - Number(k.prev)) / Math.abs(Number(k.prev))) * 100 : null;
  const good = diff == null ? null : k.invert ? diff <= 0 : diff >= 0;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className={`relative p-3 ${TONE[k.tone]} !text-ink overflow-hidden`}>
      <div className="text-[0.72rem] text-muted leading-tight min-h-[2em]">{lang === 'ar' ? k.label[1] : k.label[0]}</div>
      <div className={`font-display text-xl lg:text-2xl font-semibold num mt-1 ${TONE_TEXT[k.tone]}`}>{fmtVal(k.value, k.fmt, lang, k.fmt === 'sar')}</div>
      {diff != null ? (
        <div className={`mt-1 inline-flex items-center gap-1 text-[0.7rem] font-medium ${good ? 'text-mint' : 'text-coral'}`}>
          {diff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{diff >= 0 ? '+' : ''}{num(diff, 1)}%<span className="text-muted font-normal">{L('vs prev', 'مقارنة بالسابق')} ({fmtVal(k.prev, k.fmt, lang, true)})</span>
        </div>
      ) : k.prev != null ? <div className="mt-1 text-[0.7rem] text-muted">{L('prev', 'السابق')}: {fmtVal(k.prev, k.fmt, lang, true)}</div> : <div className="mt-1 h-4" />}
    </motion.div>
  );
}

function PanelBody({ c }: any) {
  const { lang, L } = usePrefs();
  const lbl = (s: any) => (lang === 'ar' ? s.name?.[1] : s.name?.[0]);
  const series = (c.series || []).map((s: any) => ({ ...s, label: lbl(s) }));
  const labels = lang === 'ar' && c.labels_ar ? c.labels_ar : c.key === 'headcount_by_dept' && lang === 'ar' ? c.labels.map(deptAr) : c.labels;
  if (c.type === 'line') return <><LineChart labels={c.labels} series={series} fmt={c.fmt} xfmt={c.xfmt} />{series.length > 1 && <Legend series={series} />}</>;
  if (c.type === 'bar') return <><BarChart labels={c.labels} series={series} fmt={c.fmt} xfmt={c.xfmt} />{series.length > 1 && <Legend series={series} />}{c.footer && <div className="flex justify-between text-sm mt-2 px-1 py-2 bg-coral/10"><span className="text-muted">{lang === 'ar' ? c.footer.label[1] : c.footer.label[0]}</span><b className="num text-coral">{fmtVal(c.footer.value, c.footer.fmt, lang)}</b></div>}</>;
  if (c.type === 'hbar') return <HBar labels={labels} values={series[0]?.data || []} fmt={c.fmt} />;
  if (c.type === 'donut') return <Donut labels={labels} values={series[0]?.data || []} fmt={c.fmt} />;
  if (c.type === 'list') return (
    <ul className="flex flex-col">
      {!c.items.length && <li className="text-sm text-muted py-6 text-center">{L('All Iqamas are valid for 60+ days', 'جميع الإقامات سارية لأكثر من 60 يوماً')}</li>}
      {c.items.map((it: any) => (
        <li key={it.id}><Link to={it.link} className="flex items-center gap-2 py-1.5 px-1 hover:bg-ink/5 text-sm">
          <Dot tone={it.tone} /><span className="flex-1 min-w-0"><span className="block truncate font-medium">{it.title}</span><span className="block text-xs text-muted truncate">{it.sub}</span></span>
          <Badge tone={it.tone}>{it.value < 0 ? L(`expired ${-it.value}d`, `منتهية ${-it.value} يوم`) : L(`${it.value} days`, `${it.value} يوم`)}</Badge>
        </Link></li>
      ))}
    </ul>
  );
  if (c.type === 'feed') return (
    <ol className="flex flex-col max-h-[340px] overflow-y-auto scroll-thin">
      {!c.items.length && <li className="text-sm text-muted py-6 text-center">{L('No recent activity', 'لا يوجد نشاط حديث')}</li>}
      {c.items.map((it: any, i: number) => {
        if (it.action) {
          const m = ACTION_TONE.find(([re]) => re.test(it.action)) || [null, 'slate', Activity];
          const Icon = m[2];
          return (<li key={i} className="flex gap-2.5 py-2 border-b border-line/50 last:border-0">
            <span className={`w-7 h-7 grid place-items-center shrink-0 ${TONE[m[1]]}`}><Icon size={13} /></span>
            <div className="min-w-0 flex-1 text-sm"><div><b className="font-medium">{humanize(it.action)}</b>{it.record && <span className="text-muted"> · #{it.record}</span>}</div><div className="text-xs text-muted truncate">{it.actor || 'system'} · {timeAgo(it.at, lang)}</div></div>
          </li>);
        }
        const tone = ({ success: 'mint', warning: 'amber', action: 'coral', info: 'sky' } as any)[it.level] || 'sky';
        return (<li key={i}><Link to={it.link || '/'} className="flex gap-2.5 py-2 border-b border-line/50 hover:bg-ink/5">
          <span className={`w-1 shrink-0 ${TONE[tone]}`} style={{ background: 'currentColor' }} />
          <div className="min-w-0 flex-1 text-sm"><div className="font-medium">{lang === 'ar' ? it.title[1] : it.title[0]}</div><div className="text-xs text-muted truncate">{lang === 'ar' ? it.body[1] : it.body[0]} · {timeAgo(it.at, lang)}</div></div>
        </Link></li>);
      })}
    </ol>
  );
  return null;
}
function Legend({ series }: any) {
  const P = ['var(--brand)', 'var(--c-sky)', 'var(--c-coral)', 'var(--c-violet)'];
  return <div className="flex flex-wrap gap-3 text-xs text-muted mt-1 px-1">{series.map((s: any, i: number) => <span key={i} className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5" style={{ background: s.color || P[i], borderTop: s.dashed ? '2px dashed' : undefined }} />{s.label}</span>)}</div>;
}

export default function Dashboard() {
  const { L, lang, prefs, setPrefs, announce } = usePrefs();
  const { me, role } = useAuth();
  const [range, setRange] = useState('30d');
  const [compare, setCompare] = useState(true);
  const [dept, setDept] = useState('all');
  const [client, setClient] = useState('all');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await act('dashboard', { range, compare, department: dept, client })); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [range, compare, dept, client]);
  useEffect(() => { load(); }, [load]);

  const charts = data?.charts || [];
  const keys = charts.map((c: any) => c.key);
  const saved = prefs.dashboard?.order || [];
  const order = [...saved.filter((k) => keys.includes(k)), ...keys.filter((k: string) => !saved.includes(k))];
  const wide = prefs.dashboard?.wide ?? DEFAULT_WIDE;
  const hidden = prefs.dashboard?.hidden || [];
  const save = (patch: any) => setPrefs({ dashboard: { order, wide, hidden, ...patch } });
  const move = (key: string, to: string | number) => {
    const arr = order.filter((k) => k !== key);
    const idx = typeof to === 'number' ? Math.max(0, Math.min(arr.length, to)) : arr.indexOf(to);
    arr.splice(idx < 0 ? arr.length : idx, 0, key);
    save({ order: arr });
  };
  const byKey = Object.fromEntries(charts.map((c: any) => [c.key, c]));
  const visible = order.filter((k) => !hidden.includes(k));
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Riyadh' }).format(new Date()));
  const greet = hour < 12 ? L('Good morning', 'صباح الخير') : hour < 17 ? L('Good afternoon', 'مساء الخير') : L('Good evening', 'مساء الخير');
  const hijri = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(new Date());
  const quick = role === 'admin'
    ? [['/leave?tab=approvals', L('Approvals', 'الموافقات'), CalendarDays, 'mint'], ['/payroll', L('Run payroll', 'تشغيل الرواتب'), Wallet, 'amber'], ['/invoices?new=1', L('New invoice', 'فاتورة جديدة'), Receipt, 'coral'], ['/directory?tab=iqama', L('Iqama tracker', 'متابعة الإقامات'), Users, 'violet']]
    : role === 'vendor'
      ? [['/invoices', L('Invoices', 'الفواتير'), Receipt, 'coral'], ['/timesheets', L('Approve timesheets', 'اعتماد السجلات'), Clock, 'indigo'], ['/chat', L('Message us', 'راسلنا'), MessageSquare, 'mint']]
      : [['/attendance', L('Check in', 'تسجيل حضور'), MapPin, 'sky'], ['/leave?new=1', L('Request leave', 'طلب إجازة'), CalendarDays, 'mint'], ['/expenses?new=1', L('Claim expense', 'مطالبة مصروف'), Receipt, 'rose'], ['/documents', L('Get a letter', 'طلب خطاب'), FileText, 'violet']];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <h1 className="font-display text-2xl font-semibold">{greet}, {String(me?.profile?.display_name || '').split(' ')[0]} <span aria-hidden>👋</span></h1>
          <p className="text-sm text-muted">{fmtDate(new Date().toISOString(), lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {hijri}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quick.map(([to, label, Icon, tone]: any) => <Link key={to} to={to} className={`tap inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium ${TONE[tone]} hover:brightness-95`}><Icon size={13} />{label}<ChevronRight size={12} className="rtl:rotate-180 opacity-60" /></Link>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-surface p-2" role="group" aria-label={L('Dashboard filters', 'فلاتر لوحة المعلومات')}>
        <span className="text-xs text-muted px-1">{L('Time', 'الفترة')}</span>
        <Segmented value={range} onChange={setRange} label="Time range" options={[{ value: '30d', label: L('30D', '30 ي') }, { value: '90d', label: L('90D', '90 ي') }, { value: '6m', label: L('6M', '6 أشهر') }, { value: '12m', label: L('12M', '12 شهر') }]} />
        <div className="px-1"><Toggle label={L('Compare to previous period', 'مقارنة بالفترة السابقة')} checked={compare} onChange={setCompare} /></div>
        {data?.scopes && (
          <>
            <span className="text-xs text-muted px-1">{L('Scope', 'النطاق')}</span>
            <Select value={dept} onChange={(e: any) => setDept(e.target.value)} className="!w-auto !h-8 text-xs" aria-label="Department"><option value="all">{L('All departments', 'كل الإدارات')}</option>{data.scopes.departments.map((d: string) => <option key={d} value={d}>{L(d, deptAr(d))}</option>)}</Select>
            <Select value={client} onChange={(e: any) => setClient(e.target.value)} className="!w-auto !h-8 text-xs" aria-label="Client"><option value="all">{L('All clients', 'كل العملاء')}</option>{data.scopes.clients.map((d: string) => <option key={d} value={d}>{d}</option>)}</Select>
          </>
        )}
        <div className="flex-1" />
        {hidden.length > 0 && <Btn size="sm" variant="soft" icon={Eye} onClick={() => save({ hidden: [] })}>{L(`Show ${hidden.length} hidden`, `إظهار ${hidden.length} مخفية`)}</Btn>}
        <IconBtn icon={RotateCcw} label={L('Reset layout', 'إعادة تعيين التخطيط')} onClick={() => { setPrefs({ dashboard: { order: [], wide: DEFAULT_WIDE, hidden: [] } }); announce(L('Layout reset', 'تمت إعادة التخطيط')); }} />
        <IconBtn icon={RefreshCw} label={L('Refresh', 'تحديث')} onClick={load} />
      </div>

      <ErrorBox error={error} retry={load} />

      <div className={`grid gap-2 grid-cols-2 sm:grid-cols-3 ${(data?.kpis?.length || 8) > 6 ? 'lg:grid-cols-4 xl:grid-cols-8' : 'lg:grid-cols-6'}`}>
        {loading && !data ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[92px]" />) : data?.kpis.map((k: any, i: number) => <Kpi key={k.key} k={k} i={i} />)}
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 transition-opacity ${loading && data ? 'opacity-60' : ''}`}>
        {loading && !data && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[280px]" />)}
        {visible.map((key, idx) => {
          const c = byKey[key]; if (!c) return null;
          const isWide = wide.includes(key);
          return (
            <motion.div layout={!prefs.reduceMotion} key={key} className={`${isWide ? 'lg:col-span-2' : ''} ${overKey === key && dragKey !== key ? 'ring-2 ring-brand ring-offset-2 ring-offset-bg' : ''} ${dragKey === key ? 'opacity-50' : ''}`}
              draggable onDragStart={(e: any) => { setDragKey(key); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key); }}
              onDragOver={(e: any) => { e.preventDefault(); setOverKey(key); }} onDragLeave={() => setOverKey(null)}
              onDrop={(e: any) => { e.preventDefault(); const from = e.dataTransfer.getData('text/plain') || dragKey; if (from && from !== key) { move(from, key); announce(L('Panel moved', 'تم نقل اللوحة')); } setDragKey(null); setOverKey(null); }}
              onDragEnd={() => { setDragKey(null); setOverKey(null); }}>
              <Card className="h-full group" title={<span className="flex items-center gap-1.5"><GripVertical size={14} className="text-muted cursor-grab active:cursor-grabbing shrink-0" aria-hidden />{lang === 'ar' ? c.title[1] : c.title[0]}</span>}
                actions={<div className="flex opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition">
                  <IconBtn icon={ArrowUp} label={L('Move panel earlier', 'نقل للأعلى')} onClick={() => move(key, idx - 1)} disabled={idx === 0} className="!w-7 !h-7" />
                  <IconBtn icon={ArrowDown} label={L('Move panel later', 'نقل للأسفل')} onClick={() => move(key, idx + 1)} disabled={idx === visible.length - 1} className="!w-7 !h-7" />
                  <IconBtn icon={isWide ? Minimize2 : Maximize2} label={isWide ? L('Make narrow', 'تضييق') : L('Make wide', 'توسيع')} onClick={() => save({ wide: isWide ? wide.filter((w) => w !== key) : [...wide, key] })} className="!w-7 !h-7 hidden lg:inline-grid" />
                  <IconBtn icon={EyeOff} label={L('Hide panel', 'إخفاء اللوحة')} onClick={() => save({ hidden: [...hidden, key] })} className="!w-7 !h-7" />
                </div>}>
                <PanelBody c={c} />
              </Card>
            </motion.div>
          );
        })}
      </div>
      {data && <p className="text-[0.7rem] text-muted text-center">{L('Tip: drag panels by their title to rearrange — your layout is saved to your account.', 'نصيحة: اسحب اللوحات من عنوانها لإعادة ترتيبها — يُحفظ التخطيط في حسابك.')} {L('Period', 'الفترة')}: {fmtDate(data.period.start, lang)} – {fmtDate(data.period.end, lang)}</p>}
    </div>
  );
}
