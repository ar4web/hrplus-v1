import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, ShieldCheck, UserRound, Handshake, Lock, Eye, EyeOff, Languages, Sun, Moon, KeyRound, ArrowRight, Loader2, Check } from 'lucide-react';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { Btn, Field, Input, Segmented, ErrorBox } from '../components/ui';

const DEMO: any = { admin: { email: 'admin@hrplus.sa', phone: '+966500000001' }, employee: { email: 'employee@hrplus.sa', phone: '+966500000003' }, vendor: { email: 'vendor@hrplus.sa', phone: '+966500000005' } };
const DEMO_PW = 'HRplus@2026';

export function passwordIssues(pw: string, L: any) {
  const out: string[] = [];
  if (pw.length < 10) out.push(L('at least 10 characters', '10 أحرف على الأقل'));
  if (!/[A-Z]/.test(pw)) out.push(L('an uppercase letter', 'حرف كبير'));
  if (!/[a-z]/.test(pw)) out.push(L('a lowercase letter', 'حرف صغير'));
  if (!/\d/.test(pw)) out.push(L('a number', 'رقم'));
  if (!/[^A-Za-z0-9]/.test(pw)) out.push(L('a symbol', 'رمز'));
  return out;
}

function MfaStep() {
  const { L } = usePrefs();
  const { signOut, reloadMe } = useAuth();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const verify = async (e: any) => {
    e.preventDefault(); setErr('');
    if (!/^\d{6}$/.test(code)) { setErr(L('Enter the 6-digit code from your authenticator app', 'أدخل الرمز المكون من 6 أرقام')); return; }
    setBusy(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const f = data?.totp?.find((x: any) => x.status === 'verified');
      if (!f) throw new Error('No authenticator enrolled');
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
      if (error) throw error;
      await reloadMe();
    } catch (e: any) { setErr(e.message || 'Verification failed'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      <div className="flex items-center gap-3"><span className="w-11 h-11 grid place-items-center bg-brand/12 text-brand"><KeyRound size={20} /></span><div><h2 className="font-display text-xl font-semibold">{L('Two-step verification', 'التحقق بخطوتين')}</h2><p className="text-sm text-muted">{L('Enter the code from your authenticator app.', 'أدخل الرمز من تطبيق المصادقة.')}</p></div></div>
      <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e: any) => setCode(e.target.value.replace(/\D/g, ''))} className="!h-14 text-center text-2xl tracking-[0.5em] font-display num" aria-label="6-digit code" autoFocus />
      <ErrorBox error={err} />
      <Btn type="submit" size="lg" loading={busy} icon={ShieldCheck}>{L('Verify & continue', 'تحقق ومتابعة')}</Btn>
      <button type="button" className="text-sm text-muted hover:underline" onClick={() => signOut()}>{L('Use a different account', 'استخدام حساب آخر')}</button>
    </form>
  );
}

