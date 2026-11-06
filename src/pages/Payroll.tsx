import { useEffect, useMemo, useRef, useState } from 'react';
import { Wallet, Play, Download, FileSpreadsheet, CheckCircle2, Printer, FileDown, Image, ShieldCheck, Lock, Search } from 'lucide-react';
import { act } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Badge, Field, Input, Modal, Table, useData, useToast, Spinner, ErrorBox, Empty, PageHeader, Stat, Select, Confirm, ScaleToFit } from '../components/ui';
import { PayslipDoc } from '../components/print';
import { exportPdf, exportPng, printEl } from '../lib/exporters';
import { sar, money, periodLabel, riyadhToday, download, num } from '../lib/format';
import { deptAr } from '../lib/saudi';

const RS: any = { draft: 'amber', approved: 'sky', paid: 'mint' };

function PayslipModal({ slip, onClose }: any) {
  const { L } = usePrefs(); const { me } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const name = slip ? `Payslip_${slip.employee_id}_${slip.period}` : '';
  const log = (f: string) => act('audit.event', { event: 'payslip.download', resource: 'payslips', record_id: slip.id, details: { format: f } }).catch(() => {});
  return (
    <Modal open={!!slip} onClose={onClose} size="xl" title={slip ? `${slip.employees?.full_name} · ${periodLabel(slip.period)}` : ''} footer={<>
      <Btn variant="subtle" icon={Printer} onClick={() => { printEl(ref.current!, name); log('print'); }}>{L('Print', 'طباعة')}</Btn>
      <Btn variant="subtle" icon={Image} onClick={() => { exportPng(ref.current!, name); log('png'); }}>PNG</Btn>
      <Btn icon={FileDown} onClick={() => { exportPdf(ref.current!, name); log('pdf'); }}>PDF</Btn>
    </>}>
      {slip && <ScaleToFit><PayslipDoc ref={ref} c={me?.company} s={slip} /></ScaleToFit>}
    </Modal>
  );
}

