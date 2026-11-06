import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, Search, Plus, Pencil, Trash2, LayoutGrid, List, IdCard, Wallet, Calculator, AlertTriangle, Mail, Phone, MapPin, Building2, CalendarDays, Landmark } from 'lucide-react';
import { createRes, updateRes, deleteRes } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Badge, Field, Input, Select, Modal, Drawer, Tabs, Table, useData, useToast, Spinner, ErrorBox, Empty, PageHeader, Confirm, Avatar, Segmented, Stat, TONE } from '../components/ui';
import { riyadhToday, fmtDate, sar, money, num } from '../lib/format';
import { gosiCalc, iqamaStatus, eosb, eosbWage, yearsBetween, monthlyGross, IQAMA_FEES, deptAr, natEn, natAr } from '../lib/saudi';

const NATS = ['Saudi Citizen', 'Expat - Egyptian', 'Expat - Indian', 'Expat - Filipino', 'Expat - Pakistani', 'Expat - Jordanian', 'Expat - Sudanese', 'Expat - Syrian', 'Expat - US', 'Expat - UK', 'Expat - Canadian'];
const DEPTS = ['Engineering', 'Sales', 'Marketing', 'Finance', 'Human Resources', 'Operations', 'Customer Support', 'Product'];
const EMPTY = { full_name: '', full_name_ar: '', email: '', phone: '', gender: 'Male', age: '', department: 'Engineering', job_title: '', location: 'Riyadh', hire_date: riyadhToday(), employment_type: 'Full-time', status: 'Active', nationality: 'Saudi Citizen', iqama_number: '', iqama_expiry: '', basic_salary: '', housing_allowance: '', transport_allowance: '', other_allowance: '0', bank_code: 'RJHI', iban: '', primary_client: '' };

function validate(f: any, L: any) {
  const e: any = {};
  if ((f.full_name || '').trim().length < 3) e.full_name = L('Full name is required', 'الاسم مطلوب');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email || '')) e.email = L('Valid email required', 'بريد غير صالح');
  if (!f.job_title?.trim()) e.job_title = L('Job title is required', 'المسمى مطلوب');
  if (!f.hire_date) e.hire_date = L('Hire date is required', 'تاريخ التعيين مطلوب');
  const saudi = f.nationality === 'Saudi Citizen';
  if (!/^\d{10}$/.test(f.iqama_number || '')) e.iqama_number = L('10-digit ID / Iqama number', 'رقم من 10 خانات');
  else if (saudi && !f.iqama_number.startsWith('1')) e.iqama_number = L('Saudi National ID starts with 1', 'الهوية الوطنية تبدأ بـ 1');
  else if (!saudi && !f.iqama_number.startsWith('2')) e.iqama_number = L('Iqama number starts with 2', 'رقم الإقامة يبدأ بـ 2');
  if (!saudi && !f.iqama_expiry) e.iqama_expiry = L('Iqama expiry is required for expats', 'تاريخ انتهاء الإقامة مطلوب');
  if (!(Number(f.basic_salary) > 0)) e.basic_salary = L('Basic salary must be > 0', 'الراتب الأساسي مطلوب');
  for (const k of ['housing_allowance', 'transport_allowance', 'other_allowance']) if (f[k] !== '' && Number(f[k]) < 0) e[k] = L('Cannot be negative', 'لا يمكن أن يكون سالباً');
  if (f.iban && !/^SA\d{22}$/.test(String(f.iban).replace(/\s/g, ''))) e.iban = L('Saudi IBAN: SA + 22 digits', 'آيبان سعودي: SA + 22 رقماً');
  if (f.phone && !/^\+?\d{9,15}$/.test(String(f.phone).replace(/[\s-]/g, ''))) e.phone = L('Invalid phone', 'رقم غير صالح');
  return e;
}

