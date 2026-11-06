import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, CalendarDays, CreditCard, ScrollText, Plus, Save, CheckCircle2, Pencil, Users, AlertTriangle, BadgeCheck } from 'lucide-react';
import { act, createRes, updateRes } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Badge, Field, Input, Select, Textarea, Modal, Tabs, Table, useData, useToast, Spinner, ErrorBox, Empty, PageHeader, Stat, Toggle, Drawer, TONE } from '../components/ui';
import { fmtDate, money, riyadhToday, num } from '../lib/format';
import { iqamaStatus } from '../lib/saudi';

function Compliance() {
  const { L } = usePrefs(); const { me } = useAuth();
  const emps = useData('employees'); const runs = useData('payroll_runs', { limit: 3 }); const rules = useData('rules'); const acks = useData('rule_acks'); const invs = useData('invoices', { limit: 5, order: 'icv', asc: 'false' });
  if (emps.loading) return <Spinner />;
  const c = me?.company || {}; const today = riyadhToday();
  const live = emps.data.filter((e: any) => e.status !== 'Terminated');
  const saud = live.length ? (live.filter((e: any) => e.is_saudi).length / live.length) * 100 : 0;
  const band = saud >= 40 ? ['Platinum', 'mint'] : saud >= 27 ? ['High Green', 'mint'] : saud >= 20 ? ['Medium Green', 'sky'] : saud >= 12 ? ['Low Green', 'amber'] : ['Red', 'coral'];
  const iq = live.filter((e: any) => !e.is_saudi).map((e: any) => iqamaStatus(e, today));
  const expired = iq.filter((x) => x.key === 'expired').length, soon = iq.filter((x) => x.key === 'critical' || x.key === 'warning').length;
  const lastRun: any = runs.data[0];
  const active = rules.data.filter((r: any) => r.active);
  const ackRate = active.length && live.length ? (active.reduce((s: number, r: any) => s + acks.data.filter((a: any) => a.rule_id === r.id && a.version === r.version).length, 0) / (active.length * live.length)) * 100 : 0;
  const items = [
    { t: L('Saudization (Nitaqat)', 'السعودة (نطاقات)'), v: `${num(saud, 1)}%`, s: L(`Estimated band: ${band[0]} (indicative — confirm on Qiwa)`, `النطاق التقديري: ${band[0]}`), tone: band[1], ok: saud >= 20 },
    { t: L('Iqama validity', 'صلاحية الإقامات'), v: `${expired} / ${soon}`, s: L('expired / expiring ≤ 60 days', 'منتهية / تنتهي خلال 60 يوماً'), tone: expired ? 'rose' : soon ? 'amber' : 'mint', ok: !expired },
    { t: L('GOSI registration', 'التسجيل في التأمينات'), v: c.gosi_number || '—', s: L('Dual-rate contributions applied in payroll (cap SAR 45,000)', 'تطبيق النسبتين في الرواتب (سقف 45,000)'), tone: c.gosi_number ? 'mint' : 'coral', ok: !!c.gosi_number },
    { t: L('WPS (Mudad)', 'حماية الأجور (مدد)'), v: lastRun ? `${lastRun.period} · ${lastRun.status}` : '—', s: L('Latest payroll run & WPS file', 'آخر دورة رواتب وملف حماية الأجور'), tone: lastRun?.status === 'paid' ? 'mint' : 'amber', ok: lastRun?.status === 'paid' },
    { t: L('ZATCA e-invoicing', 'الفوترة الإلكترونية'), v: /^3\d{13}3$/.test(c.vat_number || '') ? L('VAT valid', 'الرقم الضريبي صالح') : L('VAT invalid', 'غير صالح'), s: L(`Phase 2 signing active · last ICV ${invs.data[0]?.icv ?? 0}`, `التوقيع مفعّل · آخر عداد ${invs.data[0]?.icv ?? 0}`), tone: /^3\d{13}3$/.test(c.vat_number || '') ? 'mint' : 'coral', ok: /^3\d{13}3$/.test(c.vat_number || '') },
    { t: L('Policy acknowledgements', 'الإقرار بالسياسات'), v: `${num(ackRate, 0)}%`, s: L(`${active.length} active policies × ${live.length} employees`, `${active.length} سياسة × ${live.length} موظف`), tone: ackRate >= 90 ? 'mint' : ackRate >= 60 ? 'amber' : 'coral', ok: ackRate >= 90 },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
      {items.map((x) => (
        <div key={x.t} className={`p-4 ${TONE[x.tone]} !text-ink flex gap-3`}>
          <span className={`w-9 h-9 grid place-items-center shrink-0 ${TONE[x.tone]}`}>{x.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}</span>
          <div className="min-w-0"><div className="text-sm text-muted">{x.t}</div><div className="font-display text-xl font-semibold">{x.v}</div><div className="text-xs text-muted">{x.s}</div></div>
        </div>
      ))}
    </div>
  );
}

