import crypto from 'node:crypto';
import supabase, { SUPABASE_URL, SUPABASE_ANON_KEY } from './db-client.js';
import { generateKeys } from './_zatca.js';

export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY };

export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const need = (cond, msg, status = 400) => { if (!cond) throw new HttpError(status, msg); };

export function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('API error:', err);
  res.status(status).json({ error: status >= 500 ? (err.message || 'Server error') : err.message });
}

export function decodeJwt(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { return {}; }
}

export const sha256hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('05') && d.length === 10) d = '966' + d.slice(1);
  if (d.startsWith('5') && d.length === 9) d = '966' + d;
  return d ? '+' + d : '';
}

let _company = null, _companyAt = 0;
export async function getCompany(force = false) {
  if (!force && _company && Date.now() - _companyAt < 15000) return _company;
  const { data, error } = await supabase.from('company').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  _company = data || {}; _companyAt = Date.now();
  return _company;
}
export const invalidateCompany = () => { _company = null; };

export function publicCompany(c, isAdmin) {
  if (!c) return null;
  if (isAdmin) return c;
  const { settings = {}, ...rest } = c;
  const { integrations, ...safe } = settings || {};
  return { ...rest, settings: safe };
}

export const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';

export async function fetchAll(build, page = 1000) {
  let out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < page) break;
  }
  return out;
}

async function insertProfile(row) {
  const { data, error } = await supabase.from('profiles').insert({ prefs: {}, mfa_enabled: false, status: 'active', ...row }).select().single();
  if (error) {
    const { data: again } = await supabase.from('profiles').select('*').eq('user_id', row.user_id).maybeSingle();
    if (again) return again;
    throw error;
  }
  return data;
}

// Map an authenticated Supabase user onto an HRplus profile (role + linked record).
async function resolveProfile(user) {
  const { data: byUser } = await supabase.from('profiles').select('*').eq('user_id', user.id).limit(1);
  if (byUser && byUser[0]) return byUser[0];
  const email = String(user.email || '').toLowerCase().trim();
  const confirmed = !!(user.email_confirmed_at || user.confirmed_at);
  const name = user.user_metadata?.full_name || user.user_metadata?.name || (email ? email.split('@')[0] : 'User');
  if (email && confirmed) {
    const { data: pre } = await supabase.from('profiles').select('*').eq('email', email).is('user_id', null).limit(1);
    if (pre && pre[0]) {
      const { data: claimed } = await supabase.from('profiles').update({ user_id: user.id }).eq('id', pre[0].id).is('user_id', null).select().maybeSingle();
      if (claimed) return claimed;
    }
    const { data: emp } = await supabase.from('employees').select('id,full_name,phone').eq('email', email).limit(1);
    if (emp && emp[0]) return insertProfile({ user_id: user.id, email, role: 'employee', employee_id: emp[0].id, display_name: emp[0].full_name, phone: emp[0].phone });
    const { data: ven } = await supabase.from('vendors').select('id,name,phone').eq('email', email).limit(1);
    if (ven && ven[0]) return insertProfile({ user_id: user.id, email, role: 'vendor', vendor_id: ven[0].id, display_name: ven[0].name, phone: ven[0].phone });
  }
  // Unknown account: no data access until an admin links it.
  return insertProfile({ user_id: user.id, email, role: 'employee', status: 'pending', display_name: name });
}

export async function authenticate(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Unauthorized');
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user) throw new HttpError(401, 'Invalid or expired session');
  const claims = decodeJwt(token);
  const profile = await resolveProfile(user);
  if (profile.status === 'disabled') throw new HttpError(403, 'Account disabled');
  if (profile.mfa_enabled && claims.aal !== 'aal2') throw new HttpError(401, 'mfa_required');
  const company = await getCompany();
  const ctx = { user, profile, claims, company, ip: clientIp(req) };
  const timeout = Number(company?.settings?.security?.session_timeout_minutes) || 30;
  const sid = claims.session_id || '';
  const last = profile.last_seen ? Date.parse(profile.last_seen) : 0;
  const now = Date.now();
  if (sid && profile.session_id === sid && last && now - last > timeout * 60000) throw new HttpError(440, 'session_expired');
  if (profile.session_id !== sid || now - last > 60000) {
    const fresh = profile.session_id !== sid;
    await supabase.from('profiles').update({ session_id: sid, last_seen: new Date(now).toISOString() }).eq('id', profile.id);
    profile.session_id = sid; profile.last_seen = new Date(now).toISOString();
    if (fresh) await audit(ctx, 'auth.login', 'session', sid.slice(0, 8), { aal: claims.aal, methods: (claims.amr || []).map((a) => a.method) });
  }
  return ctx;
}

export function requireRole(ctx, ...roles) {
  if (!roles.includes(ctx.profile.role)) throw new HttpError(403, 'Forbidden');
}