function EmployeeForm({ open, initial, onClose, onSaved }: any) {
  const { L } = usePrefs(); const toast = useToast();
  const [f, setF] = useState<any>(initial || EMPTY);
  const [errs, setErrs] = useState<any>({}); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const v = validate(f, L); setErrs(v); if (Object.keys(v).length) return;
    setBusy(true); setErr('');
    try {
      const payload = { ...f, iban: f.iban ? String(f.iban).replace(/\s/g, '') : null, iqama_expiry: f.iqama_expiry || null, age: f.age === '' ? null : f.age };
      delete payload.employees;
      if (initial?.id) await updateRes('employees', initial.id, payload); else await createRes('employees', payload);
      toast(initial?.id ? L('Employee updated', 'تم تحديث الموظف') : L('Employee added', 'تمت إضافة الموظف'));
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const F = ({ k, label, type = 'text', ...p }: any) => <Field label={label} error={errs[k]} htmlFor={`f-${k}`}><Input id={`f-${k}`} type={type} value={f[k] ?? ''} onChange={set(k)} {...p} /></Field>;
  const pv = gosiCalc({ ...f, is_saudi: f.nationality === 'Saudi Citizen' });
  return (
    <Modal open={open} onClose={onClose} wide title={initial?.id ? L(`Edit ${initial.full_name}`, `تعديل ${initial.full_name}`) : L('Add employee', 'إضافة موظف')} footer={<><Btn variant="ghost" onClick={onClose}>{L('Cancel', 'إلغاء')}</Btn><Btn loading={busy} onClick={save}>{L('Save', 'حفظ')}</Btn></>}>
      <h3 className="text-xs uppercase tracking-wider text-muted mb-2">{L('Personal', 'البيانات الشخصية')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {F({ k: 'full_name', label: L('Full name (EN)', 'الاسم (إنجليزي)') })}
        {F({ k: 'full_name_ar', label: L('Full name (AR)', 'الاسم (عربي)'), dir: 'rtl' })}
        <Field label={L('Gender', 'الجنس')}><Select value={f.gender} onChange={set('gender')}><option>Male</option><option>Female</option></Select></Field>
        {F({ k: 'email', label: L('Work email', 'البريد'), type: 'email', dir: 'ltr' })}
        {F({ k: 'phone', label: L('Mobile', 'الجوال'), dir: 'ltr', placeholder: '+9665XXXXXXXX' })}
        {F({ k: 'age', label: L('Age', 'العمر'), type: 'number', min: 16, max: 80 })}
        <Field label={L('Nationality', 'الجنسية')}><Select value={f.nationality} onChange={set('nationality')}>{NATS.map((n) => <option key={n}>{n}</option>)}</Select></Field>
        {F({ k: 'iqama_number', label: f.nationality === 'Saudi Citizen' ? L('National ID', 'الهوية الوطنية') : L('Iqama number', 'رقم الإقامة'), dir: 'ltr', maxLength: 10 })}
        {f.nationality !== 'Saudi Citizen' && F({ k: 'iqama_expiry', label: L('Iqama expiry', 'انتهاء الإقامة'), type: 'date' })}
      </div>
      <h3 className="text-xs uppercase tracking-wider text-muted mt-4 mb-2">{L('Employment', 'الوظيفة')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label={L('Department', 'الإدارة')}><Select value={f.department} onChange={set('department')}>{DEPTS.map((d) => <option key={d}>{d}</option>)}</Select></Field>
        {F({ k: 'job_title', label: L('Job title', 'المسمى الوظيفي') })}
        {F({ k: 'hire_date', label: L('Hire date', 'تاريخ التعيين'), type: 'date' })}
        <Field label={L('Type', 'نوع التوظيف')}><Select value={f.employment_type} onChange={set('employment_type')}>{['Full-time', 'Part-time', 'Contract'].map((d) => <option key={d}>{d}</option>)}</Select></Field>
        <Field label={L('Status', 'الحالة')}><Select value={f.status} onChange={set('status')}>{['Active', 'On Leave', 'Terminated'].map((d) => <option key={d}>{d}</option>)}</Select></Field>
        {F({ k: 'location', label: L('Work location', 'موقع العمل'), hint: 'Remote = geofence exempt' })}
      </div>
      <h3 className="text-xs uppercase tracking-wider text-muted mt-4 mb-2">{L('Compensation (SAR / month) & WPS', 'الراتب (شهرياً) وحماية الأجور')}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {F({ k: 'basic_salary', label: L('Basic', 'الأساسي'), type: 'number', min: 0 })}
        {F({ k: 'housing_allowance', label: L('Housing', 'السكن'), type: 'number', min: 0 })}
        {F({ k: 'transport_allowance', label: L('Transport', 'النقل'), type: 'number', min: 0 })}
        {F({ k: 'other_allowance', label: L('Other', 'أخرى'), type: 'number', min: 0 })}
        <Field label={L('Bank', 'البنك')}><Select value={f.bank_code} onChange={set('bank_code')}>{['RJHI', 'SNBC', 'SABB', 'RIBL', 'ALBI', 'ARNB', 'BSFR', 'INMA'].map((b) => <option key={b}>{b}</option>)}</Select></Field>
        <div className="col-span-2 sm:col-span-3">{F({ k: 'iban', label: 'IBAN', dir: 'ltr', placeholder: 'SA0000000000000000000000' })}</div>
      </div>
      <div className="mt-3 p-2.5 bg-amber/10 text-xs flex flex-wrap gap-x-4 gap-y-1">
        <span>{L('Gross', 'الإجمالي')}: <b className="num">{sar(monthlyGross(f))}</b></span>
        <span>GOSI {L('base', 'الأساس')}: <b className="num">{sar(pv.base)}</b>{pv.capped && <Badge tone="amber">{L('capped 45K', 'سقف 45 ألف')}</Badge>}</span>
        <span>{L('Employee', 'الموظف')}: <b className="num">{sar(pv.employee)}</b></span>
        <span>{L('Employer', 'صاحب العمل')}: <b className="num">{sar(pv.employer)}</b></span>
      </div>
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}

export function ProfileView({ e, onEdit, onDelete }: any) {
  const { L, lang } = usePrefs();
  const { me } = useAuth();
  const [tab, setTab] = useState('overview');
  const today = riyadhToday();
  const iq = iqamaStatus(e, today);
  const g = gosiCalc(e, me?.company?.settings?.gosi);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState<'termination' | 'resignation'>('termination');
  const [wage, setWage] = useState(eosbWage(e));
  const yrs = yearsBetween(e.hire_date, endDate);
  const eb = eosb(Number(wage) || 0, yrs, reason);
  const assets = useData('assets', { f: { assigned_to: e.id } });
  const info = [[Mail, L('Email', 'البريد'), e.email], [Phone, L('Mobile', 'الجوال'), e.phone], [Building2, L('Department', 'الإدارة'), L(e.department, deptAr(e.department))], [MapPin, L('Location', 'الموقع'), e.location], [CalendarDays, L('Hired', 'تاريخ التعيين'), `${fmtDate(e.hire_date, lang)} (${num(yearsBetween(e.hire_date, today), 1)} ${L('yrs', 'سنة')})`], [IdCard, e.is_saudi ? L('National ID', 'الهوية') : L('Iqama', 'الإقامة'), e.iqama_number], [Landmark, 'IBAN', `${e.bank_code || ''} ${e.iban || '—'}`], [Users, L('Primary client', 'العميل الرئيسي'), e.primary_client || '—']];
  return (
    <div>
      <div className="p-4 bg-gradient-to-br from-violet/15 to-sky/10 flex items-center gap-3">
        <Avatar name={e.full_name} size={60} />
        <div className="flex-1 min-w-0">
          <div className="font-display text-lg font-semibold">{e.full_name}</div>
          {e.full_name_ar && <div className="text-sm text-muted" dir="rtl">{e.full_name_ar}</div>}
          <div className="text-sm">{e.job_title} · <span className="text-muted">{e.id}</span></div>
          <div className="flex flex-wrap gap-1 mt-1"><Badge tone={e.is_saudi ? 'mint' : 'sky'}>{e.is_saudi ? L('Saudi', 'سعودي') : `${L('Expat', 'وافد')} · ${L(natEn(e.nationality), natAr(e.nationality))}`}</Badge><Badge tone={e.status === 'Active' ? 'brand' : e.status === 'On Leave' ? 'violet' : 'coral'}>{e.status}</Badge><Badge>{e.employment_type}</Badge>{!e.is_saudi && <Badge tone={iq.tone}>{L(iq.en, iq.ar)}</Badge>}</div>
        </div>
        {onEdit && <div className="flex flex-col gap-1"><Btn size="sm" variant="soft" icon={Pencil} onClick={onEdit}>{L('Edit', 'تعديل')}</Btn><Btn size="sm" variant="dangerSoft" icon={Trash2} onClick={onDelete}>{L('Delete', 'حذف')}</Btn></div>}
      </div>
      <Tabs className="px-2 bg-surface2" value={tab} onChange={setTab} tabs={[{ value: 'overview', label: L('Overview', 'نظرة عامة'), icon: IdCard }, { value: 'pay', label: L('Pay & GOSI', 'الراتب والتأمينات'), icon: Wallet }, !e.is_saudi && { value: 'iqama', label: L('Iqama', 'الإقامة'), icon: AlertTriangle }, { value: 'eosb', label: L('EOSB', 'مكافأة النهاية'), icon: Calculator }]} />
      <div className="p-4">
        {tab === 'overview' && (
          <>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">{info.map(([I, l, v]: any, i) => <div key={i} className="flex gap-2 p-2 bg-surface2"><I size={14} className="text-violet mt-0.5 shrink-0" /><div className="min-w-0"><dt className="text-[0.7rem] text-muted">{l}</dt><dd className="text-sm font-medium break-all" dir="auto">{v || '—'}</dd></div></div>)}</dl>
            <h4 className="text-xs uppercase tracking-wider text-muted mt-4 mb-1">{L('Assets in custody', 'العهد')}</h4>
            {assets.loading ? <Spinner /> : assets.data.length ? <ul className="text-sm">{assets.data.map((a: any) => <li key={a.id} className="flex justify-between py-1 border-b border-line/50"><span>{a.name}</span><span className="text-muted text-xs">{a.tag}</span></li>)}</ul> : <p className="text-sm text-muted">{L('None', 'لا يوجد')}</p>}
          </>
        )}
        {tab === 'pay' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-1.5">
              <Stat label={L('Basic', 'الأساسي')} value={sar(e.basic_salary, lang)} tone="brand" /><Stat label={L('Housing', 'السكن')} value={sar(e.housing_allowance, lang)} tone="sky" />
              <Stat label={L('Transport', 'النقل')} value={sar(e.transport_allowance, lang)} tone="violet" /><Stat label={L('Other', 'أخرى')} value={sar(e.other_allowance, lang)} tone="amber" />
            </div>
            <div className="p-3 bg-brand text-white flex justify-between"><span>{L('Monthly gross', 'الإجمالي الشهري')}</span><b className="num">{sar(monthlyGross(e), lang)}</b></div>
            <div className="p-3 bg-surface2 text-sm">
              <div className="font-semibold mb-1">GOSI · {e.is_saudi ? L('Saudi rates', 'نسب السعوديين') : L('Expat rate', 'نسبة الوافدين')}</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><div className="text-muted">{L('Contribution base', 'الأجر الخاضع')}</div><b className="num">{sar(g.base, lang)}</b>{g.capped && <div className="text-amber">{L('capped at 45,000', 'الحد 45,000')}</div>}</div>
                <div><div className="text-muted">{L('Employee', 'الموظف')} ({(g.rates[0] * 100).toFixed(2)}%)</div><b className="num">{sar(g.employee, lang)}</b></div>
                <div><div className="text-muted">{L('Employer', 'صاحب العمل')} ({(g.rates[1] * 100).toFixed(2)}%)</div><b className="num">{sar(g.employer, lang)}</b></div>
              </div>
              <p className="text-[0.7rem] text-muted mt-2">{e.is_saudi ? L('Annuities 9% + 9%, SANED 0.75% + 0.75%, occupational hazards 2% (employer).', 'المعاشات 9% + 9%، ساند 0.75% + 0.75%، الأخطار المهنية 2% (صاحب العمل).') : L('Non-Saudis: occupational hazards 2% paid by employer only.', 'غير السعوديين: الأخطار المهنية 2% على صاحب العمل فقط.')}</p>
            </div>
          </div>
        )}
        {tab === 'iqama' && (
          <div className="flex flex-col gap-3">
            <div className={`p-4 ${TONE[iq.tone]}`}><div className="text-xs">{L('Iqama', 'الإقامة')} {e.iqama_number}</div><div className="font-display text-2xl font-semibold num">{iq.days != null ? (iq.days < 0 ? L(`Expired ${-iq.days} days ago`, `منتهية منذ ${-iq.days} يوم`) : L(`${iq.days} days left`, `متبقي ${iq.days} يوم`)) : '—'}</div><div className="text-sm">{L('Expires', 'تنتهي')} {fmtDate(e.iqama_expiry, lang)} · {L('Renewal status', 'حالة التجديد')}: {e.iqama_renewal_status || '—'}</div></div>
            <table className="text-sm w-full"><tbody>{[[L('Jawazat renewal fee', 'رسوم الجوازات'), IQAMA_FEES.gov], [L('Work permit (Maktab Amal)', 'رخصة العمل'), IQAMA_FEES.work_permit], [L('Medical insurance & admin', 'التأمين الطبي'), IQAMA_FEES.insurance]].map(([l, v]: any) => <tr key={l} className="border-b border-line/50"><td className="py-1.5">{l}</td><td className="text-end num">{sar(v, lang)}</td></tr>)}<tr className="font-semibold"><td className="py-1.5">{L('Total (employer, Art. 40)', 'الإجمالي (صاحب العمل)')}</td><td className="text-end num">{sar(IQAMA_FEES.gov + IQAMA_FEES.work_permit + IQAMA_FEES.insurance, lang)}</td></tr></tbody></table>
          </div>
        )}
        {tab === 'eosb' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Field label={L('Last working day', 'آخر يوم عمل')}><Input type="date" value={endDate} min={e.hire_date} onChange={(ev: any) => setEndDate(ev.target.value)} /></Field>
              <Field label={L('Reason', 'السبب')}><Select value={reason} onChange={(ev: any) => setReason(ev.target.value)}><option value="termination">{L('Termination / contract end (Art. 84)', 'إنهاء / انتهاء عقد (م 84)')}</option><option value="resignation">{L('Resignation (Art. 85)', 'استقالة (م 85)')}</option></Select></Field>
              <Field label={L('Wage basis (SAR)', 'الأجر المعتمد')} hint={L('basic + housing + transport', 'أساسي + سكن + نقل')}><Input type="number" value={wage} onChange={(ev: any) => setWage(ev.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <Stat label={L('Service', 'مدة الخدمة')} value={`${num(yrs, 2)} ${L('yrs', 'سنة')}`} tone="sky" />
              <Stat label={L('First 5 yrs (½ month)', 'أول 5 سنوات')} value={sar(eb.first, lang)} tone="violet" />
              <Stat label={L('After 5 yrs (1 month)', 'بعد 5 سنوات')} value={sar(eb.rest, lang)} tone="amber" />
              <Stat label={L('Payable factor', 'نسبة الاستحقاق')} value={`${Math.round(eb.factor * 100)}%`} tone="coral" />
            </div>
            <div className="p-4 bg-mint text-white flex justify-between items-center"><span>{L('End-of-service award', 'مكافأة نهاية الخدمة')}</span><b className="font-display text-2xl num">{sar(eb.payable, lang)}</b></div>
          </div>
        )}
      </div>
    </div>
  );
}

function IqamaTracker({ emps, onOpen }: any) {
  const { L, lang } = usePrefs();
  const today = riyadhToday();
  const [filter, setFilter] = useState('attention');
  const rows = emps.filter((e: any) => !e.is_saudi && e.status !== 'Terminated').map((e: any) => ({ ...e, iq: iqamaStatus(e, today) })).sort((a: any, b: any) => a.iq.days - b.iq.days);
  const shown = rows.filter((r: any) => filter === 'all' || (filter === 'attention' ? r.iq.days <= 60 : r.iq.key === filter));
  const c = (k: string) => rows.filter((r: any) => r.iq.key === k).length;
  const total = IQAMA_FEES.gov + IQAMA_FEES.work_permit + IQAMA_FEES.insurance;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Stat label={L('Expats tracked', 'الوافدون')} value={rows.length} tone="sky" />
        <Stat label={L('Expired', 'منتهية')} value={c('expired')} tone="rose" />
        <Stat label={L('Critical (<30d)', 'حرجة')} value={c('critical')} tone="coral" />
        <Stat label={L('Warning (30–60d)', 'تحذير')} value={c('warning')} tone="amber" />
        <Stat label={L('Renewal cost (next 60d)', 'تكلفة التجديد (60 يوم)')} value={sar((c('expired') + c('critical') + c('warning')) * total, lang, true)} tone="violet" />
      </div>
      <Card title={L('Iqama tracker', 'متابعة الإقامات')} icon={AlertTriangle} tone="amber" pad={false} actions={<Segmented value={filter} onChange={setFilter} options={[{ value: 'attention', label: L('Needs action', 'تحتاج إجراء') }, { value: 'expired', label: L('Expired', 'منتهية') }, { value: 'valid', label: L('Valid', 'سارية') }, { value: 'all', label: L('All', 'الكل') }]} />}>
        <Table rows={shown} onRowClick={onOpen} columns={[
          { key: 'n', label: L('Employee', 'الموظف'), render: (r: any) => <span><b className="font-medium">{r.full_name}</b><span className="block text-xs text-muted">{r.id} · {L(natEn(r.nationality), natAr(r.nationality))}</span></span> },
          { key: 'iq', label: L('Iqama no.', 'رقم الإقامة'), render: (r: any) => <span className="num text-xs">{r.iqama_number}</span> },
          { key: 'exp', label: L('Expiry', 'الانتهاء'), render: (r: any) => <span className="num text-xs">{fmtDate(r.iqama_expiry, lang)}</span> },
          { key: 'days', label: L('Days', 'الأيام'), render: (r: any) => <b className={`num ${r.iq.days < 0 ? 'text-rose' : r.iq.days <= 30 ? 'text-coral' : r.iq.days <= 60 ? 'text-amber' : ''}`}>{r.iq.days}</b> },
          { key: 'st', label: L('Status', 'الحالة'), render: (r: any) => <Badge tone={r.iq.tone}>{L(r.iq.en, r.iq.ar)}</Badge> },
          { key: 'ac', label: L('HR action', 'الإجراء'), render: (r: any) => <span className="text-xs">{r.iq.key === 'expired' ? L('Immediate renewal', 'تجديد فوري') : r.iq.key === 'critical' ? L('Process renewal', 'بدء التجديد') : r.iq.key === 'warning' ? L('Prepare documents', 'تجهيز المستندات') : L('None', 'لا يوجد')}</span> },
          { key: 'rs', label: L('Renewal', 'التجديد'), render: (r: any) => <span className="text-xs text-muted">{r.iqama_renewal_status || '—'}</span> },
        ]} empty={<Empty title={L('Nothing to show', 'لا يوجد شيء')} />} />
      </Card>
    </div>
  );
}

export default function Directory() {
  const { me, role } = useAuth();
  const { L, lang } = usePrefs();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'people';
  const emps = useData('employees');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const [nat, setNat] = useState('all');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [view, setView] = useState('grid');
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const today = riyadhToday();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return emps.data.filter((e: any) => (!s || [e.full_name, e.full_name_ar, e.id, e.job_title, e.email, e.iqama_number].join(' ').toLowerCase().includes(s)) && (dept === 'all' || e.department === dept) && (nat === 'all' || (nat === 'saudi' ? e.is_saudi : !e.is_saudi)) && (status === 'all' || e.status === status) && (type === 'all' || e.employment_type === type));
  }, [emps.data, q, dept, nat, status, type]);
  const open = emps.data.find((e: any) => e.id === openId);

  if (role !== 'admin') {
    if (emps.loading) return <Spinner />;
    const e = emps.data[0];
    if (!e) return <Empty icon={Users} title={L('No employee record linked to your account', 'لا يوجد سجل موظف مرتبط بحسابك')} />;
    return (<div><PageHeader title={L('My profile', 'ملفي الشخصي')} subtitle={L('Your HR record. Contact HR via Support to request changes.', 'سجلك الوظيفي. تواصل مع الموارد البشرية لطلب التعديل.')} icon={IdCard} tone="violet" /><div className="bg-surface max-w-3xl"><ProfileView e={e} /></div></div>);
  }

  return (
    <div>
      <PageHeader title={L('Employee directory', 'دليل الموظفين')} subtitle={L(`${emps.data.length} people · ${emps.data.filter((e: any) => e.is_saudi).length} Saudi nationals`, `${emps.data.length} موظف · ${emps.data.filter((e: any) => e.is_saudi).length} سعودي`)} icon={Users} tone="violet" actions={<Btn icon={Plus} onClick={() => setForm({})}>{L('Add employee', 'إضافة موظف')}</Btn>} />
      <Tabs className="mb-3" value={tab} onChange={(t: string) => setSp({ tab: t })} tabs={[{ value: 'people', label: L('People', 'الموظفون') }, { value: 'iqama', label: L('Iqama tracker', 'متابعة الإقامات'), count: emps.data.filter((e: any) => !e.is_saudi && iqamaStatus(e, today).days <= 30).length }]} />
      <ErrorBox error={emps.error} retry={emps.reload} />
      {tab === 'iqama' ? <IqamaTracker emps={emps.data} onOpen={(r: any) => setOpenId(r.id)} /> : (
        <>
          <div className="flex flex-wrap gap-2 bg-surface p-2 mb-3">
            <div className="relative flex-1 min-w-[200px]"><Search size={14} className="absolute start-2.5 top-2.5 text-muted" /><Input className="ps-8" placeholder={L('Search name, ID, Iqama, title…', 'ابحث بالاسم أو الرقم أو المسمى…')} value={q} onChange={(e: any) => setQ(e.target.value)} aria-label="Search" /></div>
            <Select className="!w-auto" value={dept} onChange={(e: any) => setDept(e.target.value)} aria-label="Department"><option value="all">{L('All departments', 'كل الإدارات')}</option>{DEPTS.map((d) => <option key={d} value={d}>{L(d, deptAr(d))}</option>)}</Select>
            <Select className="!w-auto" value={nat} onChange={(e: any) => setNat(e.target.value)} aria-label="Nationality"><option value="all">{L('Saudi & expat', 'الكل')}</option><option value="saudi">{L('Saudi', 'سعودي')}</option><option value="expat">{L('Expat', 'وافد')}</option></Select>
            <Select className="!w-auto" value={status} onChange={(e: any) => setStatus(e.target.value)} aria-label="Status"><option value="all">{L('Any status', 'كل الحالات')}</option>{['Active', 'On Leave', 'Terminated'].map((s) => <option key={s}>{s}</option>)}</Select>
            <Select className="!w-auto" value={type} onChange={(e: any) => setType(e.target.value)} aria-label="Type"><option value="all">{L('Any type', 'كل الأنواع')}</option>{['Full-time', 'Part-time', 'Contract'].map((s) => <option key={s}>{s}</option>)}</Select>
            <Segmented value={view} onChange={setView} label="View" options={[{ value: 'grid', label: '', icon: LayoutGrid }, { value: 'table', label: '', icon: List }]} />
          </div>
          {emps.loading ? <Spinner /> : !list.length ? <div className="bg-surface"><Empty icon={Search} title={L('No matches', 'لا توجد نتائج')} hint={L('Try clearing filters', 'جرّب مسح الفلاتر')} /></div> : view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2">
              {list.map((e: any) => { const iq = iqamaStatus(e, today); return (
                <button key={e.id} onClick={() => setOpenId(e.id)} className="bg-surface p-3 flex gap-3 text-start hover:bg-violet/5 transition">
                  <Avatar name={e.full_name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{lang === 'ar' && e.full_name_ar ? e.full_name_ar : e.full_name}</div>
                    <div className="text-xs text-muted truncate">{e.job_title} · {L(e.department, deptAr(e.department))}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5"><Badge tone={e.is_saudi ? 'mint' : 'sky'}>{e.is_saudi ? L('Saudi', 'سعودي') : L(natEn(e.nationality), natAr(e.nationality))}</Badge>{e.status !== 'Active' && <Badge tone={e.status === 'On Leave' ? 'violet' : 'coral'}>{e.status}</Badge>}{!e.is_saudi && iq.days <= 60 && <Badge tone={iq.tone}><AlertTriangle size={10} />{iq.days}d</Badge>}</div>
                  </div>
                  <span className="text-[0.65rem] text-muted">{e.id}</span>
                </button>
              ); })}
            </div>
          ) : (
            <Card pad={false}><Table rows={list} onRowClick={(r: any) => setOpenId(r.id)} columns={[
              { key: 'id', label: 'ID', render: (r: any) => <span className="text-xs num">{r.id}</span> },
              { key: 'full_name', label: L('Name', 'الاسم'), render: (r: any) => <span className="flex items-center gap-2"><Avatar name={r.full_name} size={26} /><span className="font-medium">{r.full_name}</span></span> },
              { key: 'job_title', label: L('Title', 'المسمى') }, { key: 'department', label: L('Department', 'الإدارة'), render: (r: any) => L(r.department, deptAr(r.department)) },
              { key: 'nat', label: L('Nationality', 'الجنسية'), render: (r: any) => L(natEn(r.nationality), natAr(r.nationality)) },
              { key: 'gross', label: L('Gross', 'الإجمالي'), render: (r: any) => <span className="num">{money(monthlyGross(r))}</span> },
              { key: 'status', label: L('Status', 'الحالة'), render: (r: any) => <Badge tone={r.status === 'Active' ? 'brand' : r.status === 'On Leave' ? 'violet' : 'coral'}>{r.status}</Badge> },
            ]} /></Card>
          )}
        </>
      )}
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={L('Employee profile', 'ملف الموظف')} width="max-w-2xl">
        {open && <ProfileView e={open} onEdit={() => setForm(open)} onDelete={() => setDel(open)} />}
      </Drawer>
      {form && <EmployeeForm open={!!form} initial={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => emps.reload(true)} />}
      <Confirm open={!!del} onClose={() => setDel(null)} title={L('Delete employee?', 'حذف الموظف؟')} message={L(`This permanently removes ${del?.full_name} and their attendance, leave, payslips and expenses. Consider setting status to Terminated instead.`, `سيتم حذف ${del?.full_name} وجميع سجلاته نهائياً.`)} onConfirm={async () => { await deleteRes('employees', del.id); setOpenId(null); emps.reload(true); toast(L('Employee deleted', 'تم حذف الموظف')); }} />
    </div>
  );
}