function LeavePolicy({ admin }: any) {
  const { L, lang } = usePrefs(); const toast = useToast();
  const types = useData('leave_types');
  const [edits, setEdits] = useState<any>({});
  const [saving, setSaving] = useState<any>(null);
  const [nw, setNw] = useState<any>(null);
  const val = (t: any, k: string) => (edits[t.id]?.[k] !== undefined ? edits[t.id][k] : t[k]);
  const ed = (t: any, k: string, v: any) => setEdits({ ...edits, [t.id]: { ...(edits[t.id] || {}), [k]: v } });
  const save = async (t: any) => {
    const e = edits[t.id]; if (!e) return;
    for (const k of ['annual_days', 'days_after_5y', 'notice_days', 'max_consecutive', 'carry_forward']) if (k in e && e[k] !== '' && e[k] !== null && (isNaN(Number(e[k])) || Number(e[k]) < 0)) { toast(L(`${k} must be a non-negative number`, 'قيمة غير صالحة'), 'error'); return; }
    setSaving(t.id);
    try { const clean: any = {}; for (const [k, v] of Object.entries(e)) clean[k] = ['annual_days', 'days_after_5y', 'notice_days', 'max_consecutive', 'carry_forward'].includes(k) ? (v === '' ? null : Number(v)) : v; await updateRes('leave_types', t.id, clean); const n = { ...edits }; delete n[t.id]; setEdits(n); types.reload(true); toast(L('Leave policy saved', 'تم حفظ السياسة')); } catch (er: any) { toast(er.message, 'error'); } finally { setSaving(null); }
  };
  if (types.loading) return <Spinner />;
  const n = (t: any, k: string) => admin ? <Input type="number" min="0" className="!h-8 !w-20 text-xs" value={val(t, k) ?? ''} onChange={(e: any) => ed(t, k, e.target.value)} aria-label={k} /> : <span className="num">{t[k] ?? '—'}</span>;
  return (
    <Card title={L('Leave policy by type', 'سياسة الإجازات حسب النوع')} subtitle={L('Defaults follow Saudi Labor Law (2025 amendments). Edit per company policy.', 'القيم الافتراضية وفق نظام العمل (تعديلات 2025).')} icon={CalendarDays} tone="mint" pad={false} actions={admin && <Btn size="sm" icon={Plus} onClick={() => setNw({ code: '', name_en: '', name_ar: '', annual_days: 0, paid: true, color: '#0fa89a', active: true })}>{L('Add type', 'إضافة نوع')}</Btn>}>
      <Table rows={types.data} columns={[
        { key: 'n', label: L('Type', 'النوع'), render: (t: any) => <span className="flex items-center gap-2">{admin ? <input type="color" value={val(t, 'color') || '#888888'} onChange={(e) => ed(t, 'color', e.target.value)} className="w-6 h-6 p-0 border-0 bg-transparent" aria-label="Colour" /> : <span className="w-3 h-3" style={{ background: t.color }} />}<span><b className="font-medium">{lang === 'ar' ? t.name_ar : t.name_en}</b><span className="block text-[0.65rem] text-muted">{t.code}{t.gender ? ` · ${t.gender}` : ''}</span></span></span> },
        { key: 'd', label: L('Days / yr', 'أيام / سنة'), render: (t: any) => n(t, 'annual_days') },
        { key: 'd5', label: L('After 5 yrs', 'بعد 5 سنوات'), render: (t: any) => n(t, 'days_after_5y') },
        { key: 'nt', label: L('Notice', 'الإشعار'), render: (t: any) => n(t, 'notice_days') },
        { key: 'mx', label: L('Max / request', 'الحد / طلب'), render: (t: any) => n(t, 'max_consecutive') },
        { key: 'cf', label: L('Carry fwd', 'ترحيل'), render: (t: any) => n(t, 'carry_forward') },
        { key: 'p', label: L('Paid', 'مدفوعة'), render: (t: any) => admin ? <input type="checkbox" checked={!!val(t, 'paid')} onChange={(e) => ed(t, 'paid', e.target.checked)} aria-label="Paid" /> : t.paid ? '✓' : '✕' },
        { key: 'doc', label: L('Doc req.', 'مستند'), render: (t: any) => admin ? <input type="checkbox" checked={!!val(t, 'requires_document')} onChange={(e) => ed(t, 'requires_document', e.target.checked)} aria-label="Requires document" /> : t.requires_document ? '✓' : '' },
        { key: 'a', label: L('Active', 'مفعّل'), render: (t: any) => admin ? <input type="checkbox" checked={val(t, 'active') !== false} onChange={(e) => ed(t, 'active', e.target.checked)} aria-label="Active" /> : t.active !== false ? '✓' : '' },
        { key: 'note', label: L('Pay note', 'ملاحظة'), render: (t: any) => <span className="text-xs text-muted">{t.pay_note}</span> },
        ...(admin ? [{ key: 's', label: '', render: (t: any) => edits[t.id] ? <Btn size="xs" icon={Save} loading={saving === t.id} onClick={() => save(t)}>{L('Save', 'حفظ')}</Btn> : null }] : []),
      ]} />
      <Modal open={!!nw} onClose={() => setNw(null)} title={L('New leave type', 'نوع إجازة جديد')} footer={<Btn onClick={async () => { if (!nw.code || !nw.name_en || !nw.name_ar) { toast(L('Code and both names are required', 'الرمز والاسمان مطلوبة'), 'error'); return; } try { await createRes('leave_types', { ...nw, code: nw.code.toUpperCase(), annual_days: Number(nw.annual_days) || 0 }); setNw(null); types.reload(true); toast(L('Leave type added', 'تمت الإضافة')); } catch (e: any) { toast(e.message, 'error'); } }}>{L('Create', 'إنشاء')}</Btn>}>
        {nw && <div className="grid grid-cols-2 gap-3"><Field label="Code"><Input value={nw.code} onChange={(e: any) => setNw({ ...nw, code: e.target.value })} /></Field><Field label={L('Days / year', 'أيام / سنة')}><Input type="number" min="0" value={nw.annual_days} onChange={(e: any) => setNw({ ...nw, annual_days: e.target.value })} /></Field><Field label="Name (EN)"><Input value={nw.name_en} onChange={(e: any) => setNw({ ...nw, name_en: e.target.value })} /></Field><Field label="الاسم (عربي)"><Input dir="rtl" value={nw.name_ar} onChange={(e: any) => setNw({ ...nw, name_ar: e.target.value })} /></Field><Toggle label={L('Paid', 'مدفوعة')} checked={nw.paid} onChange={(v: boolean) => setNw({ ...nw, paid: v })} /></div>}
      </Modal>
    </Card>
  );
}