export default function Login() {
  const { L, prefs, setPrefs, isDark, lang } = usePrefs();
  const { mfaNeeded, session, notice, setNotice, error: authError } = useAuth();
  const [role, setRole] = useState<'employee' | 'vendor' | 'admin'>('employee');
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [brand, setBrand] = useState<any>(null);
  useEffect(() => { fetch('/api/me?public=1').then((r) => r.json()).then((d) => setBrand(d.company)).catch(() => {}); }, []);
  useEffect(() => { if (notice === 'expired') setInfo(L('Your session expired due to inactivity. Please sign in again.', 'انتهت جلستك بسبب عدم النشاط. يرجى تسجيل الدخول مجدداً.')); }, [notice, L]);

  const fillDemo = () => { setEmail(DEMO[role].email); setPhone(DEMO[role].phone); setPassword(DEMO_PW); setMode('signin'); setErr(''); };
  const submit = async (e: any) => {
    e.preventDefault(); setErr(''); setInfo(''); setNotice('');
    try {
      setBusy(true);
      if (mode === 'reset') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(L('Enter a valid email', 'أدخل بريداً صحيحاً'));
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setInfo(L('If an account exists, a reset link has been sent.', 'إن وُجد حساب، فقد أُرسل رابط إعادة التعيين.'));
        return;
      }
      if (method === 'phone' && mode === 'signin') {
        if (!/^\+?\d[\d\s-]{8,}$/.test(phone)) throw new Error(L('Enter a valid Saudi mobile number', 'أدخل رقم جوال صحيح'));
        const r = await fetch('/api/auth-phone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        const { error } = await supabase.auth.setSession(d);
        if (error) throw error;
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(L('Enter a valid email', 'أدخل بريداً صحيحاً'));
      if (!password) throw new Error(L('Password is required', 'كلمة المرور مطلوبة'));
      if (mode === 'signup') {
        const issues = passwordIssues(password, L);
        if (issues.length) throw new Error(L('Password needs ', 'كلمة المرور تحتاج ') + issues.join(', '));
        if (name.trim().length < 2) throw new Error(L('Enter your full name', 'أدخل اسمك الكامل'));
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setInfo(L('Check your inbox to confirm your email, then sign in. HR will link your account to your record.', 'تحقق من بريدك لتأكيد الحساب ثم سجّل الدخول.'));
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? L('Incorrect email or password', 'البريد أو كلمة المرور غير صحيحة') : error.message);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const roles = [
    { value: 'employee', label: L('Employee', 'موظف'), icon: UserRound, tone: 'sky', hint: L('Attendance, leave, payslips, expenses & documents — only your own records.', 'الحضور والإجازات والرواتب والمصروفات — سجلاتك فقط.') },
    { value: 'vendor', label: L('Vendor', 'مورد'), icon: Handshake, tone: 'violet', hint: L('Your invoices with ZATCA QR, consultant timesheets & messages — only your account.', 'فواتيرك وسجلات الساعات والرسائل — حسابك فقط.') },
    { value: 'admin', label: L('Admin', 'مسؤول'), icon: ShieldCheck, tone: 'coral', hint: L('Full control: workforce, payroll, compliance, invoicing and settings.', 'تحكم كامل: القوى العاملة والرواتب والامتثال والإعدادات.') },
  ];
  const cur = roles.find((r) => r.value === role)!;
  const features = [['GOSI', 'التأمينات', 'mint'], ['WPS / Mudad', 'حماية الأجور', 'sky'], ['ZATCA e-invoice', 'فاتورة', 'coral'], ['Iqama tracking', 'متابعة الإقامات', 'amber'], ['EOSB', 'مكافأة نهاية الخدمة', 'violet'], ['VAT 15%', 'ضريبة 15%', 'rose']];

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative overflow-hidden bg-brand text-white p-8 lg:p-12 flex flex-col justify-between min-h-[300px]" aria-hidden={false}>
        <svg className="absolute inset-0 w-full h-full opacity-[0.13]" aria-hidden><defs><pattern id="star" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M40 4l10 26 26 10-26 10-10 26-10-26L4 40l26-10z" fill="none" stroke="#fff" strokeWidth="1.2" /><rect x="26" y="26" width="28" height="28" transform="rotate(45 40 40)" fill="none" stroke="#fff" /></pattern></defs><rect width="100%" height="100%" fill="url(#star)" /></svg>
        <div className="absolute -bottom-24 -end-24 w-96 h-96 bg-brand2 opacity-30 rotate-45" aria-hidden />
        <div className="absolute top-1/3 -start-16 w-56 h-56 bg-coral opacity-20 rotate-12" aria-hidden />
        <div className="relative flex items-center gap-3">
          {brand?.logo_url ? <img src={brand.logo_url} alt="" className="w-11 h-11 object-contain bg-white p-1" /> : <span className="w-11 h-11 bg-white text-brand grid place-items-center font-display font-bold text-xl relative">H<span className="absolute -top-1.5 -end-1.5 w-5 h-5 bg-brand2 text-[#2a1d00] text-xs grid place-items-center">+</span></span>}
          <div><div className="font-display font-bold text-2xl leading-none">HRplus</div><div className="text-sm opacity-80 mt-1">{L(brand?.legal_name_en || 'Saudi HRMS', brand?.legal_name_ar || 'نظام الموارد البشرية')}</div></div>
        </div>
        <div className="relative my-10">
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="font-display text-3xl lg:text-5xl font-semibold leading-tight max-w-xl">{L('One HR platform. Three experiences. Zero data leaks.', 'منصة واحدة. ثلاث تجارب. خصوصية تامة.')}</motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} transition={{ delay: 0.15 }} className="mt-4 text-base lg:text-lg max-w-lg">{L('Built for the Kingdom — Saudi Labor Law, GOSI, WPS, ZATCA and Iqama compliance out of the box, in Arabic and English.', 'مصمم للمملكة — نظام العمل والتأمينات وحماية الأجور والفوترة الإلكترونية والإقامات، بالعربية والإنجليزية.')}</motion.p>
          <div className="flex flex-wrap gap-2 mt-6">
            {features.map(([en, ar], i) => <motion.span key={en} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.06 }} className="px-2.5 py-1 text-xs font-medium bg-white/15 backdrop-blur">{L(en, ar)}</motion.span>)}
          </div>
        </div>
        <div className="relative text-xs opacity-75">{L('Protected by role-based access, MFA, audit logs and session expiry.', 'محمي بصلاحيات الأدوار والتحقق الثنائي وسجلات التدقيق وانتهاء الجلسة.')}</div>
      </section>

      <section className="flex flex-col p-5 sm:p-8 lg:p-12 bg-surface">
        <div className="flex justify-end gap-1">
          <Btn variant="ghost" size="sm" icon={Languages} onClick={() => setPrefs({ lang: lang === 'ar' ? 'en' : 'ar' })}>{lang === 'ar' ? 'English' : 'العربية'}</Btn>
          <Btn variant="ghost" size="sm" icon={isDark ? Sun : Moon} onClick={() => setPrefs({ theme: isDark ? 'light' : 'dark' })} aria-label="Toggle theme" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md py-6">
            {session && mfaNeeded ? <MfaStep /> : (
              <>
                <h2 className="font-display text-2xl font-semibold">{mode === 'signup' ? L('Create your account', 'إنشاء حساب') : mode === 'reset' ? L('Reset password', 'إعادة تعيين كلمة المرور') : L('Sign in to HRplus', 'تسجيل الدخول إلى HRplus')}</h2>
                <p className="text-sm text-muted mt-1">{L('Choose your portal', 'اختر بوابتك')}</p>
                <div className="grid grid-cols-3 gap-1.5 mt-4" role="radiogroup" aria-label="Portal">
                  {roles.map((r) => (
                    <button key={r.value} role="radio" aria-checked={role === r.value} onClick={() => setRole(r.value as any)} className={`flex flex-col items-center gap-1 py-3 text-sm font-medium transition ${role === r.value ? 'bg-brand/15 text-brand ring-2 ring-inset ring-current' : 'bg-surface2 text-muted hover:text-ink'}`}>
                      <r.icon size={20} aria-hidden />{r.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted mt-2 min-h-[2.5em]">{cur.hint}</p>

                {mode === 'signin' && <div className="mt-3"><Segmented value={method} onChange={setMethod} label="Sign-in method" size="md" options={[{ value: 'email', label: L('Email', 'البريد'), icon: Mail }, { value: 'phone', label: L('Phone', 'الجوال'), icon: Phone }]} /></div>}

                <form onSubmit={submit} className="flex flex-col gap-3 mt-4" noValidate>
                  {mode === 'signup' && <Field label={L('Full name', 'الاسم الكامل')} htmlFor="nm"><Input id="nm" value={name} onChange={(e: any) => setName(e.target.value)} autoComplete="name" /></Field>}
                  {(method === 'email' || mode !== 'signin') ? (
                    <Field label={L('Work email', 'البريد الإلكتروني')} htmlFor="em"><Input id="em" type="email" dir="ltr" value={email} onChange={(e: any) => setEmail(e.target.value)} autoComplete="email" placeholder="name@company.sa" /></Field>
                  ) : (
                    <Field label={L('Mobile number', 'رقم الجوال')} htmlFor="ph" hint={L('Saudi format, e.g. +9665XXXXXXXX or 05XXXXXXXX', 'مثال: 05XXXXXXXX')}><Input id="ph" type="tel" dir="ltr" value={phone} onChange={(e: any) => setPhone(e.target.value)} autoComplete="tel" placeholder="+966 5X XXX XXXX" /></Field>
                  )}
                  {mode !== 'reset' && (
                    <Field label={L('Password', 'كلمة المرور')} htmlFor="pw">
                      <div className="relative"><Input id="pw" type={show ? 'text' : 'password'} dir="ltr" value={password} onChange={(e: any) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="pe-10" />
                        <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-0 top-0 h-9 w-9 grid place-items-center text-muted" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
                      {mode === 'signup' && password && (
                        <ul className="grid grid-cols-2 gap-x-2 text-[0.7rem] mt-1">{[['10+ chars', password.length >= 10], ['A–Z', /[A-Z]/.test(password)], ['a–z', /[a-z]/.test(password)], ['0–9', /\d/.test(password)], ['symbol', /[^A-Za-z0-9]/.test(password)]].map(([l, ok]: any) => <li key={l} className={ok ? 'text-mint' : 'text-muted'}><Check size={10} className="inline" /> {l}</li>)}</ul>
                      )}
                    </Field>
                  )}
                  {(err || authError) && <ErrorBox error={err || authError} />}
                  {info && <div className="p-3 text-sm bg-sky/12 text-sky" role="status">{info}</div>}
                  <Btn type="submit" size="lg" loading={busy} icon={mode === 'reset' ? Mail : Lock}>{mode === 'signup' ? L('Create account', 'إنشاء حساب') : mode === 'reset' ? L('Send reset link', 'إرسال الرابط') : L(`Sign in as ${cur.label}`, `دخول كـ${cur.label}`)}</Btn>
                </form>

                {mode === 'signin' && (
                  <>
                    <div className="flex items-center gap-3 my-4 text-xs text-muted"><span className="flex-1 h-px bg-line" />{L('or', 'أو')}<span className="flex-1 h-px bg-line" /></div>
                    <Btn variant="subtle" size="lg" className="w-full" onClick={() => signInWithGoogle('HRplus')}>
                      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
                      {L('Continue with Google', 'المتابعة باستخدام Google')}
                    </Btn>
                    <button onClick={fillDemo} className="w-full mt-3 p-3 bg-brand2/15 text-start text-xs flex items-center gap-2 hover:bg-brand2/25">
                      <span className="w-7 h-7 grid place-items-center bg-brand2 text-[#2a1d00] shrink-0"><ArrowRight size={14} className="rtl:rotate-180" /></span>
                      <span><b>{L(`Use demo ${cur.label} account`, `استخدم حساب ${cur.label} التجريبي`)}</b><br /><span className="text-muted" dir="ltr">{method === 'phone' ? DEMO[role].phone : DEMO[role].email} · {DEMO_PW}</span></span>
                    </button>
                  </>
                )}
                <div className="flex justify-between mt-5 text-sm">
                  {mode === 'signin' ? <button className="text-brand hover:underline" onClick={() => setMode('signup')}>{L('Create account', 'إنشاء حساب')}</button> : <button className="text-brand hover:underline" onClick={() => setMode('signin')}>{L('Back to sign in', 'العودة لتسجيل الدخول')}</button>}
                  {mode === 'signin' && <button className="text-muted hover:underline" onClick={() => setMode('reset')}>{L('Forgot password?', 'نسيت كلمة المرور؟')}</button>}
                </div>
                <p className="text-[0.7rem] text-muted mt-6 flex items-start gap-1.5"><ShieldCheck size={13} className="shrink-0 mt-0.5 text-mint" />{L('Your portal is determined by your account role on the server — selecting a tab never grants extra access.', 'يُحدد الوصول حسب دور حسابك في الخادم — اختيار البوابة لا يمنح صلاحيات إضافية.')}</p>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export function Splash() {
  return <div className="min-h-screen grid place-items-center"><div className="flex flex-col items-center gap-3"><span className="w-12 h-12 bg-brand text-white grid place-items-center font-display font-bold text-xl relative">H<span className="absolute -top-1.5 -end-1.5 w-5 h-5 bg-brand2 text-[#2a1d00] text-xs grid place-items-center">+</span></span><Loader2 className="animate-spin text-brand" /></div></div>;
}
