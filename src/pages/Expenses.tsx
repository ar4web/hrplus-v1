import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Plus, Upload, Check, X, Paperclip, PiggyBank, AlertTriangle, FileImage } from 'lucide-react';
import { act, uploadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Badge, Field, Input, Select, Textarea, Modal, Tabs, Table, useData, useToast, Spinner, ErrorBox, Empty, PageHeader, Stat, TONE } from '../components/ui';
import { sar, money, fmtDate, riyadhToday } from '../lib/format';
import { deptAr } from '../lib/saudi';

const ST: any = { pending: 'amber', approved: 'mint', rejected: 'coral' };
const DEFAULT_CHAIN = [{ max: 1000, steps: ['Line Manager'] }, { max: 5000, steps: ['Line Manager', 'Finance'] }, { max: null, steps: ['Line Manager', 'Finance', 'CEO'] }];
export function chainPreview(amount: number, cfg: any, cap?: number) {
  const tiers = Array.isArray(cfg) && cfg.length ? cfg : DEFAULT_CHAIN;
  const t = tiers.find((x: any) => x.max == null || x.max === '' || amount <= Number(x.max)) || tiers[tiers.length - 1];
  const s = [...t.steps]; if (cap && amount > cap && !s.includes('CEO')) s.push('CEO'); return s;
}

function Chain({ x }: any) {
  return (
    <ol className="flex items-center gap-0.5 flex-wrap" aria-label="Approval chain">
      {(x.approval_chain || []).map((s: any, i: number) => (
        <li key={i} className="flex items-center gap-0.5">
          <span className={`text-[0.65rem] px-1.5 py-0.5 ${s.status === 'approved' ? TONE.mint : s.status === 'rejected' ? TONE.coral : i === x.current_step && x.status === 'pending' ? TONE.amber : TONE.slate}`} title={s.by ? `${s.by} · ${s.at?.slice(0, 10)}${s.note ? ' · ' + s.note : ''}` : undefined}>
            {s.status === 'approved' ? '✓ ' : s.status === 'rejected' ? '✕ ' : ''}{s.step}
          </span>
          {i < x.approval_chain.length - 1 && <span className="text-muted text-[0.6rem]">›</span>}
        </li>
      ))}
    </ol>
  );
}