function ExpensePolicy({ admin }: any) {
  const { L, lang } = usePrefs(); const { me, setCompany } = useAuth(); const toast = useToast();
  const cats = useData('expense_categories');
  const [edits, setEdits] = useState<any>({}); const [saving, setSaving] = useState<any>(null);
  const [tiers, setTiers] = useState<any[]>(() => (me?.company?.settings?.expense_chain || [{ max: 1000, steps: ['Line Manager'] }, { max: 5000, steps: ['Line Manager', 'Finance'] }, { max: null, steps: ['Line Manager', 'Finance', 'CEO'] }]).map((t: any) => ({ max: t.max ?? '', steps: t.steps.join(', ') })));
  const [receipt, setReceipt] = useState(me?.company?.settings?.expense?.receipt_required_above ?? 100);
  const [tBusy, setTBusy] = useState(false);
  const [nw, setNw] = useState<any>(null);
  const val = (c: any, k: string) => (edits[c.id]?.[k] !== undefined ? edits[c.id][k] : c[k]);
  const ed = (c: any, k: string, v: any) => setEdits({ ...edits, [c.id]: { ...(edits[c.id] || {}), [k]: v } });
  const saveCat = async (c: any) => { const e = edits[c.id]; if ((e.cap_per_claim !== undefined && Number(e.cap_per_claim) < 0) || (e.monthly_budget !== undefined && Number(e.monthly_budget) < 0)) { toast(L('Values must be ≥ 0', 'القيم يجب أن تكون ≥ 0'), 'error'); return; } setSaving(c.id); try { await updateRes('expense_categories', c.id, { ...e, ...(e.cap_per_claim !== undefined ? { cap_per_claim: Number(e.cap_per_claim) } : {}), ...(e.monthly_budget !== undefined ? { monthly_budget: Number(e.monthly_budget) } : {}) }); const n = { ...edits }; delete n[c.id]; setEdits(n); cats.reload(true); toast(L('Category saved', 'تم الحفظ')); } catch (er: any) { toast(er.message, 'error'); } finally { setSaving(null); } };
  const saveTiers = async () => {
    const parsed = tiers.map((t, i) => ({ max: i === tiers.length - 1 || t.max === '' ? null : Number(t.max), steps: String(t.steps).split(',').map((s) => s.trim()).filter(Boolean) }));
    if (parsed.some((t) => !t.steps.length)) { toast(L('Each tier needs at least one approver', 'كل شريحة تحتاج معتمداً'), 'error'); return; }
    for (let i = 1; i < parsed.length - 1; i++) if (!(parsed[i].max > parsed[i - 1].max)) { toast(L('Thresholds must increase', 'يجب أن تتصاعد الحدود'), 'error'); return; }
    setTBusy(true);
    try { const r = await updateRes('company', 1, { settings: { expense_chain: parsed, expense: { ...(me?.company?.settings?.expense || {}), receipt_required_above: Number(receipt) || 0 } } }); setCompany(r); toast(L('Approval chain saved', 'تم حفظ سلسلة الموافقات')); } catch (e: any) { toast(e.message, 'error'); } finally { setTBusy(false); }
  };
  if (cats.loading) return <Spinner />;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-3">
      <Card title={L('Caps & budgets per category', 'الحدود والميزانيات لكل فئة')} icon={CreditCard} tone="rose" pad={false} actions={admin && <Btn size="sm" icon={Plus} onClick={() => setNw({ code: '', name_en: '', name_ar: '', cap_per_claim: 1000, monthly_budget: 10000, color: '#d9467b', active: true })}>{L('Add', 'إضافة')}</Btn>}>
        <Table rows={cats.data} columns={[
          { key: 'n', label: L('Category', 'الفئة'), render: (c: any) => <span className="flex items-center gap-2">{admin ? <input type="color" value={val(c, 'color')} onChange={(e) => ed(c, 'color', e.target.value)} className="w-6 h-6 p-0 border-0 bg-transparent" aria-label="Colour" /> : <span className="w-3 h-3" style={{ background: c.color }} />}<b className="font-medium">{lang === 'ar' ? c.name_ar : c.name_en}</b></span> },
          { key: 'cap', label: L('Cap per claim (SAR)', 'الحد لكل مطالبة'), render: (c: any) => admin ? <Input type="number" min="0" className="!h-8 !w-28 text-xs" value={val(c, 'cap_per_claim')} onChange={(e: any) => ed(c, 'cap_per_claim', e.target.value)} aria-label="Cap" /> : <span className="num">{money(c.cap_per_claim)}</span> },
          { key: 'b', label: L('Monthly budget', 'الميزانية الشهرية'), render: (c: any) => admin ? <Input type="number" min="0" className="!h-8 !w-28 text-xs" value={val(c, 'monthly_budget')} onChange={(e: any) => ed(c, 'monthly_budget', e.target.value)} aria-label="Budget" /> : <span className="num">{money(c.monthly_budget)}</span> },
          { key: 'a', label: L('Active', 'مفعّل'), render: (c: any) => admin ? <input type="checkbox" checked={val(c, 'active') !== false} onChange={(e) => ed(c, 'active', e.target.checked)} aria-label="Active" /> : c.active !== false ? '✓' : '' },
          ...(admin ? [{ key: 's', label: '', render: (c: any) => edits[c.id] ? <Btn size="xs" icon={Save} loading={saving === c.id} onClick={() => saveCat(c)}>{L('Save', 'حفظ')}</Btn> : null }] : []),
        ]} />
      </Card>
      <Card title={L('Approval chain by amount', 'سلسلة الموافقات حسب المبلغ')} icon={Users} tone="violet" actions={admin && <Btn size="sm" icon={Save} loading={tBusy} onClick={saveTiers}>{L('Save', 'حفظ')}</Btn>}>
        <ol className="flex flex-col gap-2">
          {tiers.map((t, i) => (
            <li key={i} className="p-2 bg-surface2 flex flex-col gap-1.5">
              <div className="text-xs text-muted">{i === 0 ? L('Up to', 'حتى') : i === tiers.length - 1 ? L(`Above SAR ${money(tiers[i - 1].max)}`, `أكثر من ${money(tiers[i - 1].max)}`) : L(`SAR ${money(tiers[i - 1].max)} –`, `${money(tiers[i - 1].max)} –`)}</div>
              {i < tiers.length - 1 && (admin ? <Input type="number" min="0" className="!h-8 text-xs" value={t.max} onChange={(e: any) => setTiers(tiers.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))} aria-label="Threshold" /> : <b className="num">SAR {money(t.max)}</b>)}
              {admin ? <Input className="!h-8 text-xs" value={t.steps} onChange={(e: any) => setTiers(tiers.map((x, j) => (j === i ? { ...x, steps: e.target.value } : x)))} aria-label="Approvers (comma separated)" placeholder="Line Manager, Finance" /> : <div className="text-sm">{t.steps}</div>}
            </li>
          ))}
        </ol>
        <Field label={L('Receipt required above (SAR)', 'الإيصال مطلوب فوق (ريال)')} className="mt-3">{admin ? <Input type="number" min="0" value={receipt} onChange={(e: any) => setReceipt(e.target.value)} /> : <b className="num">{receipt}</b>}</Field>
        <p className="text-[0.68rem] text-muted mt-2">{L('Claims above a category cap automatically get an extra CEO approval step.', 'المطالبات فوق حد الفئة تحتاج موافقة الرئيس التنفيذي.')}</p>
      </Card>
      <Modal open={!!nw} onClose={() => setNw(null)} title={L('New expense category', 'فئة جديدة')} footer={<Btn onClick={async () => { if (!nw.code || !nw.name_en || !nw.name_ar) { toast(L('Code and both names are required', 'الرمز والاسمان مطلوبة'), 'error'); return; } try { await createRes('expense_categories', { ...nw, code: nw.code.toUpperCase(), cap_per_claim: Number(nw.cap_per_claim), monthly_budget: Number(nw.monthly_budget) }); setNw(null); cats.reload(true); toast(L('Category added', 'تمت الإضافة')); } catch (e: any) { toast(e.message, 'error'); } }}>{L('Create', 'إنشاء')}</Btn>}>
        {nw && <div className="grid grid-cols-2 gap-3"><Field label="Code"><Input value={nw.code} onChange={(e: any) => setNw({ ...nw, code: e.target.value })} /></Field><Field label={L('Colour', 'اللون')}><input type="color" value={nw.color} onChange={(e) => setNw({ ...nw, color: e.target.value })} className="h-9 w-full" /></Field><Field label="Name (EN)"><Input value={nw.name_en} onChange={(e: any) => setNw({ ...nw, name_en: e.target.value })} /></Field><Field label="الاسم (عربي)"><Input dir="rtl" value={nw.name_ar} onChange={(e: any) => setNw({ ...nw, name_ar: e.target.value })} /></Field><Field label={L('Cap per claim', 'الحد')}><Input type="number" value={nw.cap_per_claim} onChange={(e: any) => setNw({ ...nw, cap_per_claim: e.target.value })} /></Field><Field label={L('Monthly budget', 'الميزانية')}><Input type="number" value={nw.monthly_budget} onChange={(e: any) => setNw({ ...nw, monthly_budget: e.target.value })} /></Field></div>}
      </Modal>
    </div>
  );
}

