import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LifeBuoy, Search, HelpCircle, ChevronDown, Plus, Send, Phone, Mail, Globe, Clock, MessageSquare, Trash2, Building2 } from 'lucide-react';
import { act, createRes, deleteRes } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Badge, Field, Input, Select, Textarea, Modal, Drawer, Tabs, Table, useData, useToast, Spinner, Empty, ErrorBox, PageHeader, Avatar, TONE } from '../components/ui';
import { fmtDateTime, timeAgo } from '../lib/format';

const TS: any = { open: 'coral', in_progress: 'amber', resolved: 'mint', closed: 'slate' };
const PR: any = { low: 'slate', normal: 'sky', high: 'amber', urgent: 'rose' };

function HelpCenter({ admin }: any) {
  const { L, lang } = usePrefs(); const toast = useToast();
  const faqs = useData('faqs');
  const [q, setQ] = useState(''); const [open, setOpen] = useState<number | null>(null); const [cat, setCat] = useState('all');
  const [nw, setNw] = useState<any>(null);
  const cats = [...new Set(faqs.data.map((f: any) => f.category))] as string[];
  const list = useMemo(() => faqs.data.filter((f: any) => (cat === 'all' || f.category === cat) && (!q || [f.q_en, f.q_ar, f.a_en, f.a_ar].join(' ').toLowerCase().includes(q.toLowerCase()))), [faqs.data, q, cat]);
  return (
    <div className="flex flex-col gap-3">
      <div className="p-6 bg-gradient-to-br from-coral/15 via-amber/10 to-brand/15 text-center">
        <h2 className="font-display text-xl font-semibold">{L('How can we help?', 'كيف يمكننا مساعدتك؟')}</h2>
        <div className="relative max-w-xl mx-auto mt-3"><Search size={16} className="absolute start-3 top-3 text-muted" /><Input className="!h-11 ps-10 text-base" placeholder={L('Search: payslip, GOSI, check-in, Iqama…', 'ابحث: الراتب، التأمينات، الحضور، الإقامة…')} value={q} onChange={(e: any) => setQ(e.target.value)} aria-label="Search help" /></div>
        <div className="flex flex-wrap justify-center gap-1 mt-3">{['all', ...cats].map((c) => <button key={c} onClick={() => setCat(c)} className={`px-2.5 h-7 text-xs ${cat === c ? 'bg-ink text-bg' : 'bg-surface/70 hover:bg-surface'}`}>{c === 'all' ? L('All', 'الكل') : c}</button>)}</div>
      </div>
      {admin && <div><Btn size="sm" variant="soft" icon={Plus} onClick={() => setNw({ category: 'General', context: 'dashboard', q_en: '', q_ar: '', a_en: '', a_ar: '' })}>{L('Add article', 'إضافة مقال')}</Btn></div>}
      {faqs.loading ? <Spinner /> : !list.length ? <div className="bg-surface"><Empty icon={HelpCircle} title={L('No matching answers', 'لا توجد إجابات')} hint={L('Open a ticket and our HR team will help.', 'افتح تذكرة وسيساعدك فريق الموارد البشرية.')} /></div> : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
          {list.map((f: any) => (
            <li key={f.id} className="bg-surface self-start">
              <button className="w-full text-start p-3 flex items-center gap-2" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
                <HelpCircle size={15} className="text-coral shrink-0" /><span className="flex-1 text-sm font-medium">{lang === 'ar' ? f.q_ar : f.q_en}</span><Badge>{f.category}</Badge><ChevronDown size={14} className={`transition ${open === f.id ? 'rotate-180' : ''}`} />
              </button>
              {open === f.id && <div className="px-3 pb-3 text-sm text-muted leading-relaxed">{lang === 'ar' ? f.a_ar : f.a_en}{admin && <div className="mt-2"><Btn size="xs" variant="dangerSoft" icon={Trash2} onClick={async () => { await deleteRes('faqs', f.id); faqs.reload(true); toast(L('Deleted', 'تم الحذف')); }}>{L('Delete', 'حذف')}</Btn></div>}</div>}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!nw} onClose={() => setNw(null)} wide title={L('New help article', 'مقال مساعدة جديد')} footer={<Btn onClick={async () => { if (!nw.q_en || !nw.q_ar || !nw.a_en || !nw.a_ar) { toast(L('All four fields are required', 'جميع الحقول مطلوبة'), 'error'); return; } try { await createRes('faqs', nw); setNw(null); faqs.reload(true); toast(L('Article added', 'تمت الإضافة')); } catch (e: any) { toast(e.message, 'error'); } }}>{L('Save', 'حفظ')}</Btn>}>
        {nw && <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Field label={L('Category', 'الفئة')}><Input value={nw.category} onChange={(e: any) => setNw({ ...nw, category: e.target.value })} /></Field><Field label={L('Page context', 'الصفحة')}><Select value={nw.context} onChange={(e: any) => setNw({ ...nw, context: e.target.value })}>{['dashboard', 'attendance', 'leave', 'directory', 'payroll', 'timesheets', 'invoices', 'expenses', 'assets', 'documents', 'chat', 'policies', 'company', 'support', 'settings'].map((c) => <option key={c}>{c}</option>)}</Select></Field><Field label="Question (EN)"><Input value={nw.q_en} onChange={(e: any) => setNw({ ...nw, q_en: e.target.value })} /></Field><Field label="السؤال (عربي)"><Input dir="rtl" value={nw.q_ar} onChange={(e: any) => setNw({ ...nw, q_ar: e.target.value })} /></Field><Field label="Answer (EN)"><Textarea value={nw.a_en} onChange={(e: any) => setNw({ ...nw, a_en: e.target.value })} /></Field><Field label="الإجابة (عربي)"><Textarea dir="rtl" value={nw.a_ar} onChange={(e: any) => setNw({ ...nw, a_ar: e.target.value })} /></Field></div>}
      </Modal>
    </div>
  );
}

function Tickets({ admin, context }: any) {
  const { L, lang } = usePrefs(); const { me } = useAuth(); const toast = useToast();
  const tickets = useData('tickets');
  const [nw, setNw] = useState<any>(context ? { subject: '', category: 'General', priority: 'normal', message: '', context } : null);
  const [openId, setOpenId] = useState<any>(null); const [reply, setReply] = useState(''); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [status, setStatus] = useState('all');
  const t = tickets.data.find((x: any) => x.id === openId);
  const rows = tickets.data.filter((x: any) => status === 'all' || x.status === status);
  const create = async () => { setErr(''); setBusy('new'); try { const r = await act('ticket.create', nw); toast(L(`Ticket #${r.id} created`, `تم إنشاء التذكرة #${r.id}`)); setNw(null); await tickets.reload(true); setOpenId(r.id); } catch (e: any) { setErr(e.message); } finally { setBusy(''); } };
  const send = async () => { if (!reply.trim()) return; setBusy('reply'); try { await act('ticket.reply', { id: t.id, body: reply }); setReply(''); tickets.reload(true); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(''); } };
  const setSt = async (s: string) => { setBusy(s); try { await act('ticket.status', { id: t.id, status: s }); tickets.reload(true); toast(L('Status updated', 'تم التحديث')); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(''); } };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2"><Btn icon={Plus} onClick={() => setNw({ subject: '', category: 'General', priority: 'normal', message: '', context: '' })}>{L('New ticket', 'تذكرة جديدة')}</Btn><div className="flex-1" /><Select className="!w-auto" value={status} onChange={(e: any) => setStatus(e.target.value)} aria-label="Status"><option value="all">{L('All statuses', 'كل الحالات')}</option>{Object.keys(TS).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select></div>
      <Card pad={false}>
        {tickets.loading ? <Spinner /> : <Table rows={rows} onRowClick={(r: any) => setOpenId(r.id)} empty={<Empty icon={LifeBuoy} title={L('No tickets', 'لا توجد تذاكر')} />} columns={[
          { key: 'id', label: '#', render: (x: any) => <span className="num text-xs">#{x.id}</span> },
          { key: 'subject', label: L('Subject', 'الموضوع'), render: (x: any) => <span><b className="font-medium">{x.subject}</b><span className="block text-xs text-muted">{x.category}{admin ? ` · ${x.requester}` : ''}</span></span> },
          { key: 'p', label: L('Priority', 'الأولوية'), render: (x: any) => <Badge tone={PR[x.priority]}>{x.priority}</Badge> },
          { key: 's', label: L('Status', 'الحالة'), render: (x: any) => <Badge tone={TS[x.status]}>{x.status.replace('_', ' ')}</Badge> },
          { key: 'm', label: L('Messages', 'الرسائل'), render: (x: any) => <span className="text-xs inline-flex items-center gap-1"><MessageSquare size={12} />{(x.messages || []).length}</span> },
          { key: 'u', label: L('Updated', 'آخر تحديث'), render: (x: any) => <span className="text-xs text-muted">{timeAgo(x.updated_at, lang)}</span> },
        ]} />}
      </Card>
      <Modal open={!!nw} onClose={() => setNw(null)} title={L('New support ticket', 'تذكرة دعم جديدة')} footer={<Btn icon={Send} loading={busy === 'new'} onClick={create}>{L('Submit', 'إرسال')}</Btn>}>
        {nw && <div className="grid grid-cols-2 gap-3">
          <Field label={L('Subject', 'الموضوع')} className="col-span-2"><Input value={nw.subject} onChange={(e: any) => setNw({ ...nw, subject: e.target.value })} dir="auto" /></Field>
          <Field label={L('Category', 'الفئة')}><Select value={nw.category} onChange={(e: any) => setNw({ ...nw, category: e.target.value })}>{['General', 'Payroll', 'Attendance', 'Leave', 'Invoicing', 'Assets', 'Government Relations', 'Access & Security', 'Bug report'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label={L('Priority', 'الأولوية')}><Select value={nw.priority} onChange={(e: any) => setNw({ ...nw, priority: e.target.value })}>{Object.keys(PR).map((p) => <option key={p}>{p}</option>)}</Select></Field>
          <Field label={L('Describe the issue', 'صف المشكلة')} className="col-span-2" hint={nw.context ? L(`Context: ${nw.context} page`, `السياق: صفحة ${nw.context}`) : undefined}><Textarea rows={5} value={nw.message} onChange={(e: any) => setNw({ ...nw, message: e.target.value })} dir="auto" /></Field>
        </div>}
        <div className="mt-2"><ErrorBox error={err} /></div>
      </Modal>
      <Drawer open={!!t} onClose={() => setOpenId(null)} width="max-w-xl" title={t ? `#${t.id} · ${t.subject}` : ''} footer={t && <div className="w-full flex flex-col gap-2">
        <div className="flex gap-2"><Textarea rows={2} className="flex-1 !min-h-0" value={reply} onChange={(e: any) => setReply(e.target.value)} placeholder={L('Write a reply…', 'اكتب رداً…')} dir="auto" aria-label="Reply" /><Btn icon={Send} loading={busy === 'reply'} onClick={send} disabled={!reply.trim()}>{L('Reply', 'رد')}</Btn></div>
        <div className="flex flex-wrap gap-1.5">{admin ? ['in_progress', 'resolved', 'closed'].filter((s) => s !== t.status).map((s) => <Btn key={s} size="xs" variant="subtle" loading={busy === s} onClick={() => setSt(s)}>{L(`Mark ${s.replace('_', ' ')}`, s)}</Btn>) : t.status !== 'resolved' && t.status !== 'closed' && <Btn size="xs" variant="subtle" onClick={() => setSt('resolved')}>{L('Mark resolved', 'تم الحل')}</Btn>}</div>
      </div>}>
        {t && <div className="p-4 flex flex-col gap-3">
          <div className="flex gap-1.5"><Badge tone={TS[t.status]}>{t.status.replace('_', ' ')}</Badge><Badge tone={PR[t.priority]}>{t.priority}</Badge><Badge>{t.category}</Badge></div>
          {(t.messages || []).map((m: any, i: number) => (
            <div key={i} className={`flex gap-2 ${m.role === 'admin' ? 'flex-row-reverse text-end' : ''}`}><Avatar name={m.by} size={28} /><div className={`p-2.5 max-w-[85%] ${m.role === 'admin' ? 'bg-brand/10' : 'bg-surface2'}`}><div className="text-xs text-muted mb-0.5">{m.by} · {fmtDateTime(m.at, lang)}</div><div className="text-sm whitespace-pre-wrap text-start" dir="auto">{m.body}</div></div></div>
          ))}
        </div>}
      </Drawer>
    </div>
  );
}

function Contact() {
  const { L, lang } = usePrefs(); const { me } = useAuth();
  const c = me?.company || {};
  const items = [
    [Building2, L('HR helpdesk', 'مكتب الموارد البشرية'), L(c.legal_name_en, c.legal_name_ar), 'brand', null],
    [Phone, L('Phone', 'الهاتف'), c.phone, 'mint', c.phone ? `tel:${c.phone}` : null],
    [Mail, L('Email', 'البريد'), c.email, 'sky', c.email ? `mailto:${c.email}` : null],
    [Globe, L('Website', 'الموقع'), c.website, 'violet', c.website],
    [Clock, L('Hours', 'ساعات العمل'), `${c.working_hours?.start || ''}–${c.working_hours?.end || ''} · ${L('Sun–Thu', 'الأحد–الخميس')}`, 'amber', null],
  ];
  const gov = [['MHRSD / Qiwa', '19911', 'https://qiwa.sa'], ['GOSI', '8001243344', 'https://www.gosi.gov.sa'], ['ZATCA', '19993', 'https://zatca.gov.sa'], ['Absher / Jawazat', '992', 'https://www.absher.sa']];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card title={L('Contact your HR team', 'تواصل مع الموارد البشرية')} icon={LifeBuoy} tone="coral">
        <ul className="flex flex-col gap-1.5">{items.map(([I, l, v, tone, href]: any) => <li key={l} className="flex items-center gap-3 p-2 bg-surface2"><span className={`w-9 h-9 grid place-items-center ${TONE[tone]}`}><I size={16} /></span><div className="min-w-0"><div className="text-xs text-muted">{l}</div>{href ? <a href={href} className="text-sm font-medium hover:underline break-all" dir="ltr" target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{v}</a> : <div className="text-sm font-medium">{v || '—'}</div>}</div></li>)}</ul>
        <p className="text-xs text-muted mt-3">{L(c.address_en, c.address_ar)}</p>
      </Card>
      <Card title={L('Government service lines', 'أرقام الجهات الحكومية')} icon={Globe} tone="sky">
        <ul className="flex flex-col gap-1.5">{gov.map(([n, p, u]) => <li key={n} className="flex items-center justify-between p-2 bg-surface2 text-sm"><a href={u} target="_blank" rel="noreferrer" className="font-medium hover:underline">{n}</a><a href={`tel:${p}`} className="num text-brand" dir="ltr">{p}</a></li>)}</ul>
      </Card>
    </div>
  );
}

export default function Support() {
  const { role } = useAuth(); const { L } = usePrefs();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'help';
  const context = sp.get('context') || '';
  return (
    <div>
      <PageHeader title={L('Support', 'الدعم')} subtitle={L('Help center, tickets and contacts — press ? on any page for contextual help', 'مركز المساعدة والتذاكر — اضغط ? في أي صفحة')} icon={LifeBuoy} tone="coral" />
      <Tabs className="mb-3" value={tab} onChange={(t: string) => setSp({ tab: t })} tabs={[{ value: 'help', label: L('Help center', 'مركز المساعدة') }, { value: 'tickets', label: role === 'admin' ? L('All tickets', 'كل التذاكر') : L('My tickets', 'تذاكري') }, { value: 'contact', label: L('Contact', 'التواصل') }]} />
      {tab === 'help' && <HelpCenter admin={role === 'admin'} />}
      {tab === 'tickets' && <Tickets admin={role === 'admin'} context={context} />}
      {tab === 'contact' && <Contact />}
    </div>
  );
}
