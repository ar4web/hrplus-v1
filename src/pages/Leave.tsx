import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, Plus, Check, X, ChevronLeft, ChevronRight, Trash2, Info, PartyPopper } from 'lucide-react';
import { act, createRes, deleteRes } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Badge, Field, Input, Select, Textarea, Modal, Tabs, Table, useData, useToast, Spinner, ErrorBox, Empty, PageHeader, Confirm } from '../components/ui';
import { Ring } from '../components/charts';
import { riyadhToday, addDays, dow, fmtDate, monthName } from '../lib/format';
import { workingDays, deptAr } from '../lib/saudi';

const ST: any = { pending: 'amber', approved: 'mint', rejected: 'coral', cancelled: 'slate' };

function RequestModal({ open, onClose, balances, holidays, onDone }: any) {
  const { L, lang } = usePrefs();
  const { me } = useAuth();
  const toast = useToast();
  const [f, setF] = useState<any>({ type_id: '', start_date: addDays(riyadhToday(), 7), end_date: addDays(riyadhToday(), 9), reason: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && !f.type_id && balances[0]) setF((s: any) => ({ ...s, type_id: balances[0].type.id })); }, [open, balances]);
  const bal = balances.find((b: any) => String(b.type.id) === String(f.type_id));
  const t = bal?.type;
  const hset = new Set<string>(holidays.map((h: any) => h.date));
  const wd = me?.company?.working_hours?.days || [0, 1, 2, 3, 4];
  const days = t?.calendar_days ? Math.max(0, Math.round((Date.parse(f.end_date) - Date.parse(f.start_date)) / 864e5) + 1) : workingDays(f.start_date, f.end_date, hset, wd);
  const avail = bal?.entitled ? bal.remaining - bal.pending : null;
  const submit = async () => {
    setErr('');
    if (!t) return setErr(L('Choose a leave type', 'اختر نوع الإجازة'));
    if (!f.start_date || !f.end_date || f.end_date < f.start_date) return setErr(L('End date must be on or after start date', 'تاريخ النهاية يجب أن يكون بعد البداية'));
    if (!days) return setErr(L('The selected range has no working days', 'لا توجد أيام عمل في الفترة'));
    if (avail != null && t.paid !== false && days > avail) return setErr(L(`Only ${avail} day(s) available`, `المتاح ${avail} يوم فقط`));
    setBusy(true);
    try { await act('leave.request', f); toast(L('Leave request submitted', 'تم إرسال طلب الإجازة')); onDone(); onClose(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={L('Request leave', 'طلب إجازة')} footer={<><Btn variant="ghost" onClick={onClose}>{L('Cancel', 'إلغاء')}</Btn><Btn loading={busy} onClick={submit} icon={Check}>{L('Submit request', 'إرسال الطلب')}</Btn></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={L('Leave type', 'نوع الإجازة')} className="col-span-2" htmlFor="lt">
          <Select id="lt" value={f.type_id} onChange={(e: any) => setF({ ...f, type_id: e.target.value })}>
            {balances.map((b: any) => <option key={b.type.id} value={b.type.id}>{lang === 'ar' ? b.type.name_ar : b.type.name_en}{b.entitled ? ` — ${b.remaining} ${L('left', 'متبقي')}` : ''}</option>)}
          </Select>
        </Field>
        <Field label={L('From', 'من')} htmlFor="ls"><Input id="ls" type="date" value={f.start_date} onChange={(e: any) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label={L('To', 'إلى')} htmlFor="le"><Input id="le" type="date" value={f.end_date} min={f.start_date} onChange={(e: any) => setF({ ...f, end_date: e.target.value })} /></Field>
        <Field label={L('Reason', 'السبب')} className="col-span-2" htmlFor="lr" hint={t?.requires_document ? L('Supporting document required (e.g. medical report)', 'مطلوب مستند داعم') : undefined}><Textarea id="lr" rows={2} value={f.reason} onChange={(e: any) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
      {t && (
        <div className="mt-3 p-3 bg-brand/8 text-sm flex flex-col gap-1">
          <div className="flex justify-between"><span>{t.calendar_days ? L('Calendar days', 'أيام تقويمية') : L('Working days (excl. Fri/Sat & public holidays)', 'أيام عمل (بدون الجمعة/السبت والعطل الرسمية)')}</span><b className="num">{days}</b></div>
          {avail != null && <div className="flex justify-between"><span>{L('Available after pending', 'المتاح بعد الطلبات المعلقة')}</span><b className={`num ${days > avail ? 'text-coral' : 'text-mint'}`}>{avail}</b></div>}
          <div className="text-xs text-muted flex gap-1 mt-1"><Info size={12} className="shrink-0 mt-0.5" />{[t.paid === false ? L('Unpaid', 'غير مدفوعة') : t.pay_note || L('Fully paid', 'مدفوعة'), t.notice_days ? L(`${t.notice_days} days notice`, `إشعار ${t.notice_days} يوم`) : null, t.max_consecutive ? L(`max ${t.max_consecutive} days`, `بحد أقصى ${t.max_consecutive} يوم`) : null].filter(Boolean).join(' · ')}</div>
        </div>
      )}
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}

function MonthCalendar({ leaves, holidays, admin }: any) {
  const { L, lang } = usePrefs();
  const today = riyadhToday();
  const [off, setOff] = useState(0);
  const base = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + off, 1));
  const y = base.getUTCFullYear(), m = base.getUTCMonth();
  const first = base.toISOString().slice(0, 10);
  const start = addDays(first, -dow(first));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const hmap = new Map(holidays.map((h: any) => [h.date, h]));
  const dn = lang === 'ar' ? ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <Card title={`${monthName(m, lang, true)} ${y}`} icon={CalendarDays} tone="mint" actions={<>
      <Btn size="xs" variant="ghost" icon={lang === 'ar' ? ChevronRight : ChevronLeft} onClick={() => setOff(off - 1)} aria-label="Previous month" />
      <Btn size="xs" variant="subtle" onClick={() => setOff(0)}>{L('Today', 'اليوم')}</Btn>
      <Btn size="xs" variant="ghost" icon={lang === 'ar' ? ChevronLeft : ChevronRight} onClick={() => setOff(off + 1)} aria-label="Next month" />
    </>}>
      <div className="grid grid-cols-7 gap-px bg-line/60" role="grid">
        {dn.map((d) => <div key={d} className="bg-surface2 text-[0.65rem] text-muted text-center py-1" role="columnheader">{d}</div>)}
        {cells.map((d) => {
          const inMonth = Number(d.slice(5, 7)) - 1 === m;
          const h: any = hmap.get(d);
          const ls = leaves.filter((l: any) => l.start_date <= d && l.end_date >= d);
          const wk = dow(d) >= 5;
          return (
            <div key={d} role="gridcell" className={`min-h-[78px] p-1 text-[0.68rem] ${inMonth ? (wk ? 'bg-sunken/70' : 'bg-surface') : 'bg-surface2 opacity-50'} ${d === today ? 'ring-2 ring-inset ring-brand' : ''}`}>
              <div className="font-semibold num mb-0.5">{Number(d.slice(8))}</div>
              {h && <div className="px-1 bg-brand2/25 text-amber truncate font-medium" title={h.name_en}>🇸🇦 {lang === 'ar' ? h.name_ar : h.name_en}</div>}
              {ls.slice(0, 3).map((l: any) => <div key={l.id} className={`px-1 truncate text-white ${l.status === 'pending' ? 'opacity-60' : ''}`} style={{ background: l.leave_types?.color || 'var(--brand)' }} title={`${l.employees?.full_name} · ${l.leave_types?.name_en} (${l.status})`}>{admin ? String(l.employees?.full_name || '').split(' ')[0] : (lang === 'ar' ? l.leave_types?.name_ar : l.leave_types?.name_en)}</div>)}
              {ls.length > 3 && <div className="text-muted">+{ls.length - 3}</div>}
            </div>
          );
        })}
      </div>
      <p className="text-[0.7rem] text-muted mt-2">{L('Faded = pending. Islamic holidays follow the Umm al-Qura calendar and may shift with moon sighting.', 'الباهت = معلق. الأعياد الإسلامية وفق تقويم أم القرى وقد تتغير حسب الرؤية.')}</p>
    </Card>
  );
}

function Decide({ req, onClose, onDone }: any) {
  const { L } = usePrefs(); const toast = useToast();
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const go = async (decision: string) => {
    setErr(''); setBusy(decision);
    try { await act('leave.decide', { id: req.id, decision, note }); toast(decision === 'approved' ? L('Leave approved', 'تمت الموافقة') : L('Leave rejected', 'تم الرفض')); onDone(); onClose(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  return (
    <Modal open={!!req} onClose={onClose} title={L('Review leave request', 'مراجعة طلب الإجازة')} footer={<><Btn variant="dangerSoft" icon={X} loading={busy === 'rejected'} onClick={() => go('rejected')}>{L('Reject', 'رفض')}</Btn><Btn variant="success" icon={Check} loading={busy === 'approved'} onClick={() => go('approved')}>{L('Approve', 'موافقة')}</Btn></>}>
      {req && <div className="text-sm flex flex-col gap-1 mb-3"><b>{req.employees?.full_name}</b><span>{req.leave_types?.name_en} · {req.start_date} → {req.end_date} · {req.days} {L('days', 'يوم')}</span><span className="text-muted">{req.reason}</span></div>}
      <Field label={L('Comment (required to reject)', 'ملاحظة (مطلوبة للرفض)')}><Textarea rows={2} value={note} onChange={(e: any) => setNote(e.target.value)} /></Field>
      <div className="mt-2"><ErrorBox error={err} /></div>
    </Modal>
  );
}

export default function Leave() {
  const { me, role } = useAuth();
  const { L, lang } = usePrefs();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const setTab = (t: string) => setSp({ tab: t });
  const [reqOpen, setReqOpen] = useState(sp.get('new') === '1');
  const [deciding, setDeciding] = useState<any>(null);
  const [statusF, setStatusF] = useState('all');
  const [dept, setDept] = useState('all');
  const [balances, setBalances] = useState<any[]>([]);
  const [balLoading, setBalLoading] = useState(true);
  const [balErr, setBalErr] = useState('');
  const [newHol, setNewHol] = useState({ date: '', name_en: '', name_ar: '' });
  const [delHol, setDelHol] = useState<any>(null);
  const isAdmin = role === 'admin';
  const reqs = useData('leave_requests');
  const hol = useData('holidays');
  const loadBal = async () => { if (!me?.employee) { setBalLoading(false); return; } setBalLoading(true); try { setBalances((await act('leave.balances')).balances); } catch (e: any) { setBalErr(e.message); } finally { setBalLoading(false); } };
  useEffect(() => { loadBal(); }, []);
  const refresh = () => { reqs.reload(true); loadBal(); };
  const mine = reqs.data.filter((r: any) => r.employee_id === me?.employee?.id);
  const pending = reqs.data.filter((r: any) => r.status === 'pending');
  const depts = [...new Set(reqs.data.map((r: any) => r.employees?.department).filter(Boolean))].sort() as string[];
  const calLeaves = reqs.data.filter((r: any) => ['approved', 'pending'].includes(r.status) && (dept === 'all' || r.employees?.department === dept));
  const cancel = async (r: any) => { try { await act('leave.cancel', { id: r.id }); toast(L('Request cancelled', 'تم الإلغاء')); refresh(); } catch (e: any) { toast(e.message, 'error'); } };
  const cols = [
    ...(isAdmin ? [{ key: 'emp', label: L('Employee', 'الموظف'), render: (r: any) => <span><b className="font-medium">{r.employees?.full_name}</b><span className="block text-xs text-muted">{L(r.employees?.department, deptAr(r.employees?.department))}</span></span> }] : []),
    { key: 'type', label: L('Type', 'النوع'), render: (r: any) => <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2" style={{ background: r.leave_types?.color }} />{lang === 'ar' ? r.leave_types?.name_ar : r.leave_types?.name_en}</span> },
    { key: 'dates', label: L('Dates', 'التواريخ'), render: (r: any) => <span className="num text-xs">{fmtDate(r.start_date, lang)} → {fmtDate(r.end_date, lang)}</span> },
    { key: 'days', label: L('Days', 'الأيام'), render: (r: any) => <b className="num">{r.days}</b> },
    { key: 'status', label: L('Status', 'الحالة'), render: (r: any) => <span><Badge tone={ST[r.status]}>{r.status}</Badge>{r.decision_note && <span className="block text-[0.65rem] text-muted max-w-[200px] truncate" title={r.decision_note}>{r.decision_note}</span>}</span> },
    { key: 'act', label: '', render: (r: any) => r.status === 'pending' ? (isAdmin ? <Btn size="xs" variant="soft" onClick={() => setDeciding(r)}>{L('Review', 'مراجعة')}</Btn> : <Btn size="xs" variant="dangerSoft" onClick={() => cancel(r)}>{L('Cancel', 'إلغاء')}</Btn>) : null },
  ];
  const listRows = (isAdmin && tab === 'requests' ? reqs.data : mine).filter((r: any) => statusF === 'all' || r.status === statusF);

  return (
    <div>
      <PageHeader title={L('Leave management', 'إدارة الإجازات')} subtitle={L('Policy-driven balances per Saudi Labor Law (Art. 109–117)', 'أرصدة وفق نظام العمل السعودي (المواد 109–117)')} icon={CalendarDays} tone="mint" actions={me?.employee && <Btn icon={Plus} onClick={() => setReqOpen(true)}>{L('Request leave', 'طلب إجازة')}</Btn>} />
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: L('Overview', 'نظرة عامة') },
        me?.employee && { value: 'mine', label: L('My requests', 'طلباتي') },
        isAdmin && { value: 'approvals', label: L('Approvals', 'الموافقات'), count: pending.length },
        isAdmin && { value: 'requests', label: L('All requests', 'كل الطلبات') },
        { value: 'holidays', label: L('Saudi holidays', 'العطل الرسمية') },
      ]} />
      <ErrorBox error={reqs.error} retry={reqs.reload} />

      {tab === 'overview' && (
        <div className="flex flex-col gap-3">
          {me?.employee && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {balLoading ? <div className="col-span-full"><Spinner /></div> : balErr ? <ErrorBox error={balErr} /> : balances.map((b: any) => (
                <div key={b.type.id} className="bg-surface p-3 flex items-center gap-3">
                  <Ring value={b.entitled ? b.remaining : b.used} max={b.entitled || Math.max(1, b.used)} color={b.type.color} label={b.type.name_en} />
                  <div className="min-w-0"><div className="text-sm font-medium truncate">{lang === 'ar' ? b.type.name_ar : b.type.name_en}</div><div className="text-[0.7rem] text-muted">{b.entitled ? L(`${b.used} used of ${b.entitled}`, `${b.used} مستخدم من ${b.entitled}`) : L(`${b.used} used`, `${b.used} مستخدم`)}</div>{b.pending > 0 && <Badge tone="amber">{b.pending} {L('pending', 'معلق')}</Badge>}</div>
                </div>
              ))}
            </div>
          )}
          {isAdmin && <div className="flex items-center gap-2"><span className="text-xs text-muted">{L('Department', 'الإدارة')}</span><Select className="!w-auto !h-8 text-xs" value={dept} onChange={(e: any) => setDept(e.target.value)}><option value="all">{L('All', 'الكل')}</option>{depts.map((d) => <option key={d} value={d}>{L(d, deptAr(d))}</option>)}</Select></div>}
          {reqs.loading ? <Spinner /> : <MonthCalendar leaves={calLeaves} holidays={hol.data} admin={isAdmin} />}
        </div>
      )}

      {(tab === 'mine' || tab === 'requests') && (
        <Card title={tab === 'mine' ? L('My leave requests', 'طلبات إجازتي') : L('All leave requests', 'جميع طلبات الإجازة')} pad={false} actions={<Select className="!w-auto !h-8 text-xs" value={statusF} onChange={(e: any) => setStatusF(e.target.value)} aria-label="Status"><option value="all">{L('All statuses', 'كل الحالات')}</option>{Object.keys(ST).map((s) => <option key={s} value={s}>{s}</option>)}</Select>}>
          {reqs.loading ? <Spinner /> : <Table rows={listRows} columns={tab === 'mine' ? cols.filter((c) => c.key !== 'emp') : cols} empty={<Empty icon={CalendarDays} title={L('No leave requests', 'لا توجد طلبات')} />} />}
        </Card>
      )}

      {tab === 'approvals' && isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {reqs.loading ? <Spinner /> : !pending.length ? <div className="col-span-full bg-surface"><Empty icon={PartyPopper} title={L('No pending approvals', 'لا توجد موافقات معلقة')} hint={L('You are all caught up.', 'لا يوجد شيء بانتظارك.')} /></div> : pending.map((r: any) => (
            <div key={r.id} className="bg-surface p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2"><span className="w-1.5 self-stretch" style={{ background: r.leave_types?.color }} /><div className="flex-1 min-w-0"><div className="font-medium truncate">{r.employees?.full_name}</div><div className="text-xs text-muted">{L(r.employees?.department, deptAr(r.employees?.department))}</div></div><Badge tone="amber">{r.days} {L('days', 'يوم')}</Badge></div>
              <div className="text-sm">{lang === 'ar' ? r.leave_types?.name_ar : r.leave_types?.name_en} · <span className="num">{fmtDate(r.start_date, lang)} → {fmtDate(r.end_date, lang)}</span></div>
              {r.reason && <p className="text-xs text-muted">“{r.reason}”</p>}
              <div className="flex gap-1.5 mt-auto"><Btn size="sm" variant="success" icon={Check} onClick={() => setDeciding(r)}>{L('Review', 'مراجعة')}</Btn></div>
            </div>
          ))}
        </div>
      )}

      {tab === 'holidays' && (
        <Card title={L('Saudi public holidays', 'العطل الرسمية في المملكة')} subtitle={L('Founding Day, Eid al-Fitr, Arafat & Eid al-Adha, National Day', 'يوم التأسيس، عيد الفطر، عرفة وعيد الأضحى، اليوم الوطني')} icon={PartyPopper} tone="gold" pad={false}>
          {isAdmin && (
            <form className="flex flex-wrap gap-2 p-3 bg-surface2" onSubmit={async (e) => { e.preventDefault(); if (!newHol.date || !newHol.name_en || !newHol.name_ar) { toast(L('Date and both names are required', 'التاريخ والاسمان مطلوبة'), 'error'); return; } try { await createRes('holidays', newHol); setNewHol({ date: '', name_en: '', name_ar: '' }); hol.reload(true); toast(L('Holiday added', 'تمت الإضافة')); } catch (er: any) { toast(er.message, 'error'); } }}>
              <Input type="date" className="!w-auto" value={newHol.date} onChange={(e: any) => setNewHol({ ...newHol, date: e.target.value })} aria-label="Date" />
              <Input className="!w-48" placeholder="Name (EN)" value={newHol.name_en} onChange={(e: any) => setNewHol({ ...newHol, name_en: e.target.value })} />
              <Input className="!w-48" placeholder="الاسم (عربي)" dir="rtl" value={newHol.name_ar} onChange={(e: any) => setNewHol({ ...newHol, name_ar: e.target.value })} />
              <Btn type="submit" icon={Plus}>{L('Add', 'إضافة')}</Btn>
            </form>
          )}
          {hol.loading ? <Spinner /> : <Table rows={hol.data} columns={[
            { key: 'date', label: L('Date', 'التاريخ'), render: (h: any) => <span className="num">{fmtDate(h.date, lang, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span> },
            { key: 'name_en', label: 'English' }, { key: 'name_ar', label: 'العربية', render: (h: any) => <span dir="rtl">{h.name_ar}</span> },
            { key: 'st', label: '', render: (h: any) => h.date < riyadhToday() ? <Badge>{L('past', 'مضى')}</Badge> : <Badge tone="gold">{L('upcoming', 'قادم')}</Badge> },
            ...(isAdmin ? [{ key: 'x', label: '', render: (h: any) => <Btn size="xs" variant="ghost" icon={Trash2} aria-label="Delete" onClick={() => setDelHol(h)} /> }] : []),
          ]} />}
        </Card>
      )}
      <RequestModal open={reqOpen} onClose={() => setReqOpen(false)} balances={balances} holidays={hol.data} onDone={refresh} />
      <Decide req={deciding} onClose={() => setDeciding(null)} onDone={refresh} />
      <Confirm open={!!delHol} onClose={() => setDelHol(null)} title={L('Delete holiday?', 'حذف العطلة؟')} message={delHol?.name_en} onConfirm={async () => { await deleteRes('holidays', delHol.id); hol.reload(true); toast(L('Deleted', 'تم الحذف')); }} />
    </div>
  );
}