function ClaimForm({ open, onClose, cats, onDone }: any) {
  const { L, lang } = usePrefs(); const { me } = useAuth(); const toast = useToast();
  const [f, setF] = useState<any>({ category_id: '', amount: '', expense_date: riyadhToday(), description: '', vat_amount: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cat = cats.find((c: any) => String(c.id) === String(f.category_id)) || cats[0];
  const amt = Number(f.amount) || 0;
  const steps = chainPreview(amt, me?.company?.settings?.expense_chain, Number(cat?.cap_per_claim) || undefined);
  const receiptAbove = Number(me?.company?.settings?.expense?.receipt_required_above ?? 100);
  const submit = async () => {
    setErr('');
    if (!(amt > 0)) return setErr(L('Enter a valid amount', 'أدخل مبلغاً صحيحاً'));
    if (!f.description.trim()) return setErr(L('Description is required', 'الوصف مطلوب'));
    if (f.expense_date > riyadhToday()) return setErr(L('Date cannot be in the future', 'التاريخ لا يمكن أن يكون مستقبلياً'));
    if (amt > receiptAbove && !file) return setErr(L(`Receipt required for claims above SAR ${receiptAbove}`, `الإيصال مطلوب للمبالغ أعلى من ${receiptAbove} ريال`));
    if (file && file.size > 3 * 1024 * 1024) return setErr(L('Receipt must be under 3 MB', 'يجب أن يكون الإيصال أقل من 3 ميجا'));
    setBusy(true);
    try {
      let receipt_path = null;
      if (file) receipt_path = (await uploadFile('receipts', file)).path;
      await act('expense.submit', { ...f, category_id: cat.id, amount: amt, receipt_path });
      toast(L('Expense claim submitted', 'تم إرسال المطالبة')); onDone(); onClose();
      setF({ category_id: '', amount: '', expense_date: riyadhToday(), description: '', vat_amount: '' }); setFile(null);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={L('New expense claim', 'مطالبة مصروفات جديدة')} footer={<><Btn variant="ghost" onClick={onClose}>{L('Cancel', 'إلغاء')}</Btn><Btn loading={busy} onClick={submit} icon={Check}>{L('Submit', 'إرسال')}</Btn></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={L('Category', 'الفئة')} className="col-span-2"><Select value={f.category_id || cat?.id || ''} onChange={(e: any) => setF({ ...f, category_id: e.target.value })}>{cats.map((c: any) => <option key={c.id} value={c.id}>{lang === 'ar' ? c.name_ar : c.name_en} · {L('cap', 'الحد')} {money(c.cap_per_claim)}</option>)}</Select></Field>
        <Field label={L('Amount (SAR, incl. VAT)', 'المبلغ (شامل الضريبة)')}><Input type="number" min="0" step="0.01" value={f.amount} onChange={(e: any) => setF({ ...f, amount: e.target.value, vat_amount: e.target.value ? (Number(e.target.value) * 0.15 / 1.15).toFixed(2) : '' })} /></Field>
        <Field label={L('Date', 'التاريخ')}><Input type="date" max={riyadhToday()} value={f.expense_date} onChange={(e: any) => setF({ ...f, expense_date: e.target.value })} /></Field>
        <Field label={L('Description', 'الوصف')} className="col-span-2"><Textarea rows={2} value={f.description} onChange={(e: any) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="col-span-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} aria-label="Receipt file" />
          <button type="button" onClick={() => inputRef.current?.click()} className="w-full p-4 bg-surface2 ring-1 ring-dashed ring-line hover:bg-brand/5 flex items-center gap-3 text-sm text-start" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const fl = e.dataTransfer.files?.[0]; if (fl) setFile(fl); }}>
            <span className="w-10 h-10 grid place-items-center bg-brand/12 text-brand">{file ? <FileImage size={18} /> : <Upload size={18} />}</span>
            <span className="flex-1">{file ? <><b>{file.name}</b><span className="block text-xs text-muted">{(file.size / 1024).toFixed(0)} KB · {L('click to change', 'انقر للتغيير')}</span></> : <><b>{L('Upload receipt', 'ارفع الإيصال')}</b><span className="block text-xs text-muted">{L(`JPG, PNG, WEBP or PDF up to 3 MB · required above SAR ${receiptAbove}`, `صورة أو PDF حتى 3 ميجا · مطلوب فوق ${receiptAbove} ريال`)}</span></>}</span>
          </button>
        </div>
      </div>
      {amt > 0 && (
        <div className="mt-3 p-3 bg-brand/8 text-sm">
          <div className="text-xs text-muted mb-1">{L('Approval chain for this amount', 'سلسلة الموافقات لهذا المبلغ')}</div>
          <Chain x={{ approval_chain: steps.map((s) => ({ step: s, status: 'pending' })), current_step: 0, status: 'pending' }} />
          {cat?.cap_per_claim && amt > Number(cat.cap_per_claim) && <p className="text-xs text-coral mt-2 flex gap-1"><AlertTriangle size={12} className="mt-0.5" />{L(`Exceeds the ${lang === 'ar' ? cat.name_ar : cat.name_en} policy cap of SAR ${money(cat.cap_per_claim)} — CEO approval added.`, `يتجاوز حد السياسة ${money(cat.cap_per_claim)} — تمت إضافة موافقة الرئيس التنفيذي.`)}</p>}
        </div>
      )}
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}

function Budgets({ cats, exps }: any) {
  const { L, lang } = usePrefs();
  const m = riyadhToday().slice(0, 7);
  return (
    <Card title={L(`Budgets · ${m}`, `الميزانيات · ${m}`)} icon={PiggyBank} tone="mint">
      <ul className="flex flex-col gap-3">
        {cats.map((c: any) => {
          const spent = exps.filter((x: any) => x.category_id === c.id && x.status === 'approved' && x.expense_date.startsWith(m)).reduce((s: number, x: any) => s + Number(x.amount), 0);
          const committed = exps.filter((x: any) => x.category_id === c.id && x.status === 'pending' && x.expense_date.startsWith(m)).reduce((s: number, x: any) => s + Number(x.amount), 0);
          const b = Number(c.monthly_budget) || 1; const p = Math.min(100, (spent / b) * 100), p2 = Math.min(100 - p, (committed / b) * 100);
          return (
            <li key={c.id}>
              <div className="flex justify-between text-sm mb-1"><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5" style={{ background: c.color }} />{lang === 'ar' ? c.name_ar : c.name_en}</span><span className="num text-xs"><b>{money(spent)}</b> / {money(b)}</span></div>
              <div className="h-2.5 bg-ink/8 flex"><span style={{ width: `${p}%`, background: c.color }} /><span style={{ width: `${p2}%`, background: c.color, opacity: 0.35 }} /></div>
              <div className="text-[0.65rem] text-muted mt-0.5 flex justify-between"><span>{committed > 0 ? L(`+${money(committed)} pending`, `+${money(committed)} معلق`) : ''}</span><span className={spent > b ? 'text-coral font-semibold' : ''}>{spent > b ? L('Over budget', 'تجاوز الميزانية') : L(`${money(b - spent)} left`, `متبقي ${money(b - spent)}`)}</span></div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function Expenses() {
  const { role } = useAuth(); const { L, lang } = usePrefs(); const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const isAdmin = role === 'admin';
  const tab = sp.get('tab') || (isAdmin ? 'queue' : 'mine');
  const exps = useData('expenses');
  const cats = useData('expense_categories');
  const [open, setOpen] = useState(sp.get('new') === '1');
  const [deciding, setDeciding] = useState<any>(null);
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(''); const [derr, setDerr] = useState('');
  const { me } = useAuth();
  const mine = exps.data.filter((x: any) => x.employee_id === me?.employee?.id);
  const queue = exps.data.filter((x: any) => x.status === 'pending');
  const list = tab === 'queue' ? queue : tab === 'all' ? exps.data : mine;
  const decide = async (decision: string) => { setBusy(decision); setDerr(''); try { await act('expense.decide', { id: deciding.id, decision, note }); toast(decision === 'approve' ? L('Step approved', 'تمت الموافقة') : L('Claim rejected', 'تم الرفض')); setDeciding(null); setNote(''); exps.reload(true); } catch (e: any) { setDerr(e.message); } finally { setBusy(''); } };
  const y = riyadhToday().slice(0, 4);
  const base = isAdmin && tab !== 'mine' ? exps.data : mine;
  return (
    <div>
      <PageHeader title={L('Expenses', 'المصروفات')} subtitle={L('Approval chain scales with amount · policy caps per category · monthly budgets', 'سلسلة موافقات حسب المبلغ · حدود لكل فئة · ميزانيات شهرية')} icon={CreditCard} tone="rose" actions={me?.employee && <Btn icon={Plus} onClick={() => setOpen(true)}>{L('New claim', 'مطالبة جديدة')}</Btn>} />
      <ErrorBox error={exps.error} retry={exps.reload} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Stat label={L('Pending', 'معلقة')} value={base.filter((x: any) => x.status === 'pending').length} tone="amber" sub={sar(base.filter((x: any) => x.status === 'pending').reduce((s: number, x: any) => s + Number(x.amount), 0), lang, true)} />
        <Stat label={L(`Approved ${y}`, `المعتمد ${y}`)} value={sar(base.filter((x: any) => x.status === 'approved' && x.expense_date.startsWith(y)).reduce((s: number, x: any) => s + Number(x.amount), 0), lang, true)} tone="mint" />
        <Stat label={L('Rejected', 'مرفوضة')} value={base.filter((x: any) => x.status === 'rejected').length} tone="coral" />
        <Stat label={L('Over policy cap', 'تجاوز الحد')} value={base.filter((x: any) => x.over_cap).length} tone="violet" />
      </div>
      <Tabs className="mb-2" value={tab} onChange={(t: string) => setSp({ tab: t })} tabs={[isAdmin && { value: 'queue', label: L('Approval queue', 'قائمة الموافقات'), count: queue.length }, isAdmin && { value: 'all', label: L('All claims', 'كل المطالبات') }, me?.employee && { value: 'mine', label: L('My claims', 'مطالباتي') }, { value: 'budgets', label: L('Budgets', 'الميزانيات') }]} />
      {tab === 'budgets' ? (cats.loading ? <Spinner /> : <Budgets cats={cats.data} exps={exps.data} />) : (
        <Card pad={false}>
          {exps.loading ? <Spinner /> : <Table rows={list} empty={<Empty icon={CreditCard} title={tab === 'queue' ? L('Queue is clear', 'لا توجد طلبات') : L('No claims', 'لا توجد مطالبات')} />} columns={[
            ...(tab !== 'mine' ? [{ key: 'e', label: L('Employee', 'الموظف'), render: (x: any) => <span><b className="font-medium">{x.employees?.full_name}</b><span className="block text-xs text-muted">{L(x.employees?.department, deptAr(x.employees?.department))}</span></span> }] : []),
            { key: 'c', label: L('Category', 'الفئة'), render: (x: any) => <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2" style={{ background: x.expense_categories?.color }} />{lang === 'ar' ? x.expense_categories?.name_ar : x.expense_categories?.name_en}</span> },
            { key: 'd', label: L('Description', 'الوصف'), render: (x: any) => <span className="text-sm">{x.description}<span className="block text-xs text-muted num">{fmtDate(x.expense_date, lang)}</span></span> },
            { key: 'a', label: L('Amount', 'المبلغ'), className: 'text-end', render: (x: any) => <span><b className="num">{money(x.amount)}</b>{x.over_cap && <Badge tone="coral" className="ms-1">{L('over cap', 'فوق الحد')}</Badge>}</span> },
            { key: 'r', label: L('Receipt', 'الإيصال'), render: (x: any) => x.receipt_url ? <a href={x.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand text-xs hover:underline" onClick={(e) => e.stopPropagation()}><Paperclip size={12} />{L('View', 'عرض')}</a> : <span className="text-xs text-muted">—</span> },
            { key: 'ch', label: L('Approval chain', 'سلسلة الموافقات'), render: (x: any) => <Chain x={x} /> },
            { key: 's', label: L('Status', 'الحالة'), render: (x: any) => <Badge tone={ST[x.status]}>{x.status}</Badge> },
            ...(isAdmin ? [{ key: 'act', label: '', render: (x: any) => x.status === 'pending' ? <Btn size="xs" variant="soft" onClick={() => { setDeciding(x); setNote(''); setDerr(''); }}>{L(`Review · ${x.approval_chain?.[x.current_step]?.step}`, 'مراجعة')}</Btn> : null }] : []),
          ]} />}
        </Card>
      )}
      <ClaimForm open={open} onClose={() => { setOpen(false); if (sp.get('new')) setSp({}); }} cats={cats.data} onDone={() => exps.reload(true)} />
      <Modal open={!!deciding} onClose={() => setDeciding(null)} title={L(`Approve as ${deciding?.approval_chain?.[deciding?.current_step]?.step}`, 'مراجعة المطالبة')} footer={<><Btn variant="dangerSoft" icon={X} loading={busy === 'reject'} onClick={() => decide('reject')}>{L('Reject', 'رفض')}</Btn><Btn variant="success" icon={Check} loading={busy === 'approve'} onClick={() => decide('approve')}>{L('Approve step', 'موافقة')}</Btn></>}>
        {deciding && <div className="text-sm flex flex-col gap-2 mb-3"><div><b>{deciding.employees?.full_name}</b> · {sar(deciding.amount, lang)}</div><div className="text-muted">{deciding.description}</div><Chain x={deciding} />{deciding.receipt_url && <a href={deciding.receipt_url} target="_blank" rel="noreferrer" className="text-brand text-xs inline-flex items-center gap-1"><Paperclip size={12} />{L('Open receipt', 'فتح الإيصال')}</a>}</div>}
        <Field label={L('Comment (required to reject)', 'ملاحظة (مطلوبة للرفض)')}><Textarea rows={2} value={note} onChange={(e: any) => setNote(e.target.value)} /></Field>
        <div className="mt-2"><ErrorBox error={derr} /></div>
      </Modal>
    </div>
  );
}
