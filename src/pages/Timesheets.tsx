import { useMemo, useState } from 'react';
import { Clock, Check, X, Download } from 'lucide-react';
import { act } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Badge, Select, Table, useData, useToast, Spinner, ErrorBox, Empty, PageHeader, Stat } from '../components/ui';
import { fmtDate, sar, money, num, download, periodLabel } from '../lib/format';

const ST: any = { Approved: 'mint', 'Pending Review': 'amber', Submitted: 'sky', Rejected: 'coral' };

export default function Timesheets() {
  const { role } = useAuth();
  const { L, lang } = usePrefs();
  const toast = useToast();
  const ts = useData('timesheets');
  const [month, setMonth] = useState('all');
  const [client, setClient] = useState('all');
  const [status, setStatus] = useState('all');
  const [busy, setBusy] = useState<string>('');
  const months = [...new Set(ts.data.map((t: any) => t.date.slice(0, 7)))].sort().reverse() as string[];
  const clients = [...new Set(ts.data.map((t: any) => t.vendors?.name).filter(Boolean))].sort() as string[];
  const rows = useMemo(() => ts.data.filter((t: any) => (month === 'all' || t.date.startsWith(month)) && (client === 'all' || t.vendors?.name === client) && (status === 'all' || t.status === status)), [ts.data, month, client, status]);
  const hours = rows.reduce((s: number, t: any) => s + Number(t.regular_hours) + Number(t.overtime_hours), 0);
  const billable = rows.filter((t: any) => t.status === 'Approved').reduce((s: number, t: any) => s + (Number(t.regular_hours) + Number(t.overtime_hours)) * Number(t.bill_rate), 0);
  const pending = rows.filter((t: any) => ['Pending Review', 'Submitted'].includes(t.status));
  const decide = async (t: any, decision: string) => { setBusy(t.id + decision); try { await act('timesheet.decide', { id: t.id, decision }); toast(decision === 'Approved' ? L('Timesheet approved', 'تم الاعتماد') : L('Timesheet rejected', 'تم الرفض')); ts.reload(true); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(''); } };
  const canDecide = role === 'admin' || role === 'vendor';
  const exportCsv = () => download('timesheets.csv', ['id,date,employee,client,project,regular,overtime,rate_sar,status', ...rows.map((t: any) => [t.id, t.date, `"${t.employees?.full_name}"`, `"${t.vendors?.name || ''}"`, `"${t.project}"`, t.regular_hours, t.overtime_hours, t.bill_rate, t.status].join(','))].join('\n'), 'text/csv');
  return (
    <div>
      <PageHeader title={role === 'vendor' ? L('Consultant timesheets', 'سجلات ساعات المستشارين') : role === 'employee' ? L('My timesheets', 'سجلات ساعاتي') : L('Client timesheets', 'سجلات ساعات العملاء')} subtitle={L('Billable hours feed invoicing; approved overtime feeds payroll (×1.5).', 'الساعات المعتمدة تغذي الفوترة، والإضافي يغذي الرواتب.')} icon={Clock} tone="indigo" actions={<Btn variant="subtle" icon={Download} onClick={exportCsv}>CSV</Btn>} />
      <ErrorBox error={ts.error} retry={ts.reload} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Stat label={L('Timesheets', 'السجلات')} value={rows.length} tone="indigo" />
        <Stat label={L('Hours', 'الساعات')} value={num(hours)} tone="sky" />
        {role !== 'employee' && <Stat label={L('Approved billable', 'المبلغ المعتمد')} value={sar(billable, lang, true)} tone="mint" />}
        <Stat label={L('Awaiting approval', 'بانتظار الاعتماد')} value={pending.length} tone="amber" />
      </div>
      <Card pad={false} actions={<>
        <Select className="!w-auto !h-8 text-xs" value={month} onChange={(e: any) => setMonth(e.target.value)} aria-label="Month"><option value="all">{L('All months', 'كل الأشهر')}</option>{months.map((m) => <option key={m} value={m}>{periodLabel(m, lang)}</option>)}</Select>
        {role === 'admin' && <Select className="!w-auto !h-8 text-xs" value={client} onChange={(e: any) => setClient(e.target.value)} aria-label="Client"><option value="all">{L('All clients', 'كل العملاء')}</option>{clients.map((c) => <option key={c}>{c}</option>)}</Select>}
        <Select className="!w-auto !h-8 text-xs" value={status} onChange={(e: any) => setStatus(e.target.value)} aria-label="Status"><option value="all">{L('All statuses', 'كل الحالات')}</option>{Object.keys(ST).map((s) => <option key={s}>{s}</option>)}</Select>
      </>} title={L('Entries', 'السجلات')}>
        {ts.loading ? <Spinner /> : <Table dense rows={rows} empty={<Empty icon={Clock} title={L('No timesheets', 'لا توجد سجلات')} />} columns={[
          { key: 'id', label: 'ID', render: (t: any) => <span className="text-xs num">{t.id}</span> },
          { key: 'date', label: L('Date', 'التاريخ'), render: (t: any) => <span className="num text-xs">{fmtDate(t.date, lang)}</span> },
          ...(role !== 'employee' ? [{ key: 'emp', label: L('Consultant', 'المستشار'), render: (t: any) => <span className="font-medium">{t.employees?.full_name}</span> }] : []),
          ...(role !== 'vendor' ? [{ key: 'cl', label: L('Client', 'العميل'), render: (t: any) => t.vendors?.name || '—' }] : []),
          { key: 'project', label: L('Project', 'المشروع') },
          { key: 'h', label: L('Reg / OT', 'عادي / إضافي'), render: (t: any) => <span className="num">{t.regular_hours} / <span className="text-coral">{t.overtime_hours}</span></span> },
          ...(role !== 'employee' ? [{ key: 'amt', label: L('Amount', 'المبلغ'), className: 'text-end', render: (t: any) => <span className="num">{money((Number(t.regular_hours) + Number(t.overtime_hours)) * Number(t.bill_rate))}</span> }] : []),
          { key: 'status', label: L('Status', 'الحالة'), render: (t: any) => <Badge tone={ST[t.status]}>{t.status}</Badge> },
          ...(canDecide ? [{ key: 'a', label: '', render: (t: any) => ['Pending Review', 'Submitted'].includes(t.status) ? <span className="flex gap-1"><Btn size="xs" variant="success" icon={Check} loading={busy === t.id + 'Approved'} onClick={() => decide(t, 'Approved')}>{L('Approve', 'اعتماد')}</Btn><Btn size="xs" variant="dangerSoft" icon={X} loading={busy === t.id + 'Rejected'} onClick={() => decide(t, 'Rejected')} aria-label="Reject" /></span> : null }] : []),
        ]} />}
      </Card>
    </div>
  );
}
