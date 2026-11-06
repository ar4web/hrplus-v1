import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Receipt, Plus, Trash2, Printer, FileDown, Image, FileCode2, Mail, MessageCircle, CheckCircle2, Ban, QrCode, Import, ShieldCheck } from 'lucide-react';
import { act, updateRes } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Badge, Field, Input, Select, Textarea, Modal, Tabs, Table, useData, useToast, Spinner, ErrorBox, Empty, PageHeader, Stat, Segmented, Toggle, ScaleToFit, Confirm } from '../components/ui';
import { InvoiceDoc } from '../components/print';
import { exportPdf, exportPng, printEl } from '../lib/exporters';
import { sar, money, fmtDate, download, riyadhToday } from '../lib/format';

const ST: any = { issued: 'sky', sent: 'violet', paid: 'mint', void: 'slate' };
const DESIGNS = [{ value: 'classic', en: 'Classic letterhead', ar: 'كلاسيكي' }, { value: 'band', en: 'Modern band', ar: 'حديث' }, { value: 'minimal', en: 'Minimal', ar: 'بسيط' }];

function InvoiceForm({ open, onClose, onCreated }: any) {
  const { L, lang } = usePrefs(); const { me } = useAuth(); const toast = useToast();
  const vendors = useData('vendors');
  const inv = me?.company?.settings?.invoicing || {};
  const [type, setType] = useState('B2B');
  const [vendorId, setVendorId] = useState('');
  const [buyer, setBuyer] = useState({ name: '', phone: '', email: '' });
  const [lines, setLines] = useState<any[]>([{ description: '', qty: 1, unit_price: 0 }]);
  const [design, setDesign] = useState(inv.default_design || 'classic');
  const [notes, setNotes] = useState('');
  const [send, setSend] = useState({ email: inv.auto_send_email !== false, whatsapp: !!inv.auto_send_whatsapp });
  const [period, setPeriod] = useState(riyadhToday().slice(0, 7));
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const clients = vendors.data.filter((v: any) => v.type !== 'internal');
  useEffect(() => { if (!vendorId && clients[0]) setVendorId(String(clients[0].id)); }, [clients.length]);
  const sub = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
  const vat = Math.round(sub * 0.15 * 100) / 100;
  const importTs = async () => { setBusy('imp'); setErr(''); try { const r = await act('invoice.lines_from_timesheets', { vendor_id: Number(vendorId), period }); if (!r.lines.length) setErr(L('No approved timesheets for that client and month', 'لا توجد سجلات معتمدة لهذا العميل والشهر')); else { setLines(r.lines); toast(L(`Imported ${r.count} timesheets`, `تم استيراد ${r.count} سجل`)); } } catch (e: any) { setErr(e.message); } finally { setBusy(''); } };
  const submit = async () => {
    setErr('');
    const clean = lines.filter((l) => l.description && Number(l.qty) > 0);
    if (!clean.length) return setErr(L('Add at least one line with description and quantity', 'أضف بنداً واحداً على الأقل'));
    if (clean.some((l) => Number(l.unit_price) < 0)) return setErr(L('Prices cannot be negative', 'لا يمكن أن تكون الأسعار سالبة'));
    if (type === 'B2B' && !vendorId) return setErr(L('Choose a customer', 'اختر العميل'));
    setBusy('save');
    try {
      const r = await act('invoice.create', { type, vendor_id: Number(vendorId), buyer, lines: clean, design, notes, send });
      toast(L(`Invoice ${r.invoice.number} issued & signed`, `تم إصدار الفاتورة ${r.invoice.number}`));
      onCreated(r); onClose();
      setLines([{ description: '', qty: 1, unit_price: 0 }]); setNotes('');
    } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const v = clients.find((x: any) => String(x.id) === vendorId);
  return (
    <Modal open={open} onClose={onClose} size="xl" title={L('New ZATCA e-invoice', 'فاتورة إلكترونية جديدة')} footer={<><span className="me-auto text-sm num">{L('Total', 'الإجمالي')}: <b>{sar(sub + vat, lang)}</b> <span className="text-muted text-xs">({L('incl. VAT', 'شامل الضريبة')} {money(vat)})</span></span><Btn variant="ghost" onClick={onClose}>{L('Cancel', 'إلغاء')}</Btn><Btn icon={ShieldCheck} loading={busy === 'save'} onClick={submit}>{L('Issue & sign', 'إصدار وتوقيع')}</Btn></>}>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Segmented size="md" value={type} onChange={setType} label="Invoice type" options={[{ value: 'B2B', label: L('B2B · Standard tax invoice', 'B2B · فاتورة ضريبية') }, { value: 'B2C', label: L('B2C · Simplified', 'B2C · مبسطة') }]} />
        <Select className="!w-auto" value={design} onChange={(e: any) => setDesign(e.target.value)} aria-label="Design">{DESIGNS.map((d) => <option key={d.value} value={d.value}>{L(d.en, d.ar)}</option>)}</Select>
      </div>
      {type === 'B2B' ? (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end p-3 bg-surface2 mb-3">
          <Field label={L('Customer (VAT registered)', 'العميل (مسجل بالضريبة)')}><Select value={vendorId} onChange={(e: any) => setVendorId(e.target.value)}>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name} · VAT {c.vat_number}</option>)}</Select></Field>
          <Field label={L('Timesheet month', 'شهر السجلات')}><Input type="month" value={period} onChange={(e: any) => setPeriod(e.target.value)} /></Field>
          <Btn variant="soft" icon={Import} loading={busy === 'imp'} onClick={importTs}>{L('Import timesheets', 'استيراد الساعات')}</Btn>
          {v && <p className="md:col-span-3 text-xs text-muted">{v.address}, {v.city} · CR {v.cr_number} · {v.email} · {v.phone}</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-surface2 mb-3">
          <Field label={L('Customer name (optional)', 'اسم العميل (اختياري)')}><Input value={buyer.name} onChange={(e: any) => setBuyer({ ...buyer, name: e.target.value })} /></Field>
          <Field label={L('Mobile (for WhatsApp)', 'الجوال')}><Input dir="ltr" value={buyer.phone} onChange={(e: any) => setBuyer({ ...buyer, phone: e.target.value })} placeholder="+9665…" /></Field>
          <Field label={L('Email', 'البريد')}><Input dir="ltr" type="email" value={buyer.email} onChange={(e: any) => setBuyer({ ...buyer, email: e.target.value })} /></Field>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead><tr className="text-xs text-muted text-start"><th className="text-start p-1">{L('Description', 'الوصف')}</th><th className="p-1 w-24">{L('Qty', 'الكمية')}</th><th className="p-1 w-32">{L('Unit price', 'سعر الوحدة')}</th><th className="p-1 w-32 text-end">{L('Total + VAT', 'الإجمالي')}</th><th className="w-8" /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="p-1"><Input value={l.description} onChange={(e: any) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} aria-label={`Line ${i + 1} description`} /></td>
                <td className="p-1"><Input type="number" min="0" step="0.5" value={l.qty} onChange={(e: any) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} aria-label="Quantity" /></td>
                <td className="p-1"><Input type="number" min="0" step="0.01" value={l.unit_price} onChange={(e: any) => setLines(lines.map((x, j) => (j === i ? { ...x, unit_price: e.target.value } : x)))} aria-label="Unit price" /></td>
                <td className="p-1 text-end num">{money((Number(l.qty) || 0) * (Number(l.unit_price) || 0) * 1.15)}</td>
                <td className="p-1"><Btn size="xs" variant="ghost" icon={Trash2} aria-label="Remove line" onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : lines)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Btn size="sm" variant="ghost" icon={Plus} className="mt-1" onClick={() => setLines([...lines, { description: '', qty: 1, unit_price: 0 }])}>{L('Add line', 'إضافة بند')}</Btn>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <Field label={L('Notes / payment instructions', 'ملاحظات / تعليمات الدفع')}><Textarea rows={2} value={notes} onChange={(e: any) => setNotes(e.target.value)} /></Field>
        <div className="p-3 bg-brand/8">
          <div className="text-xs font-semibold mb-1">{L('Auto-send on issue', 'الإرسال التلقائي عند الإصدار')}</div>
          <Toggle label={L('Email to customer', 'بريد إلكتروني للعميل')} checked={send.email} onChange={(x: boolean) => setSend({ ...send, email: x })} />
          <Toggle label={L('WhatsApp to customer', 'واتساب للعميل')} checked={send.whatsapp} onChange={(x: boolean) => setSend({ ...send, whatsapp: x })} />
          <p className="text-[0.68rem] text-muted">{L('Opens a pre-filled email / WhatsApp message with the invoice summary. A direct email/WhatsApp gateway is not connected in this build.', 'يفتح رسالة بريد أو واتساب جاهزة. لا توجد بوابة إرسال مباشرة في هذا الإصدار.')}</p>
        </div>
      </div>
      <div className="mt-3"><ErrorBox error={err} /></div>
    </Modal>
  );
}