function RuleEditor({ rule, onClose, onSaved }: any) {
  const { L } = usePrefs(); const toast = useToast();
  const [f, setF] = useState<any>(rule?.id ? rule : { title_en: '', title_ar: '', body_en: '', body_ar: '', category: 'Conduct', active: true });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => { setBusy(true); setErr(''); try { const r = await act('rule.save', f); toast(r.version > (rule?.version || 0) ? L(`Published v${r.version} — employees asked to re-acknowledge`, `تم نشر الإصدار ${r.version}`) : L('Saved', 'تم الحفظ')); onSaved(); onClose(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} size="xl" title={rule?.id ? L(`Edit · v${rule.version}`, `تعديل · الإصدار ${rule.version}`) : L('New company rule', 'قاعدة جديدة')} footer={<><span className="me-auto text-xs text-muted">{L('Changing title or text publishes a new version and resets acknowledgements.', 'تغيير النص ينشر إصداراً جديداً ويعيد الإقرار.')}</span><Btn variant="ghost" onClick={onClose}>{L('Cancel', 'إلغاء')}</Btn><Btn loading={busy} icon={Save} onClick={save}>{L('Save & publish', 'حفظ ونشر')}</Btn></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Title (English)"><Input value={f.title_en} onChange={(e: any) => setF({ ...f, title_en: e.target.value })} /></Field>
        <Field label="العنوان (عربي)"><Input dir="rtl" value={f.title_ar} onChange={(e: any) => setF({ ...f, title_ar: e.target.value })} /></Field>
        <Field label="Policy text (English)"><Textarea rows={10} value={f.body_en} onChange={(e: any) => setF({ ...f, body_en: e.target.value })} /></Field>
        <Field label="نص السياسة (عربي)"><Textarea dir="rtl" rows={10} value={f.body_ar} onChange={(e: any) => setF({ ...f, body_ar: e.target.value })} /></Field>
        <Field label={L('Category', 'الفئة')}><Select value={f.category} onChange={(e: any) => setF({ ...f, category: e.target.value })}>{['Conduct', 'Attendance', 'Security', 'Workplace', 'Compensation', 'General'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <div className="flex items-end"><Toggle label={L('Active (visible to employees)', 'مفعّلة (ظاهرة للموظفين)')} checked={f.active} onChange={(v: boolean) => setF({ ...f, active: v })} /></div>
      </div>
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}

function Rules({ admin }: any) {
  const { L, lang } = usePrefs(); const { me } = useAuth(); const toast = useToast();
  const rules = useData('rules'); const acks = useData('rule_acks'); const emps = useData(admin ? 'employees' : null);
  const [edit, setEdit] = useState<any>(null); const [who, setWho] = useState<any>(null); const [busy, setBusy] = useState<any>(null);
  const [show, setShow] = useState<'both' | 'en' | 'ar'>(lang === 'ar' ? 'ar' : 'en');
  const visible = admin ? rules.data : rules.data.filter((r: any) => r.active);
  const myAck = (r: any) => acks.data.find((a: any) => a.rule_id === r.id && a.version === r.version && a.employee_id === me?.employee?.id);
  const ack = async (r: any) => { setBusy(r.id); try { await act('rule.ack', { rule_id: r.id }); acks.reload(true); toast(L('Acknowledged — thank you', 'تم الإقرار — شكراً')); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  if (rules.loading || acks.loading) return <Spinner />;
  const total = emps.data.filter((e: any) => e.status !== 'Terminated').length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">{admin && <Btn icon={Plus} onClick={() => setEdit({})}>{L('New rule', 'قاعدة جديدة')}</Btn>}<div className="flex-1" /><span className="text-xs text-muted">{L('Show', 'عرض')}</span><select className="h-8 bg-surface2 text-xs px-2" value={show} onChange={(e) => setShow(e.target.value as any)} aria-label="Language"><option value="both">EN + AR</option><option value="en">English</option><option value="ar">العربية</option></select></div>
      {!visible.length && <div className="bg-surface"><Empty icon={ScrollText} title={L('No company rules yet', 'لا توجد قواعد')} /></div>}
      {visible.map((r: any) => {
        const count = acks.data.filter((a: any) => a.rule_id === r.id && a.version === r.version).length;
        const mine = myAck(r);
        return (
          <article key={r.id} className="bg-surface p-4">
            <header className="flex flex-wrap items-center gap-2 mb-2">
              <ScrollText size={16} className="text-amber" />
              <h3 className="font-display font-semibold">{lang === 'ar' ? r.title_ar : r.title_en}</h3>
              <Badge tone="violet">v{r.version}</Badge><Badge>{r.category}</Badge>{!r.active && <Badge tone="coral">{L('inactive', 'غير مفعّلة')}</Badge>}
              <span className="text-xs text-muted">{L('Published', 'نُشرت')} {fmtDate(r.published_at, lang)}</span>
              <div className="flex-1" />
              {admin ? (<><button className="text-xs text-brand hover:underline" onClick={() => setWho(r)}>{L(`${count}/${total} acknowledged`, `${count}/${total} أقرّوا`)}</button><Btn size="xs" variant="soft" icon={Pencil} onClick={() => setEdit(r)}>{L('Edit', 'تعديل')}</Btn></>)
                : mine ? <Badge tone="mint"><BadgeCheck size={11} />{L(`Acknowledged ${fmtDate(mine.acked_at, lang)}`, `تم الإقرار ${fmtDate(mine.acked_at, lang)}`)}</Badge>
                  : <Btn size="sm" icon={CheckCircle2} loading={busy === r.id} onClick={() => ack(r)}>{L(`I have read & acknowledge v${r.version}`, `قرأت وأقر بالإصدار ${r.version}`)}</Btn>}
            </header>
            {admin && <div className="h-1.5 bg-ink/8 mb-3"><div className="h-full bg-mint" style={{ width: `${total ? (count / total) * 100 : 0}%` }} /></div>}
            <div className={`grid gap-4 ${show === 'both' ? 'md:grid-cols-2' : ''}`}>
              {show !== 'ar' && <p className="text-sm leading-relaxed whitespace-pre-wrap" dir="ltr">{r.body_en}</p>}
              {show !== 'en' && <p className="text-sm leading-relaxed whitespace-pre-wrap" dir="rtl">{r.body_ar}</p>}
            </div>
            {(r.history || []).length > 0 && <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">{L(`${r.history.length} previous version(s)`, `${r.history.length} إصدار سابق`)}</summary><ul className="mt-1">{r.history.slice().reverse().map((h: any) => <li key={h.version} className="py-1">v{h.version} · {fmtDate(h.published_at, lang)} · {h.title_en}</li>)}</ul></details>}
          </article>
        );
      })}
      {edit && <RuleEditor rule={edit} onClose={() => setEdit(null)} onSaved={() => rules.reload(true)} />}
      <Drawer open={!!who} onClose={() => setWho(null)} title={who ? `${who.title_en} · v${who.version}` : ''}>
        {who && (() => { const done = new Set(acks.data.filter((a: any) => a.rule_id === who.id && a.version === who.version).map((a: any) => a.employee_id)); const list = emps.data.filter((e: any) => e.status !== 'Terminated'); return (
          <div className="p-4"><div className="grid grid-cols-2 gap-2 mb-3"><Stat label={L('Acknowledged', 'أقرّوا')} value={done.size} tone="mint" /><Stat label={L('Outstanding', 'متبقي')} value={list.length - done.size} tone="coral" /></div>
            <ul className="text-sm">{list.sort((a: any, b: any) => Number(done.has(a.id)) - Number(done.has(b.id))).map((e: any) => <li key={e.id} className="flex justify-between py-1.5 border-b border-line/50"><span>{e.full_name}</span>{done.has(e.id) ? <Badge tone="mint">✓</Badge> : <Badge tone="coral">{L('pending', 'معلق')}</Badge>}</li>)}</ul></div>
        ); })()}
      </Drawer>
    </div>
  );
}

export default function Policies() {
  const { role } = useAuth(); const { L } = usePrefs();
  const admin = role === 'admin';
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || (admin ? 'compliance' : 'rules');
  return (
    <div>
      <PageHeader title={L('Rules, policy & compliance', 'القواعد والسياسات والامتثال')} subtitle={L('Configurable leave & expense policy · versioned rules with acknowledgement', 'سياسات قابلة للتهيئة · قواعد مرقمة بإصدارات مع الإقرار')} icon={ShieldCheck} tone="gold" />
      <Tabs className="mb-3" value={tab} onChange={(t: string) => setSp({ tab: t })} tabs={[admin && { value: 'compliance', label: L('Compliance', 'الامتثال'), icon: ShieldCheck }, { value: 'rules', label: L('Company rules', 'قواعد الشركة'), icon: ScrollText }, { value: 'leave', label: L('Leave policy', 'سياسة الإجازات'), icon: CalendarDays }, { value: 'expense', label: L('Expense policy', 'سياسة المصروفات'), icon: CreditCard }]} />
      {tab === 'compliance' && admin && <Compliance />}
      {tab === 'rules' && <Rules admin={admin} />}
      {tab === 'leave' && <LeavePolicy admin={admin} />}
      {tab === 'expense' && <ExpensePolicy admin={admin} />}
    </div>
  );
}
