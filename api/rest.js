// Public REST API (API-key authenticated) for integrations.
// GET  /api/rest                         → index
// GET  /api/rest?resource=employees      → list (limit, offset, any column=value filter)
// GET  /api/rest?resource=employees&id=X → single
// POST/PUT/DELETE (write scope)          → create / update (?id=) / delete (?id=)
import { supabase, cors, sendError, HttpError, sha256hex, audit, clientIp, fireWebhooks } from './_lib.js';

const READ = ['employees', 'attendance', 'leave_requests', 'leave_types', 'holidays', 'payroll_runs', 'payslips', 'invoices', 'expenses', 'expense_categories', 'assets', 'vendors', 'timesheets', 'documents', 'rules'];
const WRITE = ['employees', 'attendance', 'leave_requests', 'expenses', 'assets', 'vendors', 'timesheets', 'holidays'];
const RESERVED = ['resource', 'id', 'limit', 'offset', 'order', 'asc'];
const COL = /^[a-z_]+$/;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    const raw = String(req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (!raw.startsWith('hrp_')) throw new HttpError(401, 'Missing or invalid API key (send X-API-Key: hrp_...)');
    const { data: key } = await supabase.from('api_keys').select('*').eq('key_hash', sha256hex(raw)).eq('revoked', false).maybeSingle();
    if (!key) throw new HttpError(401, 'Invalid or revoked API key');
    await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id);
    const ctx = { actor: `api:${key.name}`, role: 'api', ip: clientIp(req) };
    const q = req.query || {};
    const resource = String(q.resource || '');
    if (!resource) return res.status(200).json({ name: 'HRplus REST API', version: 'v1', readable: READ, writable: WRITE, scopes: key.scopes, usage: 'GET /api/rest?resource=employees&limit=50&department=Engineering' });
    if (req.method === 'GET') {
      if (!READ.includes(resource)) throw new HttpError(404, 'Unknown resource');
      let query = supabase.from(resource).select('*', { count: 'exact' });
      if (q.id) query = query.eq('id', q.id);
      for (const [k, v] of Object.entries(q)) if (!RESERVED.includes(k) && COL.test(k)) query = query.eq(k, v);
      const limit = Math.min(parseInt(q.limit, 10) || 100, 500), offset = Math.max(parseInt(q.offset, 10) || 0, 0);
      const order = q.order && COL.test(q.order) ? q.order : 'id';
      query = query.order(order, { ascending: q.asc !== 'false' }).range(offset, offset + limit - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      let rows = data || [];
      if (resource === 'invoices') rows = rows.map(({ xml, ...r }) => r);
      if (q.id) return res.status(rows[0] ? 200 : 404).json(rows[0] ? { data: rows[0] } : { error: 'Not found' });
      return res.status(200).json({ data: rows, count, limit, offset });
    }
    if (!(key.scopes || []).includes('write')) throw new HttpError(403, 'This API key is read-only');
    if (!WRITE.includes(resource)) throw new HttpError(403, 'Resource is not writable via API');
    const body = req.body || {};
    const values = {}; for (const [k, v] of Object.entries(body)) if (COL.test(k) && k !== 'created_at') values[k] = v;
    if (req.method === 'POST') {
      const { data, error } = await supabase.from(resource).insert(values).select().single();
      if (error) throw new HttpError(400, error.message);
      await audit(ctx, `api.${resource}.create`, resource, data.id);
      await fireWebhooks(`${resource}.created`, data);
      return res.status(201).json({ data });
    }
    if (!q.id) throw new HttpError(400, 'id query parameter required');
    if (req.method === 'PUT') {
      delete values.id;
      const { data, error } = await supabase.from(resource).update(values).eq('id', q.id).select().single();
      if (error) throw new HttpError(400, error.message);
      await audit(ctx, `api.${resource}.update`, resource, q.id, { fields: Object.keys(values) });
      return res.status(200).json({ data });
    }
    if (req.method === 'DELETE') {
      const { error } = await supabase.from(resource).delete().eq('id', q.id);
      if (error) throw new HttpError(400, error.message);
      await audit(ctx, `api.${resource}.delete`, resource, q.id);
      return res.status(200).json({ ok: true });
    }
    throw new HttpError(405, 'Method not allowed');
  } catch (e) { sendError(res, e); }
}
