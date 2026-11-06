import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, LogIn, LogOut, CloudOff, RefreshCw, ChevronLeft, ChevronRight, Satellite, Building2, Users, CheckCircle2, Clock, Home } from 'lucide-react';
import { act } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Badge, useData, useToast, Input, Select, Table, Spinner, ErrorBox, Empty, Stat, TONE } from '../components/ui';
import { riyadhToday, addDays, dow, fmtTime, fmtDate, num } from '../lib/format';
import { deptAr } from '../lib/saudi';

const QKEY = 'hrplus.punchQueue';
const readQ = (): any[] => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
const writeQ = (q: any[]) => localStorage.setItem(QKEY, JSON.stringify(q));
const STATUS_TONE: any = { present: 'mint', late: 'amber', absent: 'coral', leave: 'violet', failed: 'rose' };

function Result({ phase, result, onClose }: any) {
  const { L } = usePrefs();
  if (phase === 'locating') return (
    <div className="flex flex-col items-center gap-4 py-6" role="status">
      <div className="relative w-28 h-28 grid place-items-center">
        {[0, 1, 2].map((i) => <span key={i} className="radar-ring absolute inset-0 border-2 border-brand rounded-full" style={{ animationDelay: `${i * 0.5}s` }} />)}
        <span className="w-14 h-14 grid place-items-center bg-brand text-white rounded-full"><Satellite size={24} /></span>
      </div>
      <p className="text-sm text-muted">{L('Getting your GPS location…', 'جارٍ تحديد موقعك…')}</p>
    </div>
  );
  const ok = phase === 'success', queued = phase === 'queued';
  const color = ok ? 'var(--c-mint)' : queued ? 'var(--c-amber)' : 'var(--c-coral)';
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3 py-4 text-center" role="alert">
      <div className={!ok && !queued ? 'shake' : ''}>
        <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden>
          <motion.circle cx="56" cy="56" r="50" fill="none" stroke={color} strokeWidth="6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }} />
          <motion.circle cx="56" cy="56" r="42" fill={color} opacity="0.14" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring' }} style={{ transformOrigin: '56px 56px' }} />
          {ok && <motion.path d="M34 58 L50 73 L79 42" fill="none" stroke={color} strokeWidth="8" strokeLinecap="square" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.35 }} />}
          {!ok && !queued && <><motion.path d="M38 38 L74 74" stroke={color} strokeWidth="8" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.2 }} /><motion.path d="M74 38 L38 74" stroke={color} strokeWidth="8" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6, duration: 0.2 }} /></>}
          {queued && <motion.path d="M56 32 V62 M56 74 V80" stroke={color} strokeWidth="8" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45 }} />}
        </svg>
      </div>
      <div className="font-display text-lg font-semibold" style={{ color }}>{result?.title}</div>
      <p className="text-sm text-muted max-w-sm">{result?.detail}</p>
      <Btn variant="subtle" size="sm" onClick={onClose}>{L('Done', 'تم')}</Btn>
    </motion.div>
  );
}