function InvoiceView({ inv, onClose, onChanged, links }: any) {
  const { L, lang } = usePrefs(); const { me, role } = useAuth(); const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [design, setDesign] = useState(inv?.design || 'classic');
  const [confirmVoid, setConfirmVoid] = useState(false);
  useEffect(() => { if (inv) setDesign(inv.design || 'classic'); }, [inv?.id]);
  if (!inv) return null;
  const name = inv.number;
  const send = async (channel: string) => {
    const w = window.open('about:blank', '_blank');
    try { const r = await act('invoice.send', { id: inv.id, channel }); if (r.link) { if (w) w.location.assign(r.link); else window.location.assign(r.link); } else { w?.close(); toast(L('Customer has no contact for this channel', 'لا توجد بيانات اتصال'), 'error'); } onChanged(); } catch (e: any) { w?.close(); toast(e.message, 'error'); }
  };
  const setStatus = async (status: string) => { try { await act('invoice.status', { id: inv.id, status }); toast(L('Invoice updated', 'تم التحديث')); onChanged(); onClose(); } catch (e: any) { toast(e.message, 'error'); } };
  const saveDesign = async (d: string) => { setDesign(d); if (role === 'admin') { try { await updateRes('invoices', inv.id, { design: d }); onChanged(); } catch { /* ignore */ } } };
  const log = (f: string) => act('audit.event', { event: 'invoice.download', resource: 'invoices', record_id: inv.id, details: { format: f } }).catch(() => {});
  return (
    <Modal open={!!inv} onClose={onClose} size="xl" title={<span className="flex items-center gap-2">{inv.number}<Badge tone={ST[inv.status]}>{inv.status}</Badge><Badge tone={inv.type === 'B2B' ? 'brand' : 'amber'}>{inv.type}</Badge></span>} footer={<>
      <Select className="!w-auto me-auto" value={design} onChange={(e: any) => saveDesign(e.target.value)} aria-label="Design">{DESIGNS.map((d) => <option key={d.value} value={d.value}>{L(d.en, d.ar)}</option>)}</Select>
      <Btn variant="subtle" icon={Printer} onClick={() => { printEl(ref.current!, name); log('print'); }}>{L('Print', 'طباعة')}</Btn>
      <Btn variant="subtle" icon={Image} onClick={() => { exportPng(ref.current!, name); log('png'); }}>PNG</Btn>
      <Btn variant="subtle" icon={FileCode2} onClick={() => { download(`${name}.xml`, inv.xml, 'application/xml'); log('xml'); }}>XML</Btn>
      <Btn icon={FileDown} onClick={() => { exportPdf(ref.current!, name); log('pdf'); }}>PDF</Btn>
    </>}>
      {links && <div className="mb-3 p-3 bg-mint/12 text-sm flex flex-wrap items-center gap-2"><CheckCircle2 size={16} className="text-mint" /><span className="flex-1">{L('Signed with ECDSA, hash-chained (ICV ' + inv.icv + ') and QR encoded per ZATCA Phase 2.', 'تم التوقيع والربط التسلسلي ورمز QR وفق المرحلة الثانية.')}</span>{(inv.sent_via || []).map((s: any, i: number) => <Btn key={i} size="sm" variant="success" icon={s.channel === 'email' ? Mail : MessageCircle} onClick={() => send(s.channel)}>{L(`Send ${s.channel}`, s.channel === 'email' ? 'إرسال بالبريد' : 'إرسال واتساب')}</Btn>)}</div>}
      {role === 'admin' && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Btn size="sm" variant="soft" icon={Mail} onClick={() => send('email')}>{L('Email', 'بريد')}</Btn>
          <Btn size="sm" variant="soft" icon={MessageCircle} onClick={() => send('whatsapp')}>WhatsApp</Btn>
          {inv.status !== 'paid' && inv.status !== 'void' && <Btn size="sm" variant="success" icon={CheckCircle2} onClick={() => setStatus('paid')}>{L('Mark paid', 'تم السداد')}</Btn>}
          {inv.status !== 'void' && inv.status !== 'paid' && <Btn size="sm" variant="dangerSoft" icon={Ban} onClick={() => setConfirmVoid(true)}>{L('Void', 'إلغاء')}</Btn>}
          {(inv.sent_via || []).length > 0 && <span className="text-xs text-muted self-center">{L('Sent', 'أُرسلت')}: {(inv.sent_via || []).map((s: any) => `${s.channel} ${fmtDate(s.at, lang)}`).join(' · ')}</span>}
        </div>
      )}
      <ScaleToFit><InvoiceDoc ref={ref} c={me?.company} inv={inv} design={design} /></ScaleToFit>
      <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted flex items-center gap-1"><QrCode size={12} className="inline" /> {L('ZATCA technical data', 'البيانات الفنية')}</summary>
        <dl className="grid grid-cols-1 gap-1 mt-2 break-all font-mono text-[0.68rem] bg-surface2 p-2" dir="ltr"><div><dt className="text-muted">UUID</dt><dd>{inv.uuid}</dd></div><div><dt className="text-muted">Invoice hash (SHA-256)</dt><dd>{inv.hash}</dd></div><div><dt className="text-muted">Previous invoice hash (PIH)</dt><dd>{inv.prev_hash}</dd></div><div><dt className="text-muted">ECDSA signature</dt><dd>{inv.signature}</dd></div><div><dt className="text-muted">QR (Base64 TLV)</dt><dd>{inv.qr}</dd></div></dl>
      </details>
      <Confirm open={confirmVoid} onClose={() => setConfirmVoid(false)} title={L('Void this invoice?', 'إلغاء الفاتورة؟')} message={L('Voided invoices stay in the hash chain for audit. Issue a credit note in your ERP if already reported.', 'تبقى الفواتير الملغاة في السلسلة لأغراض التدقيق.')} onConfirm={() => setStatus('void')} />
    </Modal>
  );
}

