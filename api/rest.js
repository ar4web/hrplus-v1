// Public REST API (API-key authenticated) for integrations.
// GET  /api/rest                         → index
// GET  /api/rest?resource=employees      → list (limit, offset, any column=value filter)
// GET  /api/rest?resource=employees&id=X → single
// POST/PUT/DELETE (write scope)          → create / update (?id=) / delete (?id=)
import { supabase, cors, sendError, HttpError, sha256hex, audit, clientIp, fireWebhooks, assertRetainable } from './_lib.js';
import { splitColumns, isColumn, columnsOf } from './_schema.js';

const READ = ['employees', 'attendance', 'leave_requests', 'leave_types', 'holidays', 'payroll_runs', 'payslips', 'invoices', 'expenses', 'expense_categories', 'assets', 'vendors', 'timesheets', 'documents', 'rules'];
const WRITE = ['employees', 'attendance', 'leave_requests', 'expenses', 'assets', 'vendors', 'timesheets', 'holidays'];
const RESERVED = ['resource', 'id', 'limit', 'offset', 'order', 'asc'];
// Master records own financial/compliance history. An integration may create and
// update them through the app's own rules, but not delete them out from under it.
const NO_DELETE = ['employees', 'vendors'];
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
      const filters = Object.entries(q).filter(([k]) => !RESERVED.includes(k));
      for (const [k, v] of filters) {
        if (!isColumn(resource, k)) throw new HttpError(400, `Unknown field "${k}" — readable fields: ${columnsOf(resource).join(', ')}`);
        query = query.eq(k, v);
      }
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
    const { values: sent, rejected } = splitColumns(resource, req.body || {});
    if (rejected.length) throw new HttpError(400, `Unknown field(s) for ${resource}: ${rejected.join(', ')} — writable fields: ${columnsOf(resource).filter((c) => c !== 'created_at').join(', ')}`);
    const values = { ...sent };
    delete values.created_at;
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) delete values[k];
      else if (v !== null && typeof v === 'object' && !Array.isArray(v)) throw new HttpError(400, `Field "${k}" must be a value, not an object`);
    }
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
      if (NO_DELETE.includes(resource)) throw new HttpError(403, `${resource} cannot be deleted through the integration API — use the app so history is preserved`);
      await assertRetainable(resource, q.id);
      const { error } = await supabase.from(resource).delete().eq('id', q.id);
      if (error) throw new HttpError(400, error.message);
      await audit(ctx, `api.${resource}.delete`, resource, q.id);
      return res.status(200).json({ ok: true });
    }
    throw new HttpError(405, 'Method not allowed');
  } catch (e) { sendError(res, e); }
}
