// Generic, role-scoped resource router. Every read is filtered server-side by role:
//   admin → everything; employee → own employee_id; vendor → own vendor_id.
// Writes through this router are admin-only; self-service writes go through /api/actions.
import { supabase, cors, authenticate, HttpError, sendError, audit, invalidateCompany, fireWebhooks, publicCompany, getCompany, assertRetainable } from './_lib.js';

const ALL = () => [];
const own = (col, key, extra = []) => (p) => (p[key] == null || p[key] === '' ? null : [[col, p[key]], ...extra]);
const COL = /^[a-z_]+$/;
const EMBEDS = ['employees', 'vendors', 'leave_types', 'expense_categories', 'rules', 'payroll_runs', 'receipt_url', 'profiles'];

const R = {
  company: { read: { admin: ALL, employee: ALL, vendor: ALL }, write: ['PUT'], after: (rows, ctx) => rows.map((c) => publicCompany(c, ctx.profile.role === 'admin')),
    before: async (v) => { const cur = await getCompany(true); if (v.settings) v.settings = { ...(cur.settings || {}), ...v.settings }; v.updated_at = new Date().toISOString(); return v; }, afterWrite: () => invalidateCompany() },
  employees: { read: { admin: ALL, employee: own('id', 'employee_id') }, write: ['POST', 'PUT', 'DELETE'], order: 'id', asc: true, search: ['full_name', 'job_title', 'department', 'id', 'email', 'iqama_number'], event: 'employee',
    before: async (v, method) => {
      if (v.email) v.email = String(v.email).toLowerCase().trim();
      if (v.nationality) v.is_saudi = v.nationality === 'Saudi Citizen';
      if (method === 'POST' && !v.id) {
        const { data } = await supabase.from('employees').select('id').order('id', { ascending: false }).limit(1);
        const n = data && data[0] ? parseInt(String(data[0].id).replace(/\D/g, ''), 10) + 1 : 1001;
        v.id = 'EMP' + n;
      }
      for (const k of ['basic_salary', 'housing_allowance', 'transport_allowance', 'other_allowance', 'annual_salary', 'bonus', 'age']) if (k in v) v[k] = v[k] === '' || v[k] == null ? null : Number(v[k]);
      if (method === 'POST' && v.basic_salary != null && v.annual_salary == null) v.annual_salary = Number(v.basic_salary) * 12;
      return v;
    } },
  vendors: { read: { admin: ALL, vendor: own('id', 'vendor_id') }, write: ['POST', 'PUT', 'DELETE'], order: 'name', asc: true },
  timesheets: { read: { admin: ALL, employee: own('employee_id', 'employee_id'), vendor: own('vendor_id', 'vendor_id') }, write: ['POST', 'PUT', 'DELETE'], select: '*, employees(full_name,department), vendors(name)', order: 'date' },
  attendance: { read: { admin: ALL, employee: own('employee_id', 'employee_id') }, write: ['PUT', 'DELETE'], select: '*, employees(full_name,department,location)', order: 'date' },
  leave_types: { read: { admin: ALL, employee: ALL }, write: ['POST', 'PUT', 'DELETE'], order: 'id', asc: true },
  leave_requests: { read: { admin: ALL, employee: own('employee_id', 'employee_id') }, write: ['PUT', 'DELETE'], select: '*, employees(full_name,department,gender), leave_types(code,name_en,name_ar,color,paid)', order: 'created_at' },
  holidays: { read: { admin: ALL, employee: ALL, vendor: ALL }, write: ['POST', 'PUT', 'DELETE'], order: 'date', asc: true },
  payroll_runs: { read: { admin: ALL }, write: ['DELETE'], order: 'period' },
  payslips: { read: { admin: ALL, employee: own('employee_id', 'employee_id', [['status', 'paid']]) }, write: ['PUT'], select: '*, employees(full_name,full_name_ar,department,job_title,iqama_number,nationality,is_saudi,iban,bank_code,hire_date)', order: 'period' },
  invoices: { read: { admin: ALL, vendor: own('vendor_id', 'vendor_id') }, write: ['PUT', 'DELETE'], fields: ['status', 'notes', 'design', 'due_date'], select: '*, vendors(name,name_ar,vat_number,cr_number,address,city,email,phone)', order: 'icv' },
  expense_categories: { read: { admin: ALL, employee: ALL }, write: ['POST', 'PUT', 'DELETE'], order: 'id', asc: true },
  expenses: { read: { admin: ALL, employee: own('employee_id', 'employee_id') }, write: ['PUT', 'DELETE'], select: '*, employees(full_name,department), expense_categories(name_en,name_ar,color,cap_per_claim)', order: 'created_at',
    after: async (rows) => {
      const paths = rows.map((r) => r.receipt_path).filter(Boolean);
      if (!paths.length) return rows;
      const { data } = await supabase.storage.from('receipts').createSignedUrls(paths, 3600);
      const m = new Map((data || []).map((d) => [d.path, d.signedUrl]));
      return rows.map((r) => ({ ...r, receipt_url: r.receipt_path ? m.get(r.receipt_path) || null : null }));
    } },
  assets: { read: { admin: ALL, employee: own('assigned_to', 'employee_id') }, write: ['POST', 'PUT', 'DELETE'], select: '*, employees(full_name,department)', order: 'id', asc: true, search: ['name', 'tag', 'serial_no', 'category'] },
  documents: { read: { admin: ALL, employee: own('employee_id', 'employee_id') }, write: ['DELETE'], select: '*, employees(full_name)', order: 'created_at' },
  rules: { read: { admin: ALL, employee: ALL }, write: ['DELETE'], order: 'id', asc: true },
  rule_acks: { read: { admin: ALL, employee: own('employee_id', 'employee_id') }, select: '*, employees(full_name,department)', order: 'acked_at' },
  tickets: { read: { admin: ALL, employee: own('profile_id', 'id'), vendor: own('profile_id', 'id') }, write: ['DELETE'], order: 'updated_at' },
  faqs: { read: { admin: ALL, employee: ALL, vendor: ALL }, write: ['POST', 'PUT', 'DELETE'], order: 'id', asc: true },
  notifications: { read: { admin: own('profile_id', 'id'), employee: own('profile_id', 'id'), vendor: own('profile_id', 'id') }, order: 'created_at' },
  audit_logs: { read: { admin: ALL }, order: 'created_at', search: ['action', 'actor_email', 'resource', 'record_id'] },
  webhooks: { read: { admin: ALL }, write: ['POST', 'PUT', 'DELETE'], order: 'id', asc: true,
    before: async (v, method) => {
      if ('url' in v && !/^https:\/\/[^\s]+$/i.test(String(v.url))) throw new HttpError(400, 'Webhook URL must be a valid https:// URL');
      if (method === 'POST' && !v.secret) v.secret = 'whsec_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      return v;
    } },
  api_keys: { read: { admin: ALL }, write: ['DELETE'], select: 'id,name,prefix,scopes,revoked,created_at,last_used_at', order: 'created_at' },
  app_links: { read: { admin: ALL, employee: ALL, vendor: ALL }, write: ['POST', 'PUT', 'DELETE'], order: 'id', asc: true,
    before: async (v) => { if ('url' in v && !/^https?:\/\//i.test(String(v.url))) throw new HttpError(400, 'Link URL must start with http(s)://'); return v; } },
  profiles: { read: { admin: ALL, employee: own('id', 'id'), vendor: own('id', 'id') }, write: ['PUT', 'DELETE'], fields: ['role', 'employee_id', 'vendor_id', 'status', 'display_name', 'phone'], select: 'id,user_id,email,role,employee_id,vendor_id,display_name,phone,status,mfa_enabled,last_seen,created_at', order: 'id', asc: true, search: ['email', 'display_name'] },
};

function clean(values, cfg) {
  const out = {};
  for (const [k, v] of Object.entries(values || {})) {
    if (!COL.test(k) || EMBEDS.includes(k) || k === 'created_at') continue;
    if (cfg.fields && !cfg.fields.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    const ctx = await authenticate(req);
    const role = ctx.profile.role;
    const q = req.method === 'GET' ? req.query : (req.body || {});
    const name = String(q.resource || '');
    const cfg = R[name];
    if (!cfg) throw new HttpError(404, 'Unknown resource');
    if (ctx.profile.status === 'pending' && !['company', 'notifications', 'faqs', 'profiles', 'tickets', 'holidays'].includes(name)) return res.status(200).json(q.id ? null : []);

    if (req.method === 'GET') {
      const scopeFn = cfg.read[role];
      if (!scopeFn) throw new HttpError(403, 'Forbidden');
      const filters = scopeFn(ctx.profile);
      if (filters === null) return res.status(200).json(q.id ? null : []);
      let query = supabase.from(name).select(cfg.select || '*');
      for (const [c, v] of filters) query = query.eq(c, v);
      if (q.id) query = query.eq('id', q.id);
      if (q.f) {
        let f = {}; try { f = JSON.parse(q.f); } catch { throw new HttpError(400, 'Bad filter'); }
        for (const [c, v] of Object.entries(f)) {
          if (!COL.test(c)) continue;
          if (Array.isArray(v)) query = query.in(c, v);
          else if (v === null) query = query.is(c, null);
          else query = query.eq(c, v);
        }
      }
      if (q.dcol && COL.test(q.dcol)) { if (q.from) query = query.gte(q.dcol, q.from); if (q.to) query = query.lte(q.dcol, q.to); }
      if (q.q && cfg.search) {
        const s = String(q.q).replace(/[,()%*\\:]/g, ' ').trim().slice(0, 60);
        if (s) query = query.or(cfg.search.map((c) => `${c}.ilike.%${s}%`).join(','));
      }
      const order = q.order && COL.test(q.order) ? q.order : (cfg.order || 'id');
      const asc = q.asc != null ? (q.asc === 'true' || q.asc === '1') : !!cfg.asc;
      query = query.order(order, { ascending: asc });
      const limit = Math.min(parseInt(q.limit, 10) || 1000, 1000);
      const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
      query = query.range(offset, offset + limit - 1);
      let { data, error } = await query;
      if (error) throw error;
      if (cfg.after) data = await cfg.after(data || [], ctx);
      if (q.id) return res.status(200).json((data || [])[0] || null);
      return res.status(200).json(data || []);
    }

    if (role !== 'admin' || !(cfg.write || []).includes(req.method)) throw new HttpError(403, 'Forbidden');

    if (req.method === 'POST') {
      let values = clean(q.values, cfg); delete values.id;
      if (name === 'employees' && q.values?.id) values.id = String(q.values.id).toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (cfg.before) values = await cfg.before(values, 'POST', ctx);
      const { data, error } = await supabase.from(name).insert(values).select().single();
      if (error) throw error;
      await audit(ctx, `${name}.create`, name, data.id, { fields: Object.keys(values) });
      if (cfg.event) await fireWebhooks(`${cfg.event}.created`, data);
      if (cfg.afterWrite) cfg.afterWrite();
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      if (q.id == null) throw new HttpError(400, 'id required');
      let values = clean(q.values, cfg); delete values.id;
      if (name === 'profiles') {
        if (String(q.id) === String(ctx.profile.id) && ('role' in values || 'status' in values)) throw new HttpError(400, 'You cannot change your own role or status');
        if ('role' in values && !['admin', 'employee', 'vendor'].includes(values.role)) throw new HttpError(400, 'Invalid role');
      }
      if (cfg.before) values = await cfg.before(values, 'PUT', ctx);
      const { data, error } = await supabase.from(name).update(values).eq('id', q.id).select().single();
      if (error) throw error;
      await audit(ctx, `${name}.update`, name, q.id, { fields: Object.keys(values).filter((k) => k !== 'updated_at') });
      if (cfg.event) await fireWebhooks(`${cfg.event}.updated`, data);
      if (cfg.afterWrite) cfg.afterWrite();
      return res.status(200).json(name === 'profiles' ? { ...data, session_id: undefined } : data);
    }
    if (req.method === 'DELETE') {
      if (q.id == null) throw new HttpError(400, 'id required');
      if (name === 'profiles' && String(q.id) === String(ctx.profile.id)) throw new HttpError(400, 'You cannot delete your own account');
      await assertRetainable(name, q.id);
      // payslips.run_id is ON DELETE CASCADE, so deleting a run would take every
      // payslip with it — payroll history disappears without a trace. A run that
      // has been finalised is a financial record: keep it.
      if (name === 'payroll_runs') {
        const { count } = await supabase.from('payslips').select('id', { count: 'exact', head: true }).eq('run_id', q.id);
        if (count) throw new HttpError(409, `This run has ${count} payslip(s). Payroll history cannot be deleted — set the run back to draft instead.`);
      }
      const { error } = await supabase.from(name).delete().eq('id', q.id);
      if (error) throw error;
      await audit(ctx, `${name}.delete`, name, q.id);
      if (cfg.event) await fireWebhooks(`${cfg.event}.deleted`, { id: q.id });
      return res.status(200).json({ ok: true });
    }
    throw new HttpError(405, 'Method not allowed');
  } catch (e) { sendError(res, e); }
}
