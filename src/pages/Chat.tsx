import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, Users, Plus, Search, ArrowLeft, Hash } from 'lucide-react';
import supabase from '../lib/supabase';
import { act } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Btn, Badge, Field, Input, Modal, Spinner, Empty, ErrorBox, Avatar, Segmented, useToast } from '../components/ui';
import { timeAgo, fmtTime, fmtDate } from '../lib/format';

export default function Chat() {
  const { me, role } = useAuth(); const { L, lang } = usePrefs(); const toast = useToast();
  const myId = me?.profile?.id;
  const [convs, setConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [active, setActive] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [mLoading, setMLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const activeRef = useRef<number | null>(null);
  const chanRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);
  activeRef.current = active;

  const loadList = useCallback(async () => { try { const r = await act('chat.list'); setConvs(r.conversations); setErr(''); } catch (e: any) { setErr(e.message); } finally { setLoading(false); } }, []);
  const loadMsgs = useCallback(async (id: number, silent = false) => { if (!silent) setMLoading(true); try { const r = await act('chat.messages', { conversation_id: id }); if (activeRef.current === id) setMsgs(r.messages); } catch (e: any) { toast(e.message, 'error'); } finally { setMLoading(false); } }, [toast]);
  useEffect(() => { loadList(); const t = setInterval(() => { loadList(); if (activeRef.current) loadMsgs(activeRef.current, true); }, 15000); return () => clearInterval(t); }, [loadList, loadMsgs]);
  useEffect(() => {
    const ch = supabase.channel('hrplus-chat', { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'msg' }, ({ payload }: any) => { loadList(); if (payload?.c && payload.c === activeRef.current) loadMsgs(payload.c, true); })
      .subscribe();
    chanRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [loadList, loadMsgs]);
  useEffect(() => { if (active) { setMsgs([]); loadMsgs(active); } }, [active, loadMsgs]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const send = async (e?: any) => {
    e?.preventDefault();
    const body = text.trim(); if (!body || !active) return;
    setSending(true);
    const temp = { id: `t${Date.now()}`, sender_id: myId, sender_name: me?.profile?.display_name, body, created_at: new Date().toISOString(), pending: true };
    setMsgs((m) => [...m, temp]); setText('');
    try {
      const m = await act('chat.send', { conversation_id: active, body });
      setMsgs((list) => list.map((x) => (x.id === temp.id ? m : x)));
      chanRef.current?.send({ type: 'broadcast', event: 'msg', payload: { c: active } });
      loadList();
    } catch (er: any) { setMsgs((list) => list.filter((x) => x.id !== temp.id)); setText(body); toast(er.message, 'error'); } finally { setSending(false); }
  };
  const cur = convs.find((c) => c.id === active);
  const shown = convs.filter((c) => !q || c.name?.toLowerCase().includes(q.toLowerCase()));
  const groups = useMemo(() => { const out: any[] = []; let day = ''; for (const m of msgs) { const d = (m.created_at || '').slice(0, 10); if (d !== day) { out.push({ divider: d }); day = d; } out.push(m); } return out; }, [msgs]);

  return (
    <div className="bg-surface grid grid-cols-1 md:grid-cols-[300px_1fr] h-[calc(100vh-8.5rem)] min-h-[480px]">
      <aside className={`flex flex-col min-h-0 ${active ? 'hidden md:flex' : 'flex'} bg-surface2`}>
        <div className="p-2 flex gap-1.5">
          <div className="relative flex-1"><Search size={13} className="absolute start-2 top-2.5 text-muted" /><Input className="ps-7 !h-8 text-xs" placeholder={L('Search chats', 'بحث في المحادثات')} value={q} onChange={(e: any) => setQ(e.target.value)} aria-label="Search conversations" /></div>
          <Btn size="sm" icon={Plus} onClick={() => setNewOpen(true)} aria-label={L('New conversation', 'محادثة جديدة')} />
        </div>
        <ErrorBox error={err} retry={loadList} />
        <ul className="flex-1 overflow-y-auto scroll-thin" aria-label="Conversations">
          {loading ? <Spinner /> : !shown.length ? <Empty icon={MessageSquare} title={L('No conversations', 'لا توجد محادثات')} action={<Btn size="sm" icon={Plus} onClick={() => setNewOpen(true)}>{L('Start one', 'ابدأ محادثة')}</Btn>} /> : shown.map((c) => (
            <li key={c.id}><button onClick={() => setActive(c.id)} className={`w-full text-start flex gap-2.5 px-3 py-2.5 transition ${active === c.id ? 'bg-brand/12' : 'hover:bg-ink/5'}`} aria-current={active === c.id}>
              <span className="relative">{c.is_group ? <span className="w-9 h-9 grid place-items-center bg-mint/15 text-mint"><Hash size={16} /></span> : <Avatar name={c.name} size={36} />}{!c.is_group && c.others?.[0]?.online && <span className="absolute -bottom-0.5 -end-0.5 w-3 h-3 bg-mint ring-2 ring-surface2 rounded-full" aria-label="online" />}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1"><span className={`truncate text-sm ${c.unread ? 'font-semibold' : 'font-medium'}`} dir="auto">{c.name}</span>{c.is_group && <span className="text-[0.65rem] text-muted">{c.member_count}</span>}<span className="ms-auto text-[0.65rem] text-muted shrink-0">{c.updated_at ? timeAgo(c.updated_at, lang) : ''}</span></span>
                <span className={`block text-xs truncate ${c.unread ? 'text-ink' : 'text-muted'}`} dir="auto">{c.last_sender_id === myId ? `${L('You', 'أنت')}: ` : ''}{c.last_message || L('No messages yet', 'لا توجد رسائل')}</span>
              </span>
              {c.unread && <span className="w-2.5 h-2.5 bg-coral self-center shrink-0 rounded-full" aria-label="unread" />}
            </button></li>
          ))}
        </ul>
      </aside>
      <section className={`flex flex-col min-h-0 ${active ? 'flex' : 'hidden md:flex'}`}>
        {!cur ? <div className="flex-1 grid place-items-center"><Empty icon={MessageSquare} title={L('Select a conversation', 'اختر محادثة')} hint={L('Direct messages and groups update in real time. Arabic and English messages align automatically.', 'الرسائل فورية وتدعم العربية والإنجليزية.')} /></div> : (
          <>
            <header className="flex items-center gap-2 h-14 px-3 bg-surface shrink-0 shadow-[0_1px_0_var(--line)]">
              <button className="md:hidden icon-btn w-8 h-8 grid place-items-center" onClick={() => setActive(null)} aria-label={L('Back', 'رجوع')}><ArrowLeft size={16} className="rtl:rotate-180" /></button>
              {cur.is_group ? <span className="w-9 h-9 grid place-items-center bg-mint/15 text-mint"><Users size={16} /></span> : <Avatar name={cur.name} size={36} />}
              <div className="min-w-0"><div className="font-semibold truncate" dir="auto">{cur.name}</div><div className="text-xs text-muted truncate">{cur.is_group ? L(`${cur.member_count} members`, `${cur.member_count} أعضاء`) : cur.others?.[0]?.online ? <span className="text-mint">{L('Online', 'متصل')}</span> : <span className="capitalize">{cur.others?.[0]?.role}</span>}</div></div>
            </header>
            <div className="flex-1 overflow-y-auto scroll-thin p-3 flex flex-col gap-1.5 bg-[radial-gradient(circle_at_20%_10%,color-mix(in_oklab,var(--brand)_7%,transparent),transparent_40%)]" role="log" aria-live="polite" aria-label="Messages">
              {mLoading && !msgs.length ? <Spinner /> : groups.map((m: any, i: number) => m.divider ? (
                <div key={`d${i}`} className="text-center my-2"><span className="text-[0.68rem] text-muted bg-sunken px-2 py-0.5">{fmtDate(m.divider, lang, { weekday: 'long', day: 'numeric', month: 'short' })}</span></div>
              ) : (
                <div key={m.id} className={`flex flex-col max-w-[80%] ${m.sender_id === myId ? 'self-end items-end' : 'self-start items-start'}`}>
                  {cur.is_group && m.sender_id !== myId && (groups[i - 1]?.sender_id !== m.sender_id) && <span className="text-[0.68rem] text-muted px-1">{m.sender_name}</span>}
                  <div dir="auto" className={`px-3 py-2 text-sm whitespace-pre-wrap break-words ${m.sender_id === myId ? 'bg-brand text-white' : 'bg-surface2'} ${m.pending ? 'opacity-60' : ''}`}>{m.body}</div>
                  <span className="text-[0.62rem] text-muted px-1 num">{fmtTime(m.created_at)}</span>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form onSubmit={send} className="flex gap-2 p-2 bg-surface shrink-0 shadow-[0_-1px_0_var(--line)]">
              <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} dir="auto" maxLength={4000}
                placeholder={L('Write a message… (Enter to send)', 'اكتب رسالة…')} aria-label="Message" className="flex-1 resize-none bg-surface2 px-3 py-2 text-sm outline-none ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand max-h-32" />
              <Btn type="submit" icon={Send} loading={sending} disabled={!text.trim()} aria-label={L('Send', 'إرسال')}><span className="hidden sm:inline">{L('Send', 'إرسال')}</span></Btn>
            </form>
          </>
        )}
      </section>
      <NewChat open={newOpen} onClose={() => setNewOpen(false)} canGroup={role !== 'vendor'} onCreated={(c: any) => { setNewOpen(false); loadList().then(() => setActive(c.id)); }} />
    </div>
  );
}

function NewChat({ open, onClose, onCreated, canGroup }: any) {
  const { L } = usePrefs();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('dm');
  const [sel, setSel] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setLoading(true); setSel([]); setName(''); setErr(''); act('chat.contacts').then((r) => setContacts(r.contacts)).catch((e) => setErr(e.message)).finally(() => setLoading(false)); } }, [open]);
  const shown = contacts.filter((c) => !q || `${c.name} ${c.department || ''}`.toLowerCase().includes(q.toLowerCase()));
  const create = async () => {
    setErr('');
    if (!sel.length) return setErr(L('Choose at least one person', 'اختر شخصاً واحداً على الأقل'));
    if (mode === 'group' && name.trim().length < 2) return setErr(L('Group name is required', 'اسم المجموعة مطلوب'));
    setBusy(true);
    try { const r = await act('chat.create', { member_ids: sel, is_group: mode === 'group', name }); onCreated(r.conversation); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={L('New conversation', 'محادثة جديدة')} footer={<Btn loading={busy} onClick={create}>{mode === 'group' ? L('Create group', 'إنشاء مجموعة') : L('Start chat', 'بدء المحادثة')}</Btn>}>
      {canGroup && <div className="mb-3"><Segmented value={mode} onChange={(m: string) => { setMode(m); setSel([]); }} options={[{ value: 'dm', label: L('Direct message', 'رسالة مباشرة') }, { value: 'group', label: L('Group', 'مجموعة') }]} /></div>}
      {mode === 'group' && <Field label={L('Group name', 'اسم المجموعة')} className="mb-3"><Input value={name} onChange={(e: any) => setName(e.target.value)} dir="auto" /></Field>}
      <Input placeholder={L('Search people', 'بحث عن أشخاص')} value={q} onChange={(e: any) => setQ(e.target.value)} className="mb-2" aria-label="Search people" />
      <ul className="max-h-72 overflow-y-auto scroll-thin">
        {loading ? <Spinner /> : shown.map((c) => {
          const on = sel.includes(c.id);
          return (<li key={c.id}><button onClick={() => setSel(mode === 'dm' ? [c.id] : on ? sel.filter((x) => x !== c.id) : [...sel, c.id])} className={`w-full text-start flex items-center gap-2 p-2 ${on ? 'bg-brand/12' : 'hover:bg-ink/5'}`} aria-pressed={on}>
            <Avatar name={c.name} size={30} /><span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{c.name}</span><span className="block text-xs text-muted truncate">{c.title || c.role}{c.department ? ` · ${c.department}` : ''}</span></span>
            {c.role === 'admin' && <Badge tone="coral">HR</Badge>}{c.online && <span className="w-2 h-2 bg-mint rounded-full" />}
          </button></li>);
        })}
      </ul>
      <div className="mt-2"><ErrorBox error={err} /></div>
    </Modal>
  );
}
