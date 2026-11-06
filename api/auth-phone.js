import { createClient } from '@supabase/supabase-js';
import { supabase, cors, sendError, HttpError, normPhone, audit, clientIp } from './_lib.js';

const attempts = new Map();

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const ip = clientIp(req);
    const now = Date.now();
    const a = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60000);
    if (a.length >= 10) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const phone = normPhone(req.body?.phone);
    const password = String(req.body?.password || '');
    if (!/^\+\d{9,15}$/.test(phone) || !password) throw new HttpError(400, 'Enter a valid phone number and password');
    const { data: prof } = await supabase.from('profiles').select('email,user_id,status').eq('phone', phone).not('user_id', 'is', null).limit(1);
    const fail = async () => { a.push(now); attempts.set(ip, a); await audit({ actor: phone, role: 'anonymous', ip }, 'auth.login_failed', 'phone', null, { method: 'phone' }); throw new HttpError(401, 'Invalid phone number or password'); };
    if (!prof || !prof[0] || prof[0].status === 'disabled') await fail();
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email: prof[0].email, password });
    if (error || !data.session) await fail();
    res.status(200).json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (e) { sendError(res, e); }
}
