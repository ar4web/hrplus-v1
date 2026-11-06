import { useMemo, useState } from 'react';
import { Laptop, Plus, Pencil, Trash2, ShieldCheck, ShieldAlert, ArrowRight, History, TrendingDown, Search, Wrench } from 'lucide-react';
import { act, createRes, updateRes, deleteRes } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Badge, Field, Input, Select, Modal, Drawer, Table, useData, useToast, Spinner, ErrorBox, Empty, PageHeader, Stat, Confirm, Textarea, TONE } from '../components/ui';
import { sar, money, fmtDate, riyadhToday, daysBetween, num } from '../lib/format';
import { depreciation } from '../lib/saudi';

const STAGES = ['Procured', 'In Stock', 'Assigned', 'In Repair', 'Retired', 'Disposed'];
const STAGE_TONE: any = { Procured: 'sky', 'In Stock': 'indigo', Assigned: 'mint', 'In Repair': 'amber', Retired: 'slate', Disposed: 'coral' };
const NEXT: any = { Procured: ['In Stock'], 'In Stock': ['Assigned', 'In Repair', 'Retired'], Assigned: ['In Stock', 'In Repair', 'Retired'], 'In Repair': ['Assigned', 'In Stock', 'Retired'], Retired: ['Disposed', 'In Stock'], Disposed: [] };
const EMPTY = { tag: '', name: '', category: 'Laptop', serial_no: '', purchase_date: riyadhToday(), cost: '', salvage_value: '0', useful_life_years: '4', dep_method: 'straight_line', warranty_expiry: '', supplier: '', location: 'Riyadh HQ', status: 'Procured' };

function warranty(a: any, today: string) {
  if (!a.warranty_expiry) return { tone: 'slate', en: 'No warranty', ar: 'بدون ضمان', days: null };
  const d = daysBetween(today, a.warranty_expiry);
  if (d < 0) return { tone: 'coral', en: 'Expired', ar: 'منتهي', days: d };
  if (d <= 60) return { tone: 'amber', en: `${d}d left`, ar: `متبقي ${d} يوم`, days: d };
  return { tone: 'mint', en: 'Under warranty', ar: 'ضمن الضمان', days: d };
}

