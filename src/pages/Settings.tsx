import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings as Cog, Save, Lock, Database, Download, RotateCcw, Link, Timer } from 'lucide-react';
import supabase from '../lib/supabase';
import { act, updateRes } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Card, Btn, Field, Input, Select, Tabs, Toggle, PageHeader, useToast, Table, useData, Badge, ErrorBox } from '../components/ui';
import { fmtDateTime } from '../lib/format';

export default function Settings() {
  const { me, role, reloadMe, setCompany } = useAuth();
  const { L, prefs, savePrefs, lang } = usePrefs();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'profile';
  const [demoLink, setDemoLink] = useState<string | null>(null);
  const [demoUrl, setDemoUrl] = useState<string | null>(null);
  const admin = role === 'admin';
  const [name, setName] = useState(me?.profile?.display_name || '');
  const [phone, setPhone] = useState(me?.profile?.phone || '');
  const [pw, setPw] = useState('');
  const [mfa, setMfa] = useState<any>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [timeout, setTo] = useState(me?.company?.settings?.security?.session_timeout_minutes || 30);
  const [backups, setBackups] = useState<any[]>([]);
  const [restore, setRestore] = useState<any>(null);
  const users = useData(admin && tab === 'users' ? 'profiles' : null);
  const logs = useData(admin && tab === 'audit' ? 'audit_logs' : null, { limit: 200 });
  useEffect(() => { if (admin && tab === 'backup') act('backup.list').then((r) => setBackups(r.files)).catch(() => {}); }, [tab, admin]);
  const p = async (patch: any) => { await savePrefs(patch); toast(L('Saved', 'تم الحفظ')); };
  return (
    <div>
      <PageHeader title={L('Settings', 'الإعدادات')} icon={Cog} tone="slate" />
      <Tabs className="mb-3" value={tab} onChange={(t: string) => setSp({ tab: t })} tabs={[{ value: 'profile', label: L('Profile', 'الملف') }, { value: 'appearance', label: L('Appearance', 'المظهر') }, { value: 'accessibility', label: L('Accessibility', 'إمكانية الوصول') }, { value: 'security', label: L('Security', 'الأمان') }, admin && { value: 'users', label: L('Users', 'المستخدمون') }, admin && { value: 'backup', label: L('Backup', 'النسخ الاحتياطي') }, admin && { value: 'audit', label: L('Audit log', 'سجل التدقيق') }, admin && { value: 'demo', label: L('Demo access', 'الوصول التجريبي') }]} />
      {tab === 'profile' && <Card title={L('Profile', 'الملف')}><div className="grid gap-3 max-w-md"><Field label={L('Display name', 'الاسم')}><Input value={name} onChange={(e: any) => setName(e.target.value)} /></Field><Field label={L('Phone', 'الجوال')}><Input dir="ltr" value={phone} onChange={(e: any) => setPhone(e.target.value)} /></Field><Btn icon={Save} onClick={async () => { try { await act('profile.update', { display_name: name, phone }); await reloadMe(); toast(L('Saved', 'تم الحفظ')); } catch (e: any) { toast(e.message, 'error'); } }}>{L('Save', 'حفظ')}</Btn></div></Card>}
      {tab === 'appearance' && <Card title={L('Appearance', 'المظهر')}><div className="grid gap-3 max-w-md"><Field label={L('Theme', 'السمة')}><Select value={prefs.theme} onChange={(e: any) => p({ theme: e.target.value })}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></Select></Field><Field label={L('Language', 'اللغة')}><Select value={prefs.lang} onChange={(e: any) => p({ lang: e.target.value })}><option value="en">English</option><option value="ar">العربية</option></Select></Field><Field label={L('Density', 'الكثافة')}><Select value={prefs.density} onChange={(e: any) => p({ density: e.target.value })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></Select></Field></div></Card>}
      {tab === 'accessibility' && <Card title={L('Accessibility', 'إمكانية الوصول')}><div className="grid gap-2 max-w-md"><Field label={`${L('Font size', 'حجم الخط')} ${Math.round(prefs.fontScale * 100)}%`}><input type="range" min="0.85" max="1.4" step="0.05" value={prefs.fontScale} onChange={(e) => p({ fontScale: Number(e.target.value) })} aria-label="Font size" /></Field><Toggle label={L('High contrast', 'تباين عالٍ')} checked={prefs.highContrast} onChange={(v: boolean) => p({ highContrast: v })} /><Toggle label={L('Reduce motion', 'تقليل الحركة')} checked={prefs.reduceMotion} onChange={(v: boolean) => p({ reduceMotion: v })} /><Toggle label={L('Large touch targets (44px)', 'أهداف لمس كبيرة')} checked={prefs.largeTargets} onChange={(v: boolean) => p({ largeTargets: v })} /><Toggle label={L('Keyboard shortcuts (Alt+1–9, Alt+L, Alt+T, ?)', 'اختصارات لوحة المفاتيح')} checked={prefs.shortcuts} onChange={(v: boolean) => p({ shortcuts: v })} /><Toggle label={L('Screen reader announcements', 'إعلانات قارئ الشاشة')} checked={prefs.announce} onChange={(v: boolean) => p({ announce: v })} /></div></Card>}
      {tab === 'security' && <div className="grid gap-3 lg:grid-cols-2">
        <Card title={L('Two-factor authentication (TOTP)', 'التحقق الثنائي')} icon={Lock}>
          <p className="text-sm mb-2">{me?.profile?.mfa_enabled ? <Badge tone="mint">Enabled</Badge> : <Badge tone="amber">Disabled</Badge>}</p>
          {!mfa ? <div className="flex gap-2"><Btn onClick={async () => { setErr(''); const { data: f } = await supabase.auth.mfa.listFactors(); for (const x of (f?.all || []).filter((x: any) => x.status === 'unverified')) await supabase.auth.mfa.unenroll({ factorId: x.id }); const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'HRplus ' + Date.now() }); if (error) setErr(error.message); else setMfa(data); }}>{L('Set up authenticator', 'إعداد المصادقة')}</Btn>{me?.profile?.mfa_enabled && <Btn variant="dangerSoft" onClick={async () => { const { data } = await supabase.auth.mfa.listFactors(); for (const x of data?.totp || []) { const { error } = await supabase.auth.mfa.unenroll({ factorId: x.id }); if (error) { setErr(error.message); return; } } await act('mfa.sync'); await reloadMe(); toast('MFA disabled'); }}>{L('Disable', 'تعطيل')}</Btn>}</div>
            : <div className="grid gap-2"><img src={mfa.totp.qr_code} alt="QR" className="w-44 h-44 bg-white" /><code className="text-xs break-all">{mfa.totp.secret}</code><Input placeholder="123456" value={code} onChange={(e: any) => setCode(e.target.value)} /><Btn onClick={async () => { const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfa.id, code }); if (error) { setErr(error.message); return; } await act('mfa.sync'); await reloadMe(); setMfa(null); toast('MFA enabled'); }}>{L('Verify', 'تحقق')}</Btn></div>}
          <ErrorBox error={err} />
        </Card>
        <Card title={L('Change password', 'تغيير كلمة المرور')}><div className="grid gap-2"><Input type="password" value={pw} onChange={(e: any) => setPw(e.target.value)} /><Btn onClick={async () => { if (pw.length < 10 || !/[A-Z]/.test(pw) || !/\d/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) { toast(L('Min 10 chars incl. uppercase, number, symbol', 'كلمة مرور ضعيفة'), 'error'); return; } const { error } = await supabase.auth.updateUser({ password: pw }); if (error) toast(error.message, 'error'); else { setPw(''); toast(L('Password updated', 'تم التحديث')); } }}>{L('Update', 'تحديث')}</Btn><Btn variant="subtle" onClick={() => supabase.auth.signOut({ scope: 'global' })}>{L('Sign out all sessions', 'تسجيل الخروج من كل الأجهزة')}</Btn></div></Card>
        {admin && <Card title={L('Company security policy', 'سياسة الأمان')}><div className="grid gap-2"><Field label={L('Session idle timeout (minutes)', 'مهلة الجلسة (دقائق)')}><Input type="number" min="5" max="480" value={timeout} onChange={(e: any) => setTo(e.target.value)} /></Field><Toggle label={L('Require MFA for admins', 'إلزام المسؤولين بالتحقق الثنائي')} checked={!!me?.company?.settings?.security?.require_mfa_admin} onChange={async (v: boolean) => { const r = await updateRes('company', 1, { settings: { security: { ...(me?.company?.settings?.security || {}), require_mfa_admin: v } } }); setCompany(r); toast('Saved'); }} /><Btn icon={Save} onClick={async () => { const r = await updateRes('company', 1, { settings: { security: { ...(me?.company?.settings?.security || {}), session_timeout_minutes: Number(timeout) } } }); setCompany(r); toast('Saved'); }}>{L('Save', 'حفظ')}</Btn></div></Card>}
      </div>}
      {tab === 'users' && admin && <Card pad={false} title={L('Users & roles', 'المستخدمون والأدوار')}><Table rows={users.data} columns={[{ key: 'display_name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role', render: (u: any) => <Select className="!h-8 !w-auto text-xs" value={u.role} disabled={u.id === me?.profile?.id} onChange={async (e: any) => { try { await updateRes('profiles', u.id, { role: e.target.value }); users.reload(true); toast('Saved'); } catch (er: any) { toast(er.message, 'error'); } }}><option>admin</option><option>employee</option><option>vendor</option></Select> }, { key: 'status', label: 'Status', render: (u: any) => <Select className="!h-8 !w-auto text-xs" value={u.status} disabled={u.id === me?.profile?.id} onChange={async (e: any) => { try { await updateRes('profiles', u.id, { status: e.target.value }); users.reload(true); toast('Saved'); } catch (er: any) { toast(er.message, 'error'); } }}><option>active</option><option>pending</option><option>disabled</option></Select> }, { key: 'mfa', label: 'MFA', render: (u: any) => u.mfa_enabled ? <Badge tone="mint">on</Badge> : <Badge>off</Badge> }, { key: 'claimed', label: 'Signed up', render: (u: any) => u.user_id ? '✓' : '—' }]} /></Card>}
      {tab === 'backup' && admin && <Card title={L('Backups', 'النسخ الاحتياطي')} icon={Database}><Btn onClick={async () => { try { const r = await act('backup.create'); toast(`Backup ${r.name} created`); const l = await act('backup.list'); setBackups(l.files); } catch (e: any) { toast(e.message, 'error'); } }}>{L('Create backup now', 'إنشاء نسخة الآن')}</Btn><ul className="mt-3 text-sm">{backups.map((b) => <li key={b.name} className="flex justify-between py-1"><span>{b.name}</span><div className="flex gap-2"><Btn size="xs" variant="soft" icon={Download} onClick={async () => { const r = await act('backup.download', { name: b.name }); window.open(r.url, '_blank'); }}>Download</Btn><Btn size="xs" variant="ghost" icon={RotateCcw} onClick={async () => { try { const plan = await act('backup.restore', { name: b.name, dry_run: true }); setRestore(plan); } catch (e: any) { toast(e.message, 'error'); } }}>{L('Restore', 'استعادة')}</Btn></div></li>)}</ul>
        {restore && <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm" data-testid="restore-preview">
          <div className="font-medium">{L('Review before restoring', 'راجع قبل الاستعادة')} — {restore.name}</div>
          <div className="opacity-80 mt-1">{L('This backup would add', 'ستضيف هذه النسخة')} {Object.values<any>(restore.tables).reduce((n, t) => n + t.new, 0)} {L('rows and update', 'صفًا وتحدّث')} {Object.values<any>(restore.tables).reduce((n, t) => n + t.existing, 0)}.</div>
          <div className="max-h-40 overflow-auto mt-2 text-xs">
            <table className="w-full"><thead><tr><th className="text-start">{L('Table', 'الجدول')}</th><th>{L('New', 'جديد')}</th><th>{L('Update', 'تحديث')}</th></tr></thead><tbody>
              {Object.entries(restore.tables).filter(([, t]: any) => t.in_backup).map(([name, t]: any) => <tr key={name}><td>{name}</td><td className="text-center">{t.new}</td><td className="text-center">{t.existing}</td></tr>)}
            </tbody></table>
          </div>
          <div className="flex gap-2 mt-3"><Btn size="xs" onClick={async () => { try { const r = await act('backup.restore', { name: restore.name, mode: 'merge' }); toast(`${r.rows_written} rows restored`); setRestore(null); const l = await act('backup.list'); setBackups(l.files); } catch (e: any) { toast(e.message, 'error'); } }}>{L('Restore (merge)', 'استعادة (دمج)')}</Btn><Btn size="xs" variant="ghost" onClick={() => setRestore(null)}>{L('Cancel', 'إلغاء')}</Btn></div>
        </div>}
      </Card>}
      {tab === 'audit' && admin && <Card pad={false} title={L('Audit log', 'سجل التدقيق')}><Table dense rows={logs.data} columns={[{ key: 'at', label: 'When', render: (l: any) => <span className="text-xs">{fmtDateTime(l.created_at, lang)}</span> }, { key: 'actor_email', label: 'Actor' }, { key: 'action', label: 'Action' }, { key: 'resource', label: 'Resource' }, { key: 'record_id', label: 'Record' }, { key: 'ip', label: 'IP' }]} /></Card>}
      {tab === 'demo' && admin && <Card title={L('Demo access links', 'روابط الوصول التجريبي')} icon={Link}>
        <p className="text-sm text-muted mb-4">{L('Create a one-time demo link that an administrator can use to enter demo mode. The link expires after 24 hours or after first use.', 'أنشئ رابطًا تجريبيًا لاستخدام واحد يمكن لمشرف استخدامه للدخول إلى الوضع التجريبي. تنتهي صلاحية الرابط بعد 24 ساعة أو بعد الاستخدام الأول.')}</p>
        <div className="flex gap-2 mb-4">
          <Btn icon={Timer} onClick={async () => { try { const r = await act('demo.generate'); setDemoLink(r.token); setDemoUrl(r.url); toast(L('Demo link created', 'تم إنشاء الرابط التجريبي')); } catch (e: any) { toast(e.message, 'error'); } }}>{L('Generate demo link', 'إنشاء رابط تجريبي')}</Btn>
        </div>
        {demoLink && <div className="bg-surface2 rounded p-3 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-brand">{L('Token:', 'الرمز:')}</span>
            <div className="flex-1"><code className="text-xs text-muted block truncate">{demoLink}</code></div>
            <Btn size="xs" variant="ghost" onClick={() => { navigator.clipboard.writeText(demoLink); toast(L('Copied', 'تم النسخ')); }}>{L('Copy', 'نسخ')}</Btn>
          </div>
          <div className="flex items-start gap-3 mt-2">
            <span className="text-brand">{L('Share URL:', 'الرابط:')}</span>
            <div className="flex-1"><code className="text-xs text-muted block truncate">{demoUrl}</code></div>
            <Btn size="xs" variant="ghost" onClick={() => { navigator.clipboard.writeText(demoUrl); toast(L('Copied', 'تم النسخ')); }}>{L('Copy', 'نسخ')}</Btn>
          </div>
          <p className="text-xs text-muted mt-2">{L('Send this URL to the person who needs demo access. They open it, paste the token on the login screen, and get temporary admin demo access.', 'أرسل هذا الرابط إلى الشخص الذي يحتاج إلى وصول تجريبي. يفتحه، يلصق الرمز في شاشة تسجيل الدخول، وي obtient وصولاً تجريبيًا مؤقتًا للمشرف.')}</p>
        </div>}
      </Card>}
    </div>
  );
}