function TeamToday() {
  const { L } = usePrefs();
  const [date, setDate] = useState(riyadhToday());
  const [dept, setDept] = useState('all');
  const emps = useData('employees');
  const att = useData('attendance', { f: { date } });
  const rows = useMemo(() => {
    const m = new Map(att.data.map((a: any) => [a.employee_id, a]));
    return emps.data.filter((e: any) => e.hire_date <= date && (dept === 'all' || e.department === dept)).map((e: any) => ({ ...e, rec: m.get(e.id) || null }));
  }, [emps.data, att.data, date, dept]);
  const count = (s: string) => rows.filter((r) => (r.rec?.status || 'none') === s).length;
  const depts = [...new Set(emps.data.map((e: any) => e.department))].sort() as string[];
  return (
    <Card title={L('Team attendance', 'حضور الفريق')} icon={Users} tone="violet" actions={<><Input type="date" value={date} onChange={(e: any) => setDate(e.target.value)} className="!h-8 !w-auto text-xs" aria-label="Date" /><Select value={dept} onChange={(e: any) => setDept(e.target.value)} className="!h-8 !w-auto text-xs" aria-label="Department"><option value="all">{L('All', 'الكل')}</option>{depts.map((d) => <option key={d} value={d}>{L(d, deptAr(d))}</option>)}</Select></>}>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mb-3">
        <Stat label={L('Present', 'حاضر')} value={count('present')} tone="mint" />
        <Stat label={L('Late', 'متأخر')} value={count('late')} tone="amber" />
        <Stat label={L('Absent', 'غائب')} value={count('absent')} tone="coral" />
        <Stat label={L('On leave', 'في إجازة')} value={count('leave')} tone="violet" />
        <Stat label={L('No record', 'لا يوجد سجل')} value={count('none')} tone="slate" />
      </div>
      {emps.loading || att.loading ? <Spinner /> : (
        <div className="max-h-[420px] overflow-y-auto scroll-thin">
          <Table dense rows={rows} columns={[
            { key: 'full_name', label: L('Employee', 'الموظف'), render: (r: any) => <span><span className="font-medium">{r.full_name}</span><span className="block text-xs text-muted">{L(r.department, deptAr(r.department))} · {r.location}</span></span> },
            { key: 'st', label: L('Status', 'الحالة'), render: (r: any) => r.rec ? <Badge tone={STATUS_TONE[r.rec.status]}>{r.rec.status}</Badge> : <Badge>{L('not yet', 'لم يسجل')}</Badge> },
            { key: 'in', label: L('In', 'دخول'), render: (r: any) => <span className="num">{fmtTime(r.rec?.check_in)}</span> },
            { key: 'out', label: L('Out', 'خروج'), render: (r: any) => <span className="num">{fmtTime(r.rec?.check_out)}</span> },
            { key: 'dist', label: L('Distance', 'المسافة'), render: (r: any) => r.rec?.remote ? <Badge tone="sky"><Home size={10} />{L('remote', 'عن بُعد')}</Badge> : r.rec?.distance_m != null ? <span className="num text-xs">{r.rec.distance_m} m</span> : '—' },
            { key: 'src', label: L('Source', 'المصدر'), render: (r: any) => r.rec?.source === 'offline' ? <Badge tone="amber"><CloudOff size={10} />offline</Badge> : <span className="text-xs text-muted">{r.rec?.source || '—'}</span> },
          ]} />
        </div>
      )}
    </Card>
  );
}

