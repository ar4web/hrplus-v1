import { useEffect, useRef, useState } from 'react';
import { FileText, Printer, FileDown, FileType2, Image, Search, History, Lock } from 'lucide-react';
import { act } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Badge, Field, Input, Select, Textarea, Table, useData, useToast, Spinner, Empty, PageHeader, Segmented, ScaleToFit, Tabs, TONE } from '../components/ui';
import { DocPaper } from '../components/print';
import { TEMPLATES } from '../lib/templates';
import { exportPdf, exportPng, exportWord, printEl } from '../lib/exporters';
import { fmtDateTime, riyadhToday } from '../lib/format';

export default function Documents() {
  const { me, role } = useAuth(); const { L, lang } = usePrefs(); const toast = useToast();
  const admin = role === 'admin';
  const emps = useData(admin ? 'employees' : null);
  const history = useData('documents', { limit: 50 });
  const [tab, setTab] = useState('create');
  const [key, setKey] = useState('salary_certificate');
  const [empId, setEmpId] = useState(admin ? '' : me?.employee?.id || '');
  const [docLang, setDocLang] = useState<'both' | 'en' | 'ar'>('both');
  const [fields, setFields] = useState<any>({});
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const ref = useRef<HTMLDivElement>(null);
  const tpl = TEMPLATES.find((t) => t.key === key)!;
  const emp = admin ? emps.data.find((e: any) => e.id === empId) : me?.employee;
  useEffect(() => { if (admin && !empId && emps.data[0]) setEmpId(emps.data[0].id); }, [emps.data]);
  useEffect(() => { const f: any = {}; tpl.fields.forEach((x) => { f[x.key] = x.def ? x.def(emp) : ''; }); setFields(f); }, [key, empId, emp?.id]);
  const available = TEMPLATES.filter((t) => (admin || t.self) && (cat === 'all' || t.cat === cat) && (!q || `${t.en} ${t.ar}`.toLowerCase().includes(q.toLowerCase())));
  const cats = [...new Set(TEMPLATES.map((t) => t.cat))];
  // Cheap derived value (a plain object); computing it inline keeps the template picker snappy and avoids a stale memo
  const doc = (() => { try { return emp ? tpl.render({ c: me?.company || {}, e: emp, f: fields }) : null; } catch { return null; } })();
  const refNo = `HR/${riyadhToday().slice(0, 4)}/${(emp?.id || '').replace('EMP', '')}-${String(TEMPLATES.indexOf(tpl) + 1).padStart(2, '0')}`;
  const name = `${tpl.key}_${emp?.id || ''}_${docLang}`;
  const exp = async (format: string) => {
    if (!ref.current || !doc) return;
    try {
      if (format === 'print') printEl(ref.current, tpl.en);
      if (format === 'pdf') await exportPdf(ref.current, name);
      if (format === 'word') exportWord(ref.current, name);
      if (format === 'png') await exportPng(ref.current, name);
      await act('document.log', { template_key: tpl.key, employee_id: emp.id, title: `${tpl.en} — ${emp.full_name}`, lang: docLang, fields, format });
      history.reload(true);
      toast(L(`${format.toUpperCase()} ready — logged to records`, `تم التصدير وحفظه في السجل`));
    } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <div>
      <PageHeader title={L('Documents & letters', 'المستندات والخطابات')} subtitle={L(`${TEMPLATES.length} bilingual Saudi HR templates on your company letterhead`, `${TEMPLATES.length} نموذجاً ثنائي اللغة على الورق الرسمي للشركة`)} icon={FileText} tone="violet" />
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ value: 'create', label: L('Create', 'إنشاء') }, { value: 'history', label: L('Issued documents', 'المستندات الصادرة'), count: history.data.length }]} />
      {tab === 'history' ? (
        <Card pad={false}>{history.loading ? <Spinner /> : <Table rows={history.data} empty={<Empty icon={History} title={L('No documents issued yet', 'لم تصدر مستندات بعد')} />} columns={[
          { key: 'title', label: L('Document', 'المستند'), render: (d: any) => <b className="font-medium">{d.title}</b> },
          { key: 'lang', label: L('Language', 'اللغة'), render: (d: any) => <Badge tone="violet">{d.lang}</Badge> },
          { key: 'format', label: L('Format', 'الصيغة'), render: (d: any) => <Badge tone="sky">{d.format}</Badge> },
          { key: 'by', label: L('Issued by', 'أصدره'), render: (d: any) => d.created_by },
          { key: 'at', label: L('When', 'الوقت'), render: (d: any) => <span className="text-xs num">{fmtDateTime(d.created_at, lang)}</span> },
          { key: 'r', label: '', render: (d: any) => <Btn size="xs" variant="soft" onClick={() => { setKey(d.template_key); if (admin && d.employee_id) setEmpId(d.employee_id); setDocLang(d.lang); setTab('create'); setTimeout(() => setFields((f: any) => ({ ...f, ...(d.fields || {}) })), 50); }}>{L('Re-open', 'فتح')}</Btn> },
        ]} />}</Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[300px_320px_1fr] gap-3">
          <Card title={L('Templates', 'النماذج')} pad={false}>
            <div className="p-2 flex flex-col gap-1.5">
              <div className="relative"><Search size={13} className="absolute start-2 top-2.5 text-muted" /><Input className="ps-7 !h-8 text-xs" placeholder={L('Search templates', 'بحث')} value={q} onChange={(e: any) => setQ(e.target.value)} aria-label="Search templates" /></div>
              <Select className="!h-8 text-xs" value={cat} onChange={(e: any) => setCat(e.target.value)} aria-label="Category"><option value="all">{L('All categories', 'كل الفئات')}</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
            </div>
            <ul className="max-h-[620px] overflow-y-auto scroll-thin px-2 pb-2 flex flex-col gap-1" role="listbox" aria-label="Templates">
              {available.map((t) => (
                <li key={t.key}><button role="option" aria-selected={key === t.key} onClick={() => setKey(t.key)} className={`w-full text-start p-2 flex gap-2 items-start transition ${key === t.key ? `${TONE[t.tone]} ring-2 ring-inset ring-current` : 'hover:bg-ink/5'}`}>
                  <span className={`w-7 h-7 grid place-items-center shrink-0 ${TONE[t.tone]}`}><FileText size={13} /></span>
                  <span className="min-w-0"><span className="block text-sm font-medium text-ink leading-tight">{t.en}</span><span className="block text-xs text-muted" dir="rtl">{t.ar}</span></span>
                </button></li>
              ))}
              {!admin && <li className="text-[0.7rem] text-muted p-2 flex gap-1"><Lock size={11} className="shrink-0 mt-0.5" />{L('Other letters (warning, termination, EOSB…) are issued by HR.', 'الخطابات الأخرى تصدر من الموارد البشرية.')}</li>}
            </ul>
          </Card>
          <Card title={L('Details', 'التفاصيل')}>
            <div className="flex flex-col gap-3">
              {admin ? <Field label={L('Employee', 'الموظف')}><Select value={empId} onChange={(e: any) => setEmpId(e.target.value)}>{emps.data.map((e: any) => <option key={e.id} value={e.id}>{e.full_name} · {e.id}</option>)}</Select></Field> : <div className="text-sm p-2 bg-surface2">{me?.employee?.full_name} · {me?.employee?.id}</div>}
              <Field label={L('Language', 'اللغة')}><Segmented size="md" value={docLang} onChange={setDocLang} label="Document language" options={[{ value: 'both', label: L('Both', 'كلاهما') }, { value: 'ar', label: 'عربي' }, { value: 'en', label: 'English' }]} /></Field>
              {tpl.fields.map((fd) => (
                <Field key={fd.key} label={L(fd.en, fd.ar)}>
                  {fd.type === 'select' ? <Select value={fields[fd.key] ?? ''} onChange={(e: any) => setFields({ ...fields, [fd.key]: e.target.value })}>{fd.options!.map((o) => <option key={o.value} value={o.value}>{L(o.en, o.ar)}</option>)}</Select>
                    : fd.type === 'textarea' ? <Textarea rows={2} value={fields[fd.key] ?? ''} onChange={(e: any) => setFields({ ...fields, [fd.key]: e.target.value })} dir="auto" />
                      : <Input type={fd.type || 'text'} value={fields[fd.key] ?? ''} onChange={(e: any) => setFields({ ...fields, [fd.key]: e.target.value })} dir="auto" />}
                </Field>
              ))}
              <div className="grid grid-cols-2 gap-1.5 pt-2">
                <Btn variant="subtle" icon={Printer} onClick={() => exp('print')} disabled={!doc}>{L('Print', 'طباعة')}</Btn>
                <Btn icon={FileDown} onClick={() => exp('pdf')} disabled={!doc}>PDF</Btn>
                <Btn variant="soft" icon={FileType2} onClick={() => exp('word')} disabled={!doc}>Word</Btn>
                <Btn variant="soft" icon={Image} onClick={() => exp('png')} disabled={!doc}>{L('Image', 'صورة')}</Btn>
              </div>
              <p className="text-[0.68rem] text-muted">{L('Letterhead, logo and colours come from Company Setup.', 'الورق الرسمي والشعار والألوان من إعداد الشركة.')}</p>
            </div>
          </Card>
          <div className="bg-sunken p-2 md:p-4 min-w-0">
            {!emp ? <Spinner /> : doc ? <div className="shadow-xl"><ScaleToFit><DocPaper ref={ref} c={me?.company} doc={{ ...doc, signatory: me?.profile?.role === 'admin' ? me?.profile?.display_name : 'Human Resources', signatoryAr: me?.profile?.role === 'admin' ? me?.profile?.display_name : 'الموارد البشرية' }} lang={docLang} refNo={refNo} date={riyadhToday()} /></ScaleToFit></div> : <Empty title={L('Fill in the details to preview', 'أكمل التفاصيل للمعاينة')} />}
          </div>
        </div>
      )}
    </div>
  );
}