function wpsFile(c: any, run: any, slips: any[]) {
  const total = slips.reduce((s, x) => s + Number(x.net), 0);
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Record Type', 'Employer CR', 'MOL Establishment ID', 'Employer Bank', 'Payment Month', 'Value Date', 'Employee Count', 'Total Amount (SAR)'];
  const hdr = ['H', c.cr_number, c.mol_establishment_id || '', c.settings?.integrations?.wps_bank || 'RJHI', run.period, riyadhToday(), slips.length, total.toFixed(2)];
  const cols = ['Record Type', 'Employee ID/Iqama', 'Employee Name', 'Bank Code', 'IBAN', 'Basic Salary', 'Housing Allowance', 'Other Earnings', 'Deductions', 'Net Salary', 'Payment Reference'];
  const rows = slips.map((s) => ['D', s.employees?.iqama_number, s.employees?.full_name, s.employees?.bank_code, s.employees?.iban, money(s.basic).replace(/,/g, ''), money(s.housing).replace(/,/g, ''), (Number(s.transport) + Number(s.other_allowance) + Number(s.overtime) + Number(s.bonus || 0)).toFixed(2), (Number(s.gosi_employee) + Number(s.deductions)).toFixed(2), Number(s.net).toFixed(2), `SAL${run.period.replace('-', '')}${s.employee_id}`]);
  return [head, hdr, [], cols, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

function AdminPayroll() {
  const { L, lang } = usePrefs(); const { me } = useAuth(); const toast = useToast();
  const runs = useData('payroll_runs');
  const [runId, setRunId] = useState<any>(null);
  useEffect(() => { if (!runId && runs.data[0]) setRunId(runs.data[0].id); }, [runs.data, runId]);
  const run: any = runs.data.find((r: any) => r.id === runId);
  const slips = useData(runId ? 'payslips' : null, { f: { run_id: runId }, order: 'employee_id', asc: 'true' });
  const [openRun, setOpenRun] = useState(false);
  const [period, setPeriod] = useState(riyadhToday().slice(0, 7));
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [view, setView] = useState<any>(null);
  const [q, setQ] = useState('');
  const [confirmPaid, setConfirmPaid] = useState(false);
  const run_ = async () => {
    setBusy('run'); setErr('');
    try { const r = await act('payroll.run', { period }); toast(L(`Payroll generated for ${period}`, `تم إنشاء الرواتب لـ ${period}`)); setOpenRun(false); await runs.reload(true); setRunId(r.run.id); slips.reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const finalize = async (status: string) => { setBusy(status); try { await act('payroll.finalize', { run_id: runId, status }); toast(status === 'paid' ? L('Marked as paid — employees notified', 'تم الدفع وإبلاغ الموظفين') : L('Payroll approved', 'تم اعتماد الرواتب')); runs.reload(true); slips.reload(true); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(''); } };
  const exportWps = () => { download(`WPS_${me?.company?.cr_number}_${run.period}.csv`, '\ufeff' + wpsFile(me?.company, run, slips.data), 'text/csv'); act('audit.event', { event: 'payroll.wps_export', resource: 'payroll_runs', record_id: run.id }).catch(() => {}); toast(L('WPS file downloaded — upload it to Mudad / your bank', 'تم تنزيل ملف حماية الأجور — ارفعه على مدد')); };
  const exportCsv = () => { const cols = ['employee_id', 'basic', 'housing', 'transport', 'other_allowance', 'overtime', 'bonus', 'gross', 'gosi_base', 'gosi_employee', 'gosi_employer', 'deductions', 'net']; download(`payroll_${run.period}.csv`, [['name', ...cols].join(','), ...slips.data.map((s: any) => [`"${s.employees?.full_name}"`, ...cols.map((c) => s[c])].join(','))].join('\n'), 'text/csv'); };
  const t = run?.totals || {};
  const saudi = slips.data.filter((s: any) => s.employees?.is_saudi).length;
  const capped = slips.data.filter((s: any) => Number(s.gosi_base) >= 45000).length;
  const shown = slips.data.filter((s: any) => !q || `${s.employees?.full_name} ${s.employee_id}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title={L('Payroll', 'الرواتب')} subtitle={L('GOSI dual-rate with 45K cap · WPS / Mudad export · bilingual payslips', 'التأمينات بنسبتين وسقف 45 ألف · ملف حماية الأجور · قسائم ثنائية اللغة')} icon={Wallet} tone="amber" actions={<Btn icon={Play} onClick={() => setOpenRun(true)}>{L('Run payroll', 'تشغيل الرواتب')}</Btn>} />
      <ErrorBox error={runs.error} retry={runs.reload} />
      <div className="flex flex-wrap items-center gap-2 bg-surface p-2 mb-3">
        <span className="text-xs text-muted">{L('Period', 'الفترة')}</span>
        <Select className="!w-auto" value={runId || ''} onChange={(e: any) => setRunId(Number(e.target.value))} aria-label="Payroll period">{runs.data.map((r: any) => <option key={r.id} value={r.id}>{periodLabel(r.period, lang)} · {r.status}</option>)}</Select>
        {run && <Badge tone={RS[run.status]}>{run.status === 'paid' && <Lock size={10} />}{run.status}</Badge>}
        <div className="flex-1" />
        {run?.status === 'draft' && <Btn size="sm" variant="soft" icon={CheckCircle2} loading={busy === 'approved'} onClick={() => finalize('approved')}>{L('Approve', 'اعتماد')}</Btn>}
        {run && run.status !== 'paid' && <Btn size="sm" variant="success" icon={CheckCircle2} loading={busy === 'paid'} onClick={() => setConfirmPaid(true)}>{L('Mark paid', 'تم الدفع')}</Btn>}
        {run && <Btn size="sm" variant="secondary" icon={FileSpreadsheet} onClick={exportWps} disabled={!slips.data.length}>{L('WPS file', 'ملف حماية الأجور')}</Btn>}
        {run && <Btn size="sm" variant="subtle" icon={Download} onClick={exportCsv} disabled={!slips.data.length}>CSV</Btn>}
      </div>
      {runs.loading ? <Spinner /> : !run ? <div className="bg-surface"><Empty icon={Wallet} title={L('No payroll runs yet', 'لا توجد دورات رواتب')} action={<Btn icon={Play} onClick={() => setOpenRun(true)}>{L('Run first payroll', 'تشغيل أول دورة')}</Btn>} /></div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-3">
            <Stat label={L('Employees', 'الموظفون')} value={t.employees} tone="brand" sub={L(`${saudi} Saudi · ${t.employees - saudi} expat`, `${saudi} سعودي · ${t.employees - saudi} وافد`)} />
            <Stat label={L('Gross', 'الإجمالي')} value={sar(t.gross, lang, true)} tone="violet" />
            <Stat label={L('Net payable', 'الصافي')} value={sar(t.net, lang, true)} tone="mint" />
            <Stat label={L('GOSI employee', 'تأمينات الموظف')} value={sar(t.gosi_employee, lang, true)} tone="sky" />
            <Stat label={L('GOSI employer', 'تأمينات صاحب العمل')} value={sar(t.gosi_employer, lang, true)} tone="amber" sub={capped ? L(`${capped} at 45K cap`, `${capped} عند السقف`) : undefined} />
            <Stat label={L('Overtime', 'العمل الإضافي')} value={sar(t.overtime, lang, true)} tone="coral" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-3">
            <Card title={L('Payslips', 'القسائم')} pad={false} actions={<div className="relative"><Search size={13} className="absolute start-2 top-2.5 text-muted" /><Input className="!h-8 ps-7 !w-48 text-xs" placeholder={L('Search…', 'بحث…')} value={q} onChange={(e: any) => setQ(e.target.value)} /></div>}>
              {slips.loading ? <Spinner /> : <div className="max-h-[560px] overflow-y-auto scroll-thin"><Table dense rows={shown} onRowClick={setView} columns={[
                { key: 'n', label: L('Employee', 'الموظف'), render: (s: any) => <span><b className="font-medium">{s.employees?.full_name}</b><span className="block text-[0.68rem] text-muted">{s.employee_id} · {L(s.employees?.department, deptAr(s.employees?.department))}</span></span> },
                { key: 'gosi_t', label: 'GOSI', render: (s: any) => <Badge tone={s.employees?.is_saudi ? 'mint' : 'sky'}>{s.employees?.is_saudi ? '9.75% / 11.75%' : '0% / 2%'}</Badge> },
                { key: 'gross', label: L('Gross', 'الإجمالي'), className: 'text-end', render: (s: any) => <span className="num">{money(s.gross)}</span> },
                { key: 'ge', label: L('GOSI (emp)', 'التأمينات'), className: 'text-end', render: (s: any) => <span className="num text-coral">{Number(s.gosi_employee) ? `−${money(s.gosi_employee)}` : '—'}</span> },
                { key: 'gr', label: L('Employer', 'صاحب العمل'), className: 'text-end', render: (s: any) => <span className="num text-muted">{money(s.gosi_employer)}</span> },
                { key: 'ded', label: L('Other ded.', 'خصومات'), className: 'text-end', render: (s: any) => <span className="num">{Number(s.deductions) ? `−${money(s.deductions)}` : '—'}</span> },
                { key: 'net', label: L('Net', 'الصافي'), className: 'text-end', render: (s: any) => <b className="num">{money(s.net)}</b> },
              ]} /></div>}
            </Card>
            <Card title={L('GOSI rules applied', 'قواعد التأمينات')} icon={ShieldCheck} tone="mint">
              <ul className="text-xs flex flex-col gap-2">
                <li className="p-2 bg-mint/10"><b>{L('Saudi nationals', 'السعوديون')}</b><br />{L('Employee 9.75% (annuities 9% + SANED 0.75%)', 'الموظف 9.75% (معاشات 9% + ساند 0.75%)')}<br />{L('Employer 11.75% (9% + 0.75% + hazards 2%)', 'صاحب العمل 11.75% (9% + 0.75% + أخطار 2%)')}</li>
                <li className="p-2 bg-sky/10"><b>{L('Expats', 'الوافدون')}</b><br />{L('Employer 2% occupational hazards; no employee deduction', 'صاحب العمل 2% أخطار مهنية؛ لا خصم على الموظف')}</li>
                <li className="p-2 bg-amber/10"><b>{L('Contribution base', 'الأجر الخاضع')}</b><br />{L('Basic + housing, min SAR 1,500, capped at SAR 45,000', 'الأساسي + السكن، حد أدنى 1,500 وحد أعلى 45,000 ريال')}</li>
                <li className="p-2 bg-violet/10"><b>{L('Overtime', 'العمل الإضافي')}</b><br />{L('Approved timesheet OT × hourly rate (gross ÷ 176) × 1.5 (Art. 107)', 'ساعات إضافية معتمدة × أجر الساعة × 1.5 (م 107)')}</li>
                <li className="p-2 bg-coral/10"><b>{L('Unpaid leave', 'إجازة بدون راتب')}</b><br />{L('Deducted at gross ÷ 30 per day', 'تُخصم بمعدل الإجمالي ÷ 30 لكل يوم')}</li>
              </ul>
            </Card>
          </div>
        </>
      )}
      <Modal open={openRun} onClose={() => setOpenRun(false)} title={L('Run payroll', 'تشغيل الرواتب')} footer={<><Btn variant="ghost" onClick={() => setOpenRun(false)}>{L('Cancel', 'إلغاء')}</Btn><Btn icon={Play} loading={busy === 'run'} onClick={run_}>{L('Generate payslips', 'إنشاء القسائم')}</Btn></>}>
        <Field label={L('Payroll month', 'شهر الرواتب')} hint={L('Draft runs can be re-generated; paid runs are locked.', 'يمكن إعادة إنشاء المسودات؛ الدورات المدفوعة مقفلة.')}><Input type="month" value={period} onChange={(e: any) => setPeriod(e.target.value)} /></Field>
        <p className="text-sm text-muted mt-3">{L('Calculates salaries from employee records, overtime from approved client timesheets, unpaid-leave deductions and GOSI for every active employee.', 'يحسب الرواتب والعمل الإضافي وخصومات الإجازات غير المدفوعة والتأمينات لكل موظف.')}</p>
        <div className="mt-3"><ErrorBox error={err} /></div>
      </Modal>
      <Confirm open={confirmPaid} onClose={() => setConfirmPaid(false)} danger={false} title={L('Mark payroll as paid?', 'تأكيد الدفع؟')} message={L('This locks the run, publishes payslips to employees and notifies them. Make sure the WPS file has been processed by the bank.', 'سيتم قفل الدورة ونشر القسائم للموظفين.')} confirmLabel={L('Mark paid', 'تم الدفع')} onConfirm={() => finalize('paid')} />
      <PayslipModal slip={view} onClose={() => setView(null)} />
    </div>
  );
}

function MyPayslips() {
  const { L, lang } = usePrefs();
  const slips = useData('payslips', { order: 'period', asc: 'false' });
  const [view, setView] = useState<any>(null);
  const ytd = slips.data.filter((s: any) => s.period.startsWith(riyadhToday().slice(0, 4)));
  return (
    <div>
      <PageHeader title={L('My payslips', 'قسائم راتبي')} subtitle={L('Paid via WPS · download or print any month', 'مدفوعة عبر حماية الأجور · حمّل أو اطبع أي شهر')} icon={Wallet} tone="amber" />
      <ErrorBox error={slips.error} retry={slips.reload} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Stat label={L('Latest net pay', 'آخر صافي راتب')} value={sar(slips.data[0]?.net, lang)} tone="mint" />
        <Stat label={L('YTD gross', 'الإجمالي منذ بداية العام')} value={sar(ytd.reduce((s: number, x: any) => s + Number(x.gross), 0), lang, true)} tone="violet" />
        <Stat label={L('YTD GOSI paid', 'التأمينات منذ بداية العام')} value={sar(ytd.reduce((s: number, x: any) => s + Number(x.gosi_employee), 0), lang, true)} tone="sky" />
        <Stat label={L('Employer GOSI for you (YTD)', 'حصة صاحب العمل')} value={sar(ytd.reduce((s: number, x: any) => s + Number(x.gosi_employer), 0), lang, true)} tone="amber" />
      </div>
      {slips.loading ? <Spinner /> : !slips.data.length ? <div className="bg-surface"><Empty icon={Wallet} title={L('No payslips yet', 'لا توجد قسائم بعد')} /></div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {slips.data.map((s: any) => (
            <button key={s.id} onClick={() => setView(s)} className="bg-surface p-3 text-start hover:bg-amber/5 flex flex-col gap-1">
              <div className="flex justify-between items-center"><span className="font-display font-semibold">{periodLabel(s.period, lang)}</span><Badge tone="mint">{L('paid', 'مدفوع')}</Badge></div>
              <div className="font-display text-xl num text-mint">{sar(s.net, lang)}</div>
              <div className="text-xs text-muted flex gap-3"><span>{L('Gross', 'إجمالي')} {money(s.gross)}</span><span>GOSI −{money(s.gosi_employee)}</span>{Number(s.bonus) > 0 && <span className="text-violet">+{L('bonus', 'مكافأة')}</span>}</div>
            </button>
          ))}
        </div>
      )}
      <PayslipModal slip={view} onClose={() => setView(null)} />
    </div>
  );
}

export default function Payroll() {
  const { role } = useAuth();
  return role === 'admin' ? <AdminPayroll /> : <MyPayslips />;
}