export default function Attendance() {
  const { me, role } = useAuth();
  const { L, lang, announce } = usePrefs();
  const toast = useToast();
  const emp = me?.employee;
  const c = me?.company || {};
  const today = riyadhToday();
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = addDays(today, -dow(today) + weekOffset * 7);
  const weekEnd = addDays(weekStart, 6);
  const own = role === 'admin' && emp ? { employee_id: emp.id } : undefined;
  const week = useData(emp ? 'attendance' : null, { dcol: 'date', from: weekStart, to: weekEnd, f: own, asc: 'true' });
  const todayQ = useData(emp ? 'attendance' : null, { f: { date: today, ...(own || {}) } });
  const hol = useData('holidays');
  const [phase, setPhase] = useState<'idle' | 'locating' | 'success' | 'fail' | 'queued'>('idle');
  const [result, setResult] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>(readQ());
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const rec: any = todayQ.data[0];
  const kind = !rec?.check_in ? 'checkin' : !rec?.check_out ? 'checkout' : null;
  const pendingKind = queue.find((q) => q.date === today)?.kind;

  const explain = (r: any, k: string) => {
    if (r.ok) return { title: k === 'checkin' ? L('Checked in!', 'تم تسجيل الحضور!') : L('Checked out!', 'تم تسجيل الانصراف!'), detail: r.remote ? L(`Remote work location recorded (${num(r.distance)} m from office).`, `تم تسجيل عمل عن بُعد (${num(r.distance)} م من المكتب).`) : L(`Inside the ${c.branch_name || 'office'} geofence — ${num(r.distance)} m from centre. ${r.record?.status === 'late' ? 'Marked late.' : 'On time.'}`, `داخل نطاق ${c.branch_name || 'المكتب'} — ${num(r.distance)} م. ${r.record?.status === 'late' ? 'متأخر.' : 'في الوقت.'}`) };
    if (r.reason === 'outside') return { title: L('Outside the geofence', 'خارج النطاق الجغرافي'), detail: L(`You are ${num(r.distance)} m from ${c.branch_name || 'the office'}; check-in is allowed within ${r.radius} m.`, `أنت على بعد ${num(r.distance)} م من ${c.branch_name || 'المكتب'}؛ الحد المسموح ${r.radius} م.`) };
    if (r.reason === 'already') return { title: L('Already checked in', 'تم التسجيل مسبقاً'), detail: L(`You checked in at ${fmtTime(r.record?.check_in)}.`, `سجلت حضورك الساعة ${fmtTime(r.record?.check_in)}.`) };
    if (r.reason === 'no_checkin') return { title: L('No check-in today', 'لا يوجد تسجيل حضور'), detail: L('Check in first before checking out.', 'سجّل حضورك أولاً.') };
    if (r.reason === 'already_out') return { title: L('Already checked out', 'تم تسجيل الانصراف'), detail: '' };
    return { title: L('Could not record', 'تعذر التسجيل'), detail: r.error || '' };
  };

  const sync = useCallback(async () => {
    const q = readQ(); if (!q.length || !navigator.onLine) return;
    setSyncing(true);
    const remaining: any[] = []; let okN = 0;
    for (const item of q) {
      try { const r = await act(`attendance.${item.kind}`, { ...item, offline: true }); if (r.ok || r.reason === 'already' || r.reason === 'already_out') okN++; else { okN++; toast(`${L('Offline punch rejected', 'رُفض التسجيل غير المتصل')}: ${explain(r, item.kind).title}`, 'error'); } }
      catch (e: any) { if (e.network) remaining.push(item); else { okN++; toast(e.message, 'error'); } }
    }
    writeQ(remaining); setQueue(remaining); setSyncing(false);
    if (okN) { toast(L(`${okN} offline punch(es) synced`, `تمت مزامنة ${okN} تسجيل`)); todayQ.reload(true); week.reload(true); }
  }, [toast, L]);
  useEffect(() => { const on = () => { setOnline(true); sync(); }; const off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); sync(); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, [sync]);

  const punch = (k: string) => {
    if (!navigator.geolocation) { setPhase('fail'); setResult({ title: L('GPS not available', 'GPS غير متاح'), detail: L('Your browser does not support location services.', 'المتصفح لا يدعم خدمات الموقع.') }); return; }
    setPhase('locating'); setResult(null);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const payload = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      const queueIt = () => { const item = { ...payload, kind: k, at: new Date().toISOString(), date: today }; const q = [...readQ(), item]; writeQ(q); setQueue(q); setPhase('queued'); setResult({ title: L('Saved offline', 'تم الحفظ دون اتصال'), detail: L('No connection. Your punch is stored on this device and will sync automatically when you are back online.', 'لا يوجد اتصال. تم حفظ التسجيل على جهازك وستتم مزامنته تلقائياً.') }); announce(L('Saved offline', 'تم الحفظ دون اتصال')); };
      if (!navigator.onLine) return queueIt();
      try {
        const r = await act(`attendance.${k}`, payload);
        const ex = explain(r, k); setResult(ex); setPhase(r.ok ? 'success' : 'fail'); announce(ex.title);
        if (r.ok) { todayQ.reload(true); week.reload(true); }
      } catch (e: any) { if (e.network) queueIt(); else { setPhase('fail'); setResult({ title: L('Could not record', 'تعذر التسجيل'), detail: e.message }); } }
    }, (err) => {
      setPhase('fail');
      const msg = err.code === 1 ? L('Location permission denied. Allow location access for this site and try again.', 'تم رفض إذن الموقع. اسمح بالوصول ثم حاول مجدداً.') : err.code === 3 ? L('GPS timed out. Move to an open area and retry.', 'انتهت مهلة GPS. حاول مجدداً.') : L('Unable to determine your location.', 'تعذر تحديد موقعك.');
      setResult({ title: L('GPS failed', 'فشل تحديد الموقع'), detail: msg }); announce(msg);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  const holidays = new Map(hol.data.map((h: any) => [h.date, h]));
  const workDays: number[] = c?.working_hours?.days || [0, 1, 2, 3, 4];
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDate = new Map(week.data.map((a: any) => [a.date, a]));
  const hrs = (a: any) => (a?.check_in && a?.check_out ? (Date.parse(a.check_out) - Date.parse(a.check_in)) / 3600e3 : 0);
  const weekHours = week.data.reduce((s: number, a: any) => s + hrs(a), 0);
  const dayNames = lang === 'ar' ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (!emp && role === 'admin') return <div className="flex flex-col gap-3"><TeamToday /></div>;
  if (!emp) return <Empty icon={MapPin} title={L('No employee record linked', 'لا يوجد سجل موظف مرتبط')} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr] gap-3">
        <Card title={L('Check in / out', 'تسجيل الحضور والانصراف')} icon={MapPin} tone="sky" actions={!online && <Badge tone="amber"><CloudOff size={11} />{L('Offline', 'غير متصل')}</Badge>}>
          <AnimatePresence mode="wait">
            {phase !== 'idle' ? <Result key="r" phase={phase} result={result} onClose={() => setPhase('idle')} /> : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-center gap-3 py-3">
                <div className="text-xs text-muted">{fmtDate(today, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                <div className="font-display text-4xl font-semibold num" aria-live="off"><Clock24 /></div>
                {todayQ.loading ? <Spinner /> : (
                  <>
                    <button onClick={() => kind && punch(kind)} disabled={!kind || !!pendingKind}
                      className={`tap relative w-40 h-40 rounded-full grid place-items-center text-white font-display text-lg font-semibold shadow-xl transition active:scale-95 disabled:opacity-50 ${kind === 'checkout' ? 'bg-coral' : 'bg-brand'}`}
                      aria-label={kind === 'checkin' ? L('Check in now', 'سجّل الحضور الآن') : kind === 'checkout' ? L('Check out now', 'سجّل الانصراف الآن') : L('Done for today', 'انتهى اليوم')}>
                      <span className="absolute inset-2 rounded-full border-2 border-white/30" />
                      <span className="flex flex-col items-center gap-1">{kind === 'checkout' ? <LogOut size={30} /> : kind === 'checkin' ? <LogIn size={30} /> : <CheckCircle2 size={30} />}{kind === 'checkin' ? L('Check in', 'حضور') : kind === 'checkout' ? L('Check out', 'انصراف') : L('Done', 'تم')}</span>
                    </button>
                    <div className="flex gap-4 text-sm">
                      <span><span className="text-muted text-xs block">{L('In', 'دخول')}</span><b className="num">{fmtTime(rec?.check_in)}</b></span>
                      <span><span className="text-muted text-xs block">{L('Out', 'خروج')}</span><b className="num">{fmtTime(rec?.check_out)}</b></span>
                      <span><span className="text-muted text-xs block">{L('Status', 'الحالة')}</span>{rec ? <Badge tone={STATUS_TONE[rec.status]}>{rec.status}</Badge> : <b>—</b>}</span>
                    </div>
                    {pendingKind && <p className="text-xs text-amber">{L('A punch for today is waiting to sync.', 'يوجد تسجيل لهذا اليوم بانتظار المزامنة.')}</p>}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="grid grid-cols-2 gap-1.5 mt-2 text-xs">
            <div className="p-2 bg-surface2"><div className="text-muted flex items-center gap-1"><Building2 size={11} />{L('Geofence', 'النطاق')}</div><div className="font-medium truncate">{c.branch_name}</div><div className="text-muted num">{L('radius', 'نصف القطر')} {c.geofence_radius} m</div></div>
            <div className="p-2 bg-surface2"><div className="text-muted flex items-center gap-1"><Clock size={11} />{L('Working hours', 'ساعات العمل')}</div><div className="font-medium num" dir="ltr">{c.working_hours?.start}–{c.working_hours?.end}</div><div className="text-muted">{L(`grace ${c.settings?.attendance?.grace_minutes ?? 15} min`, `سماح ${c.settings?.attendance?.grace_minutes ?? 15} د`)}</div></div>
          </div>
          {emp.location === 'Remote' && <p className="text-xs text-sky mt-2 flex gap-1"><Home size={12} className="shrink-0 mt-0.5" />{L('You are registered as a remote worker — GPS is recorded but the office geofence is not enforced.', 'أنت مسجل كموظف عن بُعد — يُسجل الموقع دون فرض نطاق المكتب.')}</p>}
          {queue.length > 0 && (
            <div className="mt-2 p-2 bg-amber/12 flex items-center gap-2 text-xs">
              <CloudOff size={14} className="text-amber" /><span className="flex-1">{L(`${queue.length} punch(es) stored offline`, `${queue.length} تسجيل محفوظ دون اتصال`)}</span>
              <Btn size="xs" variant="soft" icon={RefreshCw} loading={syncing} disabled={!online} onClick={sync}>{L('Sync now', 'مزامنة')}</Btn>
            </div>
          )}
        </Card>

        <Card title={L('My week', 'أسبوعي')} icon={Clock} tone="mint" actions={<>
          <span className="text-xs text-muted me-1 num">{L('Total', 'المجموع')} {num(weekHours, 1)}h</span>
          <Btn size="xs" variant="ghost" icon={lang === 'ar' ? ChevronRight : ChevronLeft} onClick={() => setWeekOffset((w) => w - 1)} aria-label={L('Previous week', 'الأسبوع السابق')} />
          <Btn size="xs" variant="subtle" onClick={() => setWeekOffset(0)}>{L('This week', 'هذا الأسبوع')}</Btn>
          <Btn size="xs" variant="ghost" icon={lang === 'ar' ? ChevronLeft : ChevronRight} onClick={() => setWeekOffset((w) => w + 1)} disabled={weekOffset >= 0} aria-label={L('Next week', 'الأسبوع التالي')} />
        </>}>
          <ErrorBox error={week.error} retry={week.reload} />
          <div className="text-xs text-muted mb-2">{fmtDate(weekStart, lang)} – {fmtDate(weekEnd, lang)}</div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const a: any = byDate.get(d); const h: any = holidays.get(d);
              const off = !workDays.includes(dow(d));
              const tone = h ? 'gold' : a ? STATUS_TONE[a.status] : off ? 'slate' : d > today ? 'slate' : d === today ? 'sky' : 'coral';
              return (
                <div key={d} className={`flex flex-col min-h-[150px] p-1.5 ${d === today ? 'ring-2 ring-inset ring-brand' : ''} ${off ? 'bg-sunken/60' : 'bg-surface2'}`}>
                  <div className="flex items-baseline justify-between"><span className="text-[0.65rem] text-muted">{dayNames[i]}</span><span className="font-display font-semibold num">{Number(d.slice(8))}</span></div>
                  <div className={`mt-1 h-1 ${TONE[tone]}`} style={{ background: 'currentColor' }} />
                  <div className="flex-1 flex flex-col gap-0.5 mt-1.5 text-[0.68rem]">
                    {h && <span className="text-amber font-medium leading-tight">{lang === 'ar' ? h.name_ar : h.name_en}</span>}
                    {a?.check_in && <span className="num"><LogIn size={9} className="inline text-mint" /> {fmtTime(a.check_in)}</span>}
                    {a?.check_out && <span className="num"><LogOut size={9} className="inline text-coral" /> {fmtTime(a.check_out)}</span>}
                    {a && !h && <span className="capitalize"><Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge></span>}
                    {!a && !h && off && <span className="text-muted">{L('Weekend', 'عطلة')}</span>}
                    {!a && !h && !off && d < today && <span className="text-coral">{L('No record', 'لا سجل')}</span>}
                  </div>
                  {hrs(a) > 0 && <div className="text-[0.7rem] font-semibold num text-end">{num(hrs(a), 1)}h</div>}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 text-[0.7rem] text-muted mt-2">{[['mint', L('Present', 'حاضر')], ['amber', L('Late', 'متأخر')], ['coral', L('Absent', 'غائب')], ['violet', L('Leave', 'إجازة')], ['gold', L('Holiday', 'عطلة رسمية')]].map(([t, l]) => <span key={t} className="inline-flex items-center gap-1"><span className={`w-2.5 h-2.5 ${TONE[t]}`} style={{ background: 'currentColor' }} />{l}</span>)}</div>
        </Card>
      </div>
      {role === 'admin' && <TeamToday />}
    </div>
  );
}

function Clock24() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return <span dir="ltr">{t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Riyadh' })}</span>;
}