export default function Invoices() {
  const { role } = useAuth(); const { L, lang } = usePrefs();
  const [sp, setSp] = useSearchParams();
  const invs = useData('invoices', { order: 'icv', asc: 'false' });
  const [tab, setTab] = useState('all');
  const [newOpen, setNewOpen] = useState(sp.get('new') === '1' && role === 'admin');
  const [viewId, setViewId] = useState<any>(null);
  const [links, setLinks] = useState<any>(null);
  const view = invs.data.find((i: any) => i.id === viewId);
  const rows = useMemo(() => invs.data.filter((i: any) => tab === 'all' || (tab === 'unpaid' ? ['issued', 'sent'].includes(i.status) : i.type === tab)), [invs.data, tab]);
  const month = riyadhToday().slice(0, 7);
  const thisMonth = invs.data.filter((i: any) => i.issue_date.startsWith(month) && i.status !== 'void');
  const outstanding = invs.data.filter((i: any) => ['issued', 'sent'].includes(i.status));
  const overdue = outstanding.filter((i: any) => i.due_date < riyadhToday());
  return (
    <div>
      <PageHeader title={role === 'vendor' ? L('My invoices', 'فواتيري') : L('ZATCA e-invoicing', 'الفوترة الإلكترونية')} subtitle={L('Phase 2: UBL 2.1 XML · SHA-256 hash chain · ECDSA signature · TLV QR · VAT 15%', 'المرحلة 2: XML · سلسلة تجزئة · توقيع رقمي · رمز QR · ضريبة 15%')} icon={Receipt} tone="coral" actions={role === 'admin' && <Btn icon={Plus} onClick={() => setNewOpen(true)}>{L('New invoice', 'فاتورة جديدة')}</Btn>} />
      <ErrorBox error={invs.error} retry={invs.reload} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Stat label={L('Invoiced this month', 'المفوتر هذا الشهر')} value={sar(thisMonth.reduce((s: number, i: any) => s + Number(i.total), 0), lang, true)} tone="coral" sub={`${thisMonth.length} ${L('invoices', 'فاتورة')}`} />
        <Stat label={L('VAT collected (month)', 'الضريبة المحصلة')} value={sar(thisMonth.reduce((s: number, i: any) => s + Number(i.vat), 0), lang, true)} tone="amber" />
        <Stat label={L('Outstanding', 'المستحق')} value={sar(outstanding.reduce((s: number, i: any) => s + Number(i.total), 0), lang, true)} tone="violet" sub={`${outstanding.length} ${L('open', 'مفتوحة')}`} />
        <Stat label={L('Overdue', 'متأخرة')} value={overdue.length} tone="rose" sub={sar(overdue.reduce((s: number, i: any) => s + Number(i.total), 0), lang, true)} />
      </div>
      <Tabs className="mb-2" value={tab} onChange={setTab} tabs={[{ value: 'all', label: L('All', 'الكل') }, { value: 'B2B', label: 'B2B' }, { value: 'B2C', label: 'B2C' }, { value: 'unpaid', label: L('Unpaid', 'غير مدفوعة'), count: outstanding.length }]} />
      <Card pad={false}>
        {invs.loading ? <Spinner /> : <Table rows={rows} onRowClick={(r: any) => { setLinks(null); setViewId(r.id); }} empty={<Empty icon={Receipt} title={L('No invoices', 'لا توجد فواتير')} />} columns={[
          { key: 'number', label: L('Number', 'الرقم'), render: (i: any) => <span className="font-medium num">{i.number}</span> },
          { key: 'type', label: L('Type', 'النوع'), render: (i: any) => <Badge tone={i.type === 'B2B' ? 'brand' : 'amber'}>{i.type}</Badge> },
          { key: 'buyer', label: L('Customer', 'العميل'), render: (i: any) => i.buyer?.name },
          { key: 'date', label: L('Issued', 'الإصدار'), render: (i: any) => <span className="num text-xs">{fmtDate(i.issue_date, lang)}</span> },
          { key: 'due', label: L('Due', 'الاستحقاق'), render: (i: any) => <span className={`num text-xs ${['issued', 'sent'].includes(i.status) && i.due_date < riyadhToday() ? 'text-coral font-semibold' : ''}`}>{fmtDate(i.due_date, lang)}</span> },
          { key: 'vat', label: L('VAT', 'الضريبة'), className: 'text-end', render: (i: any) => <span className="num text-muted">{money(i.vat)}</span> },
          { key: 'total', label: L('Total', 'الإجمالي'), className: 'text-end', render: (i: any) => <b className="num">{money(i.total)}</b> },
          { key: 'status', label: L('Status', 'الحالة'), render: (i: any) => <Badge tone={ST[i.status]}>{i.status}</Badge> },
          { key: 'q', label: '', render: () => <QrCode size={14} className="text-muted" aria-label="Has ZATCA QR" /> },
        ]} />}
      </Card>
      {role === 'admin' && <InvoiceForm open={newOpen} onClose={() => { setNewOpen(false); if (sp.get('new')) setSp({}); }} onCreated={async (r: any) => { await invs.reload(true); setLinks(r.links); setViewId(r.invoice.id); }} />}
      <InvoiceView inv={view} links={links} onClose={() => { setViewId(null); setLinks(null); }} onChanged={() => invs.reload(true)} />
    </div>
  );
}
