import { useEffect, useRef, useState } from 'react';
import { Building2, Upload, Save, MapPin, Palette, Clock, Phone, Landmark, Crosshair, CheckCircle2 } from 'lucide-react';
import { getRes, updateRes, uploadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Field, Input, Select, Spinner, ErrorBox, PageHeader, useToast, ScaleToFit, Badge } from '../components/ui';
import { DocPaper } from '../components/print';

const DAYS = [['Sun', 'الأحد'], ['Mon', 'الاثنين'], ['Tue', 'الثلاثاء'], ['Wed', 'الأربعاء'], ['Thu', 'الخميس'], ['Fri', 'الجمعة'], ['Sat', 'السبت']];
const INDUSTRIES = ['Information Technology & Consulting', 'Construction & Contracting', 'Retail & Wholesale', 'Manufacturing', 'Healthcare', 'Education', 'Hospitality & Tourism', 'Logistics & Transport', 'Financial Services', 'Oil, Gas & Energy', 'Real Estate', 'Government Services', 'Other'];

export default function Company() {
  const { L } = usePrefs(); const { setCompany } = useAuth(); const toast = useToast();
  const [c, setC] = useState<any>(null);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState(''); const [errs, setErrs] = useState<any>({});
  const [busy, setBusy] = useState(false); const [up, setUp] = useState(false); const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { getRes('company', { id: 1 }).then(setC).catch((e) => setErr(e.message)).finally(() => setLoading(false)); }, []);
  const set = (k: string) => (e: any) => { setSaved(false); setC({ ...c, [k]: e.target.value }); };
  const wh = c?.working_hours || { start: '08:00', end: '17:00', days: [0, 1, 2, 3, 4] };
  const setWh = (patch: any) => { setSaved(false); setC({ ...c, working_hours: { ...wh, ...patch } }); };
  const validate = () => {
    const e: any = {};
    if (!c.legal_name_en?.trim()) e.legal_name_en = L('Required', 'مطلوب');
    if (!c.legal_name_ar?.trim()) e.legal_name_ar = L('Required', 'مطلوب');
    if (!/^\d{10}$/.test(c.cr_number || '')) e.cr_number = L('CR must be 10 digits', 'السجل التجاري 10 أرقام');
    if (!/^3\d{13}3$/.test(c.vat_number || '')) e.vat_number = L('VAT: 15 digits, starts and ends with 3', 'الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3');
    if (!/^#[0-9a-f]{6}$/i.test(c.primary_color || '')) e.primary_color = L('Hex colour', 'لون سداسي');
    if (!/^#[0-9a-f]{6}$/i.test(c.secondary_color || '')) e.secondary_color = L('Hex colour', 'لون سداسي');
    if (c.website && !/^https?:\/\//.test(c.website)) e.website = L('Start with https://', 'ابدأ بـ https://');
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) e.email = L('Invalid email', 'بريد غير صالح');
    if (c.postal_code && !/^\d{5}$/.test(c.postal_code)) e.postal_code = L('5 digits', '5 أرقام');
    if (c.building_no && !/^\d{4}$/.test(c.building_no)) e.building_no = L('4 digits', '4 أرقام');
    if (!(Number(c.geofence_radius) >= 25 && Number(c.geofence_radius) <= 5000)) e.geofence_radius = L('25–5000 m', '25–5000 م');
    if (Math.abs(Number(c.geofence_lat)) > 90 || Math.abs(Number(c.geofence_lng)) > 180 || c.geofence_lat === '' || c.geofence_lng === '') e.geofence_lat = L('Valid coordinates required', 'إحداثيات صحيحة مطلوبة');
    if (!wh.days?.length) e.days = L('Pick at least one working day', 'اختر يوم عمل واحداً على الأقل');
    setErrs(e); return !Object.keys(e).length;
  };
  const save = async () => {
    if (!validate()) { toast(L('Please fix the highlighted fields', 'يرجى تصحيح الحقول'), 'error'); return; }
    setBusy(true); setErr('');
    try {
      const { id, updated_at, settings, ...rest } = c;
      const r = await updateRes('company', 1, { ...rest, geofence_lat: Number(c.geofence_lat), geofence_lng: Number(c.geofence_lng), geofence_radius: Number(c.geofence_radius) });
      setC(r); setCompany(r); setSaved(true); toast(L('Company profile saved — letterheads, invoices & payslips updated', 'تم الحفظ — تم تحديث الورق الرسمي والفواتير والقسائم'));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const upload = async (f?: File) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast(L('Logo must be under 2 MB', 'الشعار يجب أن يكون أقل من 2 ميجا'), 'error'); return; }
    setUp(true);
    try { const r = await uploadFile('branding', f); setC({ ...c, logo_url: r.url }); setSaved(false); toast(L('Logo uploaded — click Save to apply', 'تم رفع الشعار — اضغط حفظ')); } catch (e: any) { toast(e.message, 'error'); } finally { setUp(false); }
  };
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => { setC({ ...c, geofence_lat: p.coords.latitude.toFixed(6), geofence_lng: p.coords.longitude.toFixed(6) }); setSaved(false); toast(L('Location captured', 'تم تحديد الموقع'), 'info'); }, () => toast(L('Could not get location', 'تعذر تحديد الموقع'), 'error'), { enableHighAccuracy: true });
  if (loading) return <Spinner />;
  if (!c) return <ErrorBox error={err} />;
  const F = (k: string, label: string, p: any = {}) => <Field label={label} error={errs[k]} htmlFor={`c-${k}`}><Input id={`c-${k}`} value={c[k] ?? ''} onChange={set(k)} {...p} /></Field>;
  const preview = { titleEn: 'Letterhead preview', titleAr: 'معاينة الورق الرسمي', en: ['This is how your company identity appears on letters, payslips and ZATCA invoices.'], ar: ['هكذا تظهر هوية شركتك في الخطابات وقسائم الرواتب والفواتير الإلكترونية.'], signatory: 'HR Manager' };
  return (
    <div>
      <PageHeader title={L('Company setup', 'إعداد الشركة')} subtitle={L('Single source of truth for letterheads, invoices, payslips and documents', 'المصدر الوحيد للورق الرسمي والفواتير والقسائم والمستندات')} icon={Building2} tone="brand" actions={<>{saved && <Badge tone="mint"><CheckCircle2 size={11} />{L('Saved', 'تم الحفظ')}</Badge>}<Btn icon={Save} loading={busy} onClick={save}>{L('Save changes', 'حفظ التغييرات')}</Btn></>} />
      <ErrorBox error={err} />
      <div className="grid grid-cols-1 2xl:grid-cols-[1fr_520px] gap-3">
        <div className="flex flex-col gap-3">
          <Card title={L('Legal identity', 'الهوية النظامية')} icon={Landmark} tone="brand">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {F('legal_name_en', L('Legal name (English)', 'الاسم النظامي (إنجليزي)'))}
              {F('legal_name_ar', L('Legal name (Arabic)', 'الاسم النظامي (عربي)'), { dir: 'rtl' })}
              {F('cr_number', L('Commercial Registration (CR)', 'السجل التجاري'), { dir: 'ltr', maxLength: 10, inputMode: 'numeric' })}
              {F('vat_number', L('VAT registration number', 'رقم التسجيل الضريبي'), { dir: 'ltr', maxLength: 15, inputMode: 'numeric' })}
              {F('gosi_number', L('GOSI registration no.', 'رقم المنشأة في التأمينات'), { dir: 'ltr' })}
              {F('mol_establishment_id', L('MHRSD / Qiwa establishment ID', 'رقم المنشأة في قوى'), { dir: 'ltr' })}
              <Field label={L('Industry', 'القطاع')}><Select value={c.industry || ''} onChange={set('industry')}>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</Select></Field>
            </div>
          </Card>
          <Card title={L('Brand', 'الهوية البصرية')} icon={Palette} tone="violet">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
              <div className="flex items-center gap-3">
                <div className="w-20 h-20 bg-surface2 grid place-items-center overflow-hidden">{c.logo_url ? <img src={c.logo_url} alt="Company logo" className="max-w-full max-h-full object-contain" /> : <Building2 className="text-muted" />}</div>
                <div className="flex flex-col gap-1"><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} aria-label="Logo file" /><Btn size="sm" variant="soft" icon={Upload} loading={up} onClick={() => fileRef.current?.click()}>{L('Upload logo', 'رفع الشعار')}</Btn>{c.logo_url && <button className="text-xs text-coral text-start hover:underline" onClick={() => setC({ ...c, logo_url: null })}>{L('Remove', 'إزالة')}</button>}<span className="text-[0.65rem] text-muted">PNG/SVG ≤ 2MB</span></div>
              </div>
              {[['primary_color', L('Primary colour', 'اللون الأساسي')], ['secondary_color', L('Secondary colour', 'اللون الثانوي')]].map(([k, l]) => (
                <Field key={k} label={l} error={errs[k]}><div className="flex gap-2"><input type="color" value={c[k] || '#000000'} onChange={set(k)} className="w-10 h-9 p-0 border-0 bg-transparent cursor-pointer" aria-label={l} /><Input value={c[k] || ''} onChange={set(k)} dir="ltr" maxLength={7} /></div></Field>
              ))}
            </div>
          </Card>
          <Card title={L('Address (National Address)', 'العنوان الوطني')} icon={MapPin} tone="coral">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {F('address_en', L('Address (English)', 'العنوان (إنجليزي)'))}
              {F('address_ar', L('Address (Arabic)', 'العنوان (عربي)'), { dir: 'rtl' })}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:col-span-2">
                {F('building_no', L('Building no.', 'رقم المبنى'), { dir: 'ltr', maxLength: 4 })}
                {F('street', L('Street', 'الشارع'))}
                {F('district', L('District', 'الحي'))}
                {F('city', L('City', 'المدينة'))}
                {F('postal_code', L('Postal code', 'الرمز البريدي'), { dir: 'ltr', maxLength: 5 })}
              </div>
            </div>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card title={L('Contact', 'التواصل')} icon={Phone} tone="sky">
              <div className="grid gap-3">{F('phone', L('Phone', 'الهاتف'), { dir: 'ltr' })}{F('email', L('Email', 'البريد'), { dir: 'ltr', type: 'email' })}{F('website', L('Website', 'الموقع'), { dir: 'ltr', placeholder: 'https://' })}</div>
            </Card>
            <Card title={L('Working hours', 'ساعات العمل')} icon={Clock} tone="amber">
              <div className="grid grid-cols-2 gap-3">
                <Field label={L('Start', 'البداية')}><Input type="time" value={wh.start} onChange={(e: any) => setWh({ start: e.target.value })} /></Field>
                <Field label={L('End', 'النهاية')}><Input type="time" value={wh.end} onChange={(e: any) => setWh({ end: e.target.value })} /></Field>
                <Field label={L('Ramadan start', 'بداية رمضان')}><Input type="time" value={wh.ramadan_start || ''} onChange={(e: any) => setWh({ ramadan_start: e.target.value })} /></Field>
                <Field label={L('Ramadan end', 'نهاية رمضان')}><Input type="time" value={wh.ramadan_end || ''} onChange={(e: any) => setWh({ ramadan_end: e.target.value })} /></Field>
              </div>
              <div className="flex flex-wrap gap-1 mt-3" role="group" aria-label="Working days">{DAYS.map((d, i) => { const on = wh.days?.includes(i); return <button key={i} type="button" aria-pressed={on} onClick={() => setWh({ days: on ? wh.days.filter((x: number) => x !== i) : [...(wh.days || []), i].sort() })} className={`px-2.5 h-8 text-xs font-medium ${on ? 'bg-amber/20 text-amber ring-1 ring-inset ring-current' : 'bg-surface2 text-muted'}`}>{L(d[0], d[1])}</button>; })}</div>
              {errs.days && <p className="text-xs text-coral mt-1">{errs.days}</p>}
              <p className="text-[0.68rem] text-muted mt-2">{L('Saudi Labor Law: max 8 h/day, 48 h/week; 6 h/day during Ramadan for Muslims.', 'نظام العمل: 8 ساعات يومياً و 48 أسبوعياً، و 6 ساعات في رمضان.')}</p>
            </Card>
          </div>
          <Card title={L('Branch & attendance geofence', 'الفرع ونطاق الحضور')} icon={Crosshair} tone="mint" actions={<Btn size="sm" variant="soft" icon={Crosshair} onClick={locate}>{L('Use my location', 'استخدم موقعي')}</Btn>}>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {F('branch_name', L('Branch name', 'اسم الفرع'))}
              {F('branch_code', L('Branch code', 'رمز الفرع'), { dir: 'ltr' })}
              {F('geofence_lat', L('Latitude', 'خط العرض'), { dir: 'ltr', type: 'number', step: '0.000001' })}
              {F('geofence_lng', L('Longitude', 'خط الطول'), { dir: 'ltr', type: 'number', step: '0.000001' })}
              {F('geofence_radius', L('Radius (m)', 'نصف القطر (م)'), { type: 'number', min: 25, max: 5000 })}
            </div>
            <a className="text-xs text-brand hover:underline mt-2 inline-block" href={`https://www.openstreetmap.org/?mlat=${c.geofence_lat}&mlon=${c.geofence_lng}#map=17/${c.geofence_lat}/${c.geofence_lng}`} target="_blank" rel="noreferrer">{L('Verify on map ↗', 'تحقق على الخريطة ↗')}</a>
          </Card>
        </div>
        <div className="2xl:sticky 2xl:top-24 self-start">
          <Card title={L('Live letterhead preview', 'معاينة مباشرة')} pad={false}><div className="bg-sunken p-3"><div className="shadow-lg"><ScaleToFit><DocPaper c={c} doc={preview} lang="both" refNo="HR/PREVIEW" date={new Date().toISOString().slice(0, 10)} /></ScaleToFit></div></div></Card>
        </div>
      </div>
    </div>
  );
}