function AssetForm({ initial, onClose, onSaved }: any) {
  const { L } = usePrefs(); const toast = useToast();
  const [f, setF] = useState<any>(initial || EMPTY);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr('');
    if (!f.name?.trim() || !f.tag?.trim()) return setErr(L('Asset tag and name are required', 'الرمز والاسم مطلوبان'));
    if (!(Number(f.cost) > 0)) return setErr(L('Cost must be greater than 0', 'التكلفة مطلوبة'));
    if (Number(f.salvage_value) < 0 || Number(f.salvage_value) >= Number(f.cost)) return setErr(L('Salvage value must be between 0 and cost', 'القيمة المتبقية غير صحيحة'));
    if (!(Number(f.useful_life_years) >= 1 && Number(f.useful_life_years) <= 50)) return setErr(L('Useful life must be 1–50 years', 'العمر الإنتاجي 1–50 سنة'));
    setBusy(true);
    try {
      const v = { ...f, cost: Number(f.cost), salvage_value: Number(f.salvage_value), useful_life_years: Number(f.useful_life_years), warranty_expiry: f.warranty_expiry || null };
      delete v.employees; delete v.history; delete v.assigned_to;
      if (initial?.id) await updateRes('assets', initial.id, v); else await createRes('assets', { ...v, history: [{ at: new Date().toISOString(), from: null, to: v.status, by: 'Admin', note: 'Registered' }] });
      toast(L('Asset saved', 'تم حفظ الأصل')); onSaved(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} wide title={initial?.id ? L('Edit asset', 'تعديل الأصل') : L('Register asset', 'تسجيل أصل')} footer={<><Btn variant="ghost" onClick={onClose}>{L('Cancel', 'إلغاء')}</Btn><Btn loading={busy} onClick={save}>{L('Save', 'حفظ')}</Btn></>}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label={L('Asset tag', 'رمز الأصل')}><Input value={f.tag} onChange={set('tag')} placeholder="HRP-LAP-0001" dir="ltr" /></Field>
        <Field label={L('Name / model', 'الاسم / الطراز')} className="sm:col-span-2"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label={L('Category', 'الفئة')}><Select value={f.category} onChange={set('category')}>{['Laptop', 'Monitor', 'Mobile', 'Tablet', 'Vehicle', 'IT Infrastructure', 'Furniture', 'AV Equipment', 'Other'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label={L('Serial no.', 'الرقم التسلسلي')}><Input value={f.serial_no} onChange={set('serial_no')} dir="ltr" /></Field>
        <Field label={L('Supplier', 'المورد')}><Input value={f.supplier} onChange={set('supplier')} /></Field>
        <Field label={L('Purchase date', 'تاريخ الشراء')}><Input type="date" value={f.purchase_date} onChange={set('purchase_date')} /></Field>
        <Field label={L('Cost (SAR)', 'التكلفة')}><Input type="number" min="0" value={f.cost} onChange={set('cost')} /></Field>
        <Field label={L('Salvage value', 'القيمة المتبقية')}><Input type="number" min="0" value={f.salvage_value} onChange={set('salvage_value')} /></Field>
        <Field label={L('Useful life (years)', 'العمر الإنتاجي')}><Input type="number" min="1" max="50" value={f.useful_life_years} onChange={set('useful_life_years')} /></Field>
        <Field label={L('Depreciation', 'طريقة الإهلاك')}><Select value={f.dep_method} onChange={set('dep_method')}><option value="straight_line">{L('Straight-line', 'القسط الثابت')}</option><option value="declining">{L('Double declining balance', 'القسط المتناقص المضاعف')}</option></Select></Field>
        <Field label={L('Warranty expiry', 'انتهاء الضمان')}><Input type="date" value={f.warranty_expiry || ''} onChange={set('warranty_expiry')} /></Field>
        <Field label={L('Location', 'الموقع')}><Input value={f.location} onChange={set('location')} /></Field>
      </div>
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}

function AssetDetail({ a, emps, onClose, onChanged, admin }: any) {
  const { L, lang } = usePrefs(); const toast = useToast();
  const [to, setTo] = useState(''); const [assignee, setAssignee] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [edit, setEdit] = useState(false); const [del, setDel] = useState(false);
  const today = riyadhToday();
  const dep = depreciation(a, today);
  const w = warranty(a, today);
  const transition = async () => {
    setErr(''); if (!to) return;
    if (to === 'Assigned' && !assignee) return setErr(L('Choose an employee', 'اختر موظفاً'));
    setBusy(true);
    try { await act('asset.transition', { id: a.id, status: to, assigned_to: assignee || null, note }); toast(L(`Moved to ${to}`, `تم النقل إلى ${to}`)); setTo(''); setNote(''); onChanged(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const idx = STAGES.indexOf(a.status);
  return (
    <Drawer open onClose={onClose} title={a.name} width="max-w-xl" footer={admin && <><Btn variant="soft" icon={Pencil} onClick={() => setEdit(true)}>{L('Edit', 'تعديل')}</Btn><Btn variant="dangerSoft" icon={Trash2} onClick={() => setDel(true)}>{L('Delete', 'حذف')}</Btn></>}>
      <div className="p-4 flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5"><Badge tone="indigo">{a.tag}</Badge><Badge>{a.category}</Badge><Badge tone={STAGE_TONE[a.status]}>{a.status}</Badge><Badge tone={w.tone}>{w.tone === 'mint' ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}{L(w.en, w.ar)}</Badge></div>
        <ol className="flex items-center" aria-label="Lifecycle">
          {STAGES.map((s, i) => (<li key={s} className="flex-1 flex flex-col items-center gap-1 relative">
            {i > 0 && <span className={`absolute top-2.5 end-1/2 w-full h-0.5 ${i <= idx ? 'bg-brand' : 'bg-line'}`} style={{ zIndex: 0 }} />}
            <span className={`relative z-10 w-5 h-5 grid place-items-center text-[0.6rem] font-bold ${i <= idx ? 'bg-brand text-white' : 'bg-sunken text-muted'} ${i === idx ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : ''}`}>{i + 1}</span>
            <span className={`text-[0.6rem] text-center leading-tight ${i === idx ? 'font-semibold' : 'text-muted'}`}>{s}</span>
          </li>))}
        </ol>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {[[L('Assigned to', 'مسلّم إلى'), a.employees?.full_name || '—'], [L('Serial', 'التسلسلي'), a.serial_no], [L('Purchased', 'تاريخ الشراء'), fmtDate(a.purchase_date, lang)], [L('Supplier', 'المورد'), a.supplier], [L('Warranty until', 'الضمان حتى'), fmtDate(a.warranty_expiry, lang)], [L('Location', 'الموقع'), a.location]].map(([k, v]: any) => <div key={k} className="p-2 bg-surface2"><dt className="text-[0.7rem] text-muted">{k}</dt><dd className="font-medium">{v || '—'}</dd></div>)}
        </dl>
        {admin && NEXT[a.status]?.length > 0 && (
          <div className="p-3 bg-brand/8 flex flex-col gap-2">
            <div className="text-sm font-semibold flex items-center gap-1"><ArrowRight size={14} className="rtl:rotate-180" />{L('Move to next stage', 'نقل للمرحلة التالية')}</div>
            <div className="flex flex-wrap gap-1.5">{NEXT[a.status].map((s: string) => <Btn key={s} size="sm" variant={to === s ? 'primary' : 'subtle'} onClick={() => setTo(s)}>{s}</Btn>)}</div>
            {to === 'Assigned' && <Select value={assignee} onChange={(e: any) => setAssignee(e.target.value)} aria-label="Employee"><option value="">{L('Choose employee…', 'اختر موظفاً…')}</option>{emps.map((e: any) => <option key={e.id} value={e.id}>{e.full_name} · {e.department}</option>)}</Select>}
            {to && <Input placeholder={L('Note (optional)', 'ملاحظة (اختياري)')} value={note} onChange={(e: any) => setNote(e.target.value)} />}
            {to && <Btn size="sm" loading={busy} onClick={transition}>{L(`Confirm → ${to}`, `تأكيد ← ${to}`)}</Btn>}
            <ErrorBox error={err} />
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><TrendingDown size={14} className="text-coral" />{L('Depreciation', 'الإهلاك')} · {dep.method === 'declining' ? L('Double declining', 'متناقص مضاعف') : L('Straight-line', 'قسط ثابت')}</h3>
          <div className="grid grid-cols-3 gap-1.5 mb-2"><Stat label={L('Cost', 'التكلفة')} value={money(a.cost)} tone="sky" /><Stat label={L('Accumulated', 'المجمع')} value={money(dep.accumulated)} tone="coral" /><Stat label={L('Book value', 'القيمة الدفترية')} value={money(dep.book)} tone="mint" sub={`${num(dep.age, 1)} ${L('yrs old', 'سنة')}`} /></div>
          <table className="w-full text-xs"><thead><tr className="text-muted bg-surface2"><th className="p-1.5 text-start">{L('Year', 'السنة')}</th><th className="p-1.5 text-end">{L('Opening', 'افتتاحي')}</th><th className="p-1.5 text-end">{L('Depreciation', 'الإهلاك')}</th><th className="p-1.5 text-end">{L('Closing', 'ختامي')}</th></tr></thead>
            <tbody>{dep.rows.map((r) => <tr key={r.year} className={`border-t border-line/50 ${Math.ceil(dep.age) === r.year ? 'bg-amber/10 font-semibold' : ''}`}><td className="p-1.5">{r.year}</td><td className="p-1.5 text-end num">{money(r.open)}</td><td className="p-1.5 text-end num text-coral">{money(r.dep)}</td><td className="p-1.5 text-end num">{money(r.close)}</td></tr>)}</tbody></table>
        </div>
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><History size={14} className="text-violet" />{L('History', 'السجل')}</h3>
          <ol className="border-s-2 border-line ms-1.5">{[...(a.history || [])].reverse().map((h: any, i: number) => <li key={i} className="ps-3 pb-3 relative"><span className={`absolute -start-[5px] top-1 w-2 h-2 ${TONE[STAGE_TONE[h.to] || 'slate']}`} style={{ background: 'currentColor' }} /><div className="text-sm"><b>{h.from ? `${h.from} → ` : ''}{h.to}</b></div><div className="text-xs text-muted">{fmtDate(h.at, lang)} · {h.by}{h.note ? ` · ${h.note}` : ''}</div></li>)}</ol>
        </div>
      </div>
      {edit && <AssetForm initial={a} onClose={() => setEdit(false)} onSaved={onChanged} />}
      <Confirm open={del} onClose={() => setDel(false)} title={L('Delete asset?', 'حذف الأصل؟')} message={L('Consider moving it to Disposed to keep the audit trail.', 'يفضل نقله إلى "تم التخلص" للحفاظ على السجل.')} onConfirm={async () => { await deleteRes('assets', a.id); toast(L('Deleted', 'تم الحذف')); onChanged(); onClose(); }} />
    </Drawer>
  );
}

export default function Assets() {
  const { role } = useAuth(); const { L, lang } = usePrefs(); const toast = useToast();
  const admin = role === 'admin';
  const assets = useData('assets');
  const emps = useData(admin ? 'employees' : null);
  const [q, setQ] = useState(''); const [st, setSt] = useState('all'); const [cat, setCat] = useState('all');
  const [openId, setOpenId] = useState<any>(null); const [form, setForm] = useState(false);
  const [report, setReport] = useState<any>(null); const [rText, setRText] = useState(''); const [rBusy, setRBusy] = useState(false);
  const today = riyadhToday();
  const rows = useMemo(() => assets.data.filter((a: any) => (st === 'all' || a.status === st) && (cat === 'all' || a.category === cat) && (!q || `${a.name} ${a.tag} ${a.serial_no} ${a.employees?.full_name || ''}`.toLowerCase().includes(q.toLowerCase()))), [assets.data, q, st, cat]);
  const open = assets.data.find((a: any) => a.id === openId);
  const cats = [...new Set(assets.data.map((a: any) => a.category))].sort() as string[];
  const totalCost = assets.data.filter((a: any) => a.status !== 'Disposed').reduce((s: number, a: any) => s + Number(a.cost), 0);
  const book = assets.data.filter((a: any) => a.status !== 'Disposed').reduce((s: number, a: any) => s + depreciation(a, today).book, 0);
  const expiring = assets.data.filter((a: any) => { const w = warranty(a, today); return w.days != null && w.days >= 0 && w.days <= 60; }).length;
  return (
    <div>
      <PageHeader title={admin ? L('Asset management', 'إدارة الأصول') : L('My assets', 'عُهدي')} subtitle={L('Lifecycle · depreciation · warranty tracking', 'دورة الحياة · الإهلاك · متابعة الضمان')} icon={Laptop} tone="sky" actions={admin && <Btn icon={Plus} onClick={() => setForm(true)}>{L('Register asset', 'تسجيل أصل')}</Btn>} />
      <ErrorBox error={assets.error} retry={assets.reload} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Stat label={L('Assets', 'الأصول')} value={assets.data.length} tone="sky" sub={L(`${assets.data.filter((a: any) => a.status === 'Assigned').length} assigned`, `${assets.data.filter((a: any) => a.status === 'Assigned').length} مسلمة`)} />
        <Stat label={L('Acquisition cost', 'تكلفة الاقتناء')} value={sar(totalCost, lang, true)} tone="violet" />
        <Stat label={L('Net book value', 'صافي القيمة الدفترية')} value={sar(book, lang, true)} tone="mint" />
        <Stat label={L('Warranty expiring ≤60d', 'ضمان ينتهي خلال 60 يوم')} value={expiring} tone="amber" />
      </div>
      <div className="flex flex-wrap gap-2 bg-surface p-2 mb-3">
        <div className="relative flex-1 min-w-[180px]"><Search size={14} className="absolute start-2.5 top-2.5 text-muted" /><Input className="ps-8" placeholder={L('Search tag, name, serial, holder…', 'بحث…')} value={q} onChange={(e: any) => setQ(e.target.value)} aria-label="Search" /></div>
        <Select className="!w-auto" value={st} onChange={(e: any) => setSt(e.target.value)} aria-label="Stage"><option value="all">{L('All stages', 'كل المراحل')}</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</Select>
        <Select className="!w-auto" value={cat} onChange={(e: any) => setCat(e.target.value)} aria-label="Category"><option value="all">{L('All categories', 'كل الفئات')}</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
      </div>
      <Card pad={false}>
        {assets.loading ? <Spinner /> : <Table rows={rows} onRowClick={(a: any) => setOpenId(a.id)} empty={<Empty icon={Laptop} title={L('No assets', 'لا توجد أصول')} />} columns={[
          { key: 'tag', label: L('Tag', 'الرمز'), render: (a: any) => <span className="text-xs num">{a.tag}</span> },
          { key: 'name', label: L('Asset', 'الأصل'), render: (a: any) => <span><b className="font-medium">{a.name}</b><span className="block text-xs text-muted">{a.category}</span></span> },
          ...(admin ? [{ key: 'who', label: L('Holder', 'المستلم'), render: (a: any) => a.employees?.full_name || <span className="text-muted">—</span> }] : []),
          { key: 'st', label: L('Stage', 'المرحلة'), render: (a: any) => <Badge tone={STAGE_TONE[a.status]}>{a.status}</Badge> },
          { key: 'w', label: L('Warranty', 'الضمان'), render: (a: any) => { const w = warranty(a, today); return <Badge tone={w.tone}>{L(w.en, w.ar)}</Badge>; } },
          { key: 'cost', label: L('Cost', 'التكلفة'), className: 'text-end', render: (a: any) => <span className="num">{money(a.cost)}</span> },
          { key: 'bv', label: L('Book value', 'القيمة الدفترية'), className: 'text-end', render: (a: any) => <b className="num">{money(depreciation(a, today).book)}</b> },
          ...(!admin ? [{ key: 'rep', label: '', render: (a: any) => <Btn size="xs" variant="soft" icon={Wrench} onClick={(e: any) => { e.stopPropagation(); setReport(a); setRText(''); }}>{L('Report issue', 'الإبلاغ عن مشكلة')}</Btn> }] : []),
        ]} />}
      </Card>
      {open && <AssetDetail a={open} emps={emps.data} admin={admin} onClose={() => setOpenId(null)} onChanged={() => assets.reload(true)} />}
      {form && <AssetForm onClose={() => setForm(false)} onSaved={() => assets.reload(true)} />}
      <Modal open={!!report} onClose={() => setReport(null)} title={L(`Report issue · ${report?.name}`, `الإبلاغ عن مشكلة · ${report?.name}`)} footer={<Btn loading={rBusy} onClick={async () => { if (rText.trim().length < 10) { toast(L('Please describe the issue (min 10 characters)', 'يرجى وصف المشكلة'), 'error'); return; } setRBusy(true); try { await act('ticket.create', { subject: `Asset issue: ${report.tag} ${report.name}`, category: 'Assets', priority: 'normal', message: rText, context: 'assets' }); toast(L('Ticket created — IT will contact you', 'تم إنشاء تذكرة')); setReport(null); } catch (e: any) { toast(e.message, 'error'); } finally { setRBusy(false); } }}>{L('Submit ticket', 'إرسال')}</Btn>}>
        <Textarea rows={4} value={rText} onChange={(e: any) => setRText(e.target.value)} placeholder={L('What is wrong with the device?', 'ما المشكلة؟')} aria-label="Issue description" />
      </Modal>
    </div>
  );
}