export async function audit(ctx, action, resource, recordId, details) {
  try {
    await supabase.from('audit_logs').insert({
      actor_profile_id: ctx?.profile?.id ?? null,
      actor_email: ctx?.profile?.email ?? ctx?.actor ?? null,
      actor_role: ctx?.profile?.role ?? ctx?.role ?? null,
      action, resource, record_id: recordId != null ? String(recordId) : null,
      details: details || {}, ip: ctx?.ip || null,
    });
  } catch (e) { console.error('audit failed', e); }
}

// Records that must survive deletion for compliance and audit reasons. Deleting
// the parent silently orphans them (and Saudi Labor Law requires payroll records
// to be kept for 5 years), so writes that would do it are refused instead.
const RETAINED = {
  employees: [
    ['payslips', 'employee_id', 'payroll'],
    ['attendance', 'employee_id', 'attendance'],
    ['timesheets', 'employee_id', 'timesheet'],
    ['documents', 'employee_id', 'document'],
    ['rule_acks', 'employee_id', 'policy acknowledgement'],
  ],
  vendors: [
    ['invoices', 'vendor_id', 'invoice'],
    ['timesheets', 'vendor_id', 'timesheet'],
  ],
};

export async function assertRetainable(table, id) {
  const deps = RETAINED[table];
  if (!deps) return;
  const counts = await Promise.all(deps.map(([t, col]) => supabase.from(t).select('id', { count: 'exact', head: true }).eq(col, id)));
  const parts = [];
  counts.forEach((r, i) => { const n = r?.count || 0; if (n) parts.push(`${n} ${deps[i][2]} record(s)`); });
  if (!parts.length) return;
  const entity = table === 'employees' ? 'employee' : 'vendor';
  const hint = table === 'employees' ? ' Set the status to "Terminated" instead.' : ' Revoke the vendor instead.';
  throw new HttpError(409, `Cannot delete this ${entity}: ${parts.join(', ')} still reference it and must be retained.${hint}`);
}

export async function notify(profileIds, n) {
  const ids = [...new Set((profileIds || []).filter(Boolean))];
  if (!ids.length) return;
  const t = Array.isArray(n.title) ? n.title : [n.title, n.title];
  const b = Array.isArray(n.body) ? n.body : [n.body || '', n.body || ''];
  await supabase.from('notifications').insert(ids.map((id) => ({ profile_id: id, title: t[0], title_ar: t[1], body: b[0], body_ar: b[1], link: n.link || null, level: n.level || 'info', read: false })));
}
export async function notifyAdmins(n, exceptId) {
  const { data } = await supabase.from('profiles').select('id').eq('role', 'admin').neq('status', 'disabled');
  await notify((data || []).map((p) => p.id).filter((id) => id !== exceptId), n);
}
export async function notifyEmployee(empId, n) {
  if (!empId) return;
  const { data } = await supabase.from('profiles').select('id').eq('employee_id', empId);
  await notify((data || []).map((p) => p.id), n);
}
export async function notifyVendor(vendorId, n) {
  if (!vendorId) return;
  const { data } = await supabase.from('profiles').select('id').eq('vendor_id', vendorId);
  await notify((data || []).map((p) => p.id), n);
}

export async function fireWebhooks(event, payload, onlyId) {
  try {
    let q = supabase.from('webhooks').select('*').eq('active', true);
    if (onlyId) q = supabase.from('webhooks').select('*').eq('id', onlyId);
    const { data: hooks } = await q;
    const targets = (hooks || []).filter((h) => onlyId || (h.events || []).includes(event) || (h.events || []).includes('*'));
    await Promise.allSettled(targets.map(async (h) => {
      const body = JSON.stringify({ event, created_at: new Date().toISOString(), data: payload });
      const sig = crypto.createHmac('sha256', h.secret || '').update(body).digest('hex');
      let status = 'error';
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3500);
        const r = await fetch(h.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'HRplus-Webhooks/1.0', 'X-HRplus-Event': event, 'X-HRplus-Signature': `sha256=${sig}` }, body, signal: ctrl.signal });
        clearTimeout(t); status = String(r.status);
      } catch (e) { status = 'error: ' + (e.name === 'AbortError' ? 'timeout' : e.message); }
      await supabase.from('webhooks').update({ last_status: status, last_fired_at: new Date().toISOString() }).eq('id', h.id);
    }));
    return targets.length;
  } catch (e) { console.error('webhook failed', e); return 0; }
}

export async function getZatcaKeys() {
  const { data } = await supabase.from('secrets').select('value').eq('key', 'zatca_ec').maybeSingle();
  if (data?.value) return JSON.parse(data.value);
  const keys = generateKeys();
  await supabase.from('secrets').insert({ key: 'zatca_ec', value: JSON.stringify(keys) });
  return keys;
}
