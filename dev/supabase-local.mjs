// In-memory emulation of the subset of `@supabase/supabase-js` that the HRplus
// API handlers in /api use: from().select/insert/update/delete with filters,
// ordering, ranges, embedded to-one relations, count/head queries, storage
// objects and GoTrue session lookups.
//
// It is loaded in place of the real package (see dev/loader.mjs) so the
// production handlers run completely unmodified against local seed data.
import { UPDATED_AT_TABLES, nextId, store, table, touch } from './store.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/* ------------------------------------------------------------------ utils */

const S = (v) => (v === null || v === undefined ? '' : String(v));
const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const isNumeric = (v) => v !== null && v !== '' && v !== undefined && !Number.isNaN(Number(v));

const nowIso = () => new Date().toISOString();

// Real Supabase user ids are UUIDs and profiles.user_id is a uuid column, so the
// emulator derives a stable uuid per demo profile instead of an ad-hoc string.
export const demoUserId = (profileId) =>
  `00000000-0000-4000-8000-${String(profileId).padStart(12, '0')}`;

function cmp(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (isNumeric(a) && isNumeric(b)) return num(a) - num(b);
  return S(a) < S(b) ? -1 : 1;
}

// FK column used to resolve `select('*, employees(...)')` style embeds.
const FK = {
  employees: 'employee_id',
  vendors: 'vendor_id',
  profiles: 'profile_id',
  leave_types: 'type_id',
  expense_categories: 'category_id',
  payroll_runs: 'run_id',
  rules: 'rule_id',
  conversations: 'conversation_id',
  invoices: 'invoice_id',
};

function looseEq(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  if (typeof a === 'number' || typeof b === 'number') {
    return isNumeric(a) && isNumeric(b) ? Number(a) === Number(b) : false;
  }
  return S(a) === S(b);
}

/* --------------------------------------------------------------- filtering */

function applyFilter(rows, f) {
  const { col, op, val } = f;
  const get = (r) => r?.[col];
  switch (op) {
    case 'eq': return rows.filter((r) => looseEq(get(r), val));
    case 'neq': return rows.filter((r) => !looseEq(get(r), val));
    case 'gt': return rows.filter((r) => cmp(get(r), val) > 0);
    case 'gte': return rows.filter((r) => cmp(get(r), val) >= 0);
    case 'lt': return rows.filter((r) => cmp(get(r), val) < 0);
    case 'lte': return rows.filter((r) => cmp(get(r), val) <= 0);
    case 'in': return rows.filter((r) => (val || []).some((v) => looseEq(get(r), v)));
    case 'is': return rows.filter((r) => (val === null ? get(r) === null || get(r) === undefined : get(r) === val));
    case 'ilike':
    case 'like': {
      const pat = S(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
      const re = new RegExp(`^${pat}$`, op === 'ilike' ? 'i' : '');
      return rows.filter((r) => re.test(S(get(r))));
    }
    case 'contains': {
      let want = val;
      try { if (typeof want === 'string') want = JSON.parse(want); } catch { /* keep string */ }
      const arr = Array.isArray(want) ? want : [want];
      return rows.filter((r) => {
        const have = r?.[col];
        if (Array.isArray(have)) return arr.every((w) => have.some((h) => looseEq(h, w)));
        if (have && typeof have === 'object') return arr.every((w) => Object.entries(w).every(([k, v]) => looseEq(have[k], v)));
        return false;
      });
    }
    default: return rows;
  }
}

// PostgREST `or=` syntax: "role.eq.admin,vendor_id.eq.5"
function applyOr(rows, expr) {
  const clauses = String(expr).match(/([^,()]+\([^)]*\)|[^,]+)/g) || [];
  const parsed = clauses.map((c) => {
    const [col, op, ...rest] = c.split('.');
    return { col, op, val: rest.join('.') };
  });
  return rows.filter((r) => parsed.some(({ col, op, val }) => applyFilter([r], { col, op, val: coerce(val) }).length > 0));
}

function coerce(v) {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

/* ------------------------------------------------------------- projection */

function splitTop(s) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function project(row, selectStr) {
  if (!selectStr || selectStr.trim() === '*') return { ...row };
  const out = {};
  for (const part of splitTop(selectStr)) {
    const m = part.match(/^([a-z_][a-z0-9_]*)(!inner)?\((.*)\)$/i);
    if (m) {
      const [, name, , cols] = m;
      const fk = FK[name] || `${name.replace(/s$/, '')}_id`;
      const key = row[fk];
      const target = table(name).find((t) => looseEq(t.id, key));
      out[name] = target ? project(target, cols) : null;
      continue;
    }
    if (part === '*') { Object.assign(out, row); continue; }
    const colName = part.split(':').pop().replace(/^"|"$/g, '');
    if (colName in row) out[colName] = row[colName];
    else out[colName] = null;
  }
  return out;
}

/* ---------------------------------------------------------------- builder */

class Query {
  constructor(name) {
    this.name = name;
    this.op = 'select';
    this.selectStr = '*';
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.offsetN = 0;
    this.singleMode = null;
    this.countMode = null;
    this.head = false;
    this.payload = null;
    this.returning = false;
  }

  select(cols = '*', opts = {}) {
    this.selectStr = cols || '*';
    if (this.op === 'select') { /* plain read */ } else this.returning = true;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  update(values) { this.op = 'update'; this.payload = values; return this; }
  upsert(rows, opts = {}) { this.op = 'upsert'; this.payload = rows; this.upsertOpts = opts || {}; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(c, v) { this.filters.push({ col: c, op: 'eq', val: v }); return this; }
  neq(c, v) { this.filters.push({ col: c, op: 'neq', val: v }); return this; }
  gt(c, v) { this.filters.push({ col: c, op: 'gt', val: v }); return this; }
  gte(c, v) { this.filters.push({ col: c, op: 'gte', val: v }); return this; }
  lt(c, v) { this.filters.push({ col: c, op: 'lt', val: v }); return this; }
  lte(c, v) { this.filters.push({ col: c, op: 'lte', val: v }); return this; }
  in(c, v) { this.filters.push({ col: c, op: 'in', val: v }); return this; }
  is(c, v) { this.filters.push({ col: c, op: 'is', val: v }); return this; }
  ilike(c, v) { this.filters.push({ col: c, op: 'ilike', val: v }); return this; }
  like(c, v) { this.filters.push({ col: c, op: 'like', val: v }); return this; }
  contains(c, v) { this.filters.push({ col: c, op: 'contains', val: v }); return this; }
  filter(c, op, v) { this.filters.push({ col: c, op, val: v }); return this; }
  match(obj) { for (const [c, v] of Object.entries(obj || {})) this.eq(c, v); return this; }

  not(c, op, v) {
    const target = { col: c, op, val: v };
    this.negated = this.negated || [];
    this.negated.push(target);
    return this;
  }
  or(expr) { this.orExpr = this.orExpr ? `${this.orExpr},${expr}` : expr; return this; }

  order(c, opts = {}) { this.orders.push({ col: c, asc: opts.ascending !== false }); return this; }
  limit(n) { this.limitN = n; return this; }
  range(from, to) { this.offsetN = from; this.limitN = to - from + 1; return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  csv() { return this; }

  then(resolve, reject) { return this._run().then(resolve, reject); }
  catch(fn) { return this._run().catch(fn); }
  finally(fn) { return this._run().finally(fn); }

  _rows() {
    let rows = table(this.name);
    for (const f of this.filters) rows = applyFilter(rows, f);
    for (const f of this.negated || []) {
      const keep = new Set(applyFilter(rows, f));
      rows = rows.filter((r) => !keep.has(r));
    }
    if (this.orExpr) rows = applyOr(rows, this.orExpr);
    return rows;
  }

  async _run() {
    await Promise.resolve();
    try {
      const all = this._rows();
      const sorted = [...all];
      if (this.orders.length) {
        sorted.sort((a, b) => {
          for (const o of this.orders) {
            const c = cmp(a[o.col], b[o.col]);
            if (c) return o.asc ? c : -c;
          }
          return 0;
        });
      }
      const count = this.countMode ? sorted.length : null;

      if (this.op === 'select') {
        let rows = sorted;
        if (this.offsetN) rows = rows.slice(this.offsetN);
        if (this.limitN != null) rows = rows.slice(0, this.limitN);
        if (this.head) return { data: null, error: null, count, status: 200 };
        let out = rows.map((r) => project(r, this.selectStr));
        out = this._maybeShape(out);
        if (out?.__err) return out.__err;
        return { data: out, error: null, count, status: 200 };
      }

      // PostgREST upsert: a row whose conflict key already exists is MERGED into
      // the existing row (columns you did not send are left alone); otherwise it
      // is inserted. Treating upsert as insert (the old behaviour) silently
      // duplicated whole tables and broke every follow-up read.
      if (this.op === 'upsert') {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload];
        const key = this.upsertOpts?.onConflict || 'id';
        const rows = table(this.name);
        const upserted = [];
        for (const raw of input) {
          const row = { ...raw };
          const i = row[key] === undefined || row[key] === null ? -1 : rows.findIndex((r) => String(r[key]) === String(row[key]));
          if (i >= 0) {
            const merged = { ...rows[i], ...row };
            if (UPDATED_AT_TABLES.has(this.name) || 'updated_at' in rows[i]) merged.updated_at = nowIso();
            rows[i] = merged;
            upserted.push(merged);
          } else {
            if (row.id === undefined || row.id === null) row.id = nextId(this.name);
            if (row.created_at === undefined || row.created_at === null) row.created_at = nowIso();
            if (UPDATED_AT_TABLES.has(this.name) || 'updated_at' in row) row.updated_at = row.updated_at ?? row.created_at;
            rows.push(row);
            upserted.push(row);
          }
        }
        touch();
        const shapedUp = this._maybeShape(upserted.map((r) => project(r, this.selectStr)));
        if (shapedUp?.__err) return shapedUp.__err;
        if (this.singleMode) return { data: shapedUp?.[0] ?? null, error: null, status: 200 };
        return { data: this.returning ? shapedUp : null, error: null, status: 201 };
      }

      if (this.op === 'insert') {
        const input = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = [];
        for (const raw of input) {
          const row = { ...raw };
          if (row.id === undefined || row.id === null) row.id = nextId(this.name);
          // Mirror the column default: always stamp created_at when the caller omits it.
          // (Guarding on "do other rows have it?" silently skipped the first row of
          // every table, since [].some(...) is false.)
          if (row.created_at === undefined || row.created_at === null) row.created_at = nowIso();
          // Same idea for updated_at, but only on tables that actually track it,
          // so we don't spray a meaningless column across every table.
          const tracksUpdated = UPDATED_AT_TABLES.has(this.name) || all.some((r) => 'updated_at' in r);
          if (tracksUpdated && (row.updated_at === undefined || row.updated_at === null)) row.updated_at = row.created_at;
          table(this.name).push(row);
          inserted.push(row);
        }
        touch();
        if (!this.returning) return { data: null, error: null, status: 201 };
        const shaped = this._maybeShape(inserted.map((r) => project(r, this.selectStr)));
        if (shaped?.__err) return shaped.__err;
        if (this.singleMode) return { data: shaped, error: null, status: 201 };
        return { data: shaped, error: null, status: 201 };
      }

      if (this.op === 'update') {
        const updated = [];
        const tracksUpdated = UPDATED_AT_TABLES.has(this.name) || all.some((r) => 'updated_at' in r);
        for (const row of all) {
          Object.assign(row, this.payload || {});
          // the real schema has a set_updated_at() trigger; mirror it
          if (tracksUpdated && !('updated_at' in (this.payload || {}))) row.updated_at = nowIso();
          if ('updated_at' in row || this.name === 'company') row.updated_at = nowIso();
          updated.push(row);
        }
        touch();
        if (!this.returning) return { data: null, error: null, status: 204 };
        let out = updated.map((r) => project(r, this.selectStr));
        out = this._maybeShape(out);
        if (out?.__err) return out.__err;
        return { data: out, error: null, status: 200 };
      }

      if (this.op === 'delete') {
        const doomed = new Set(all);
        const rows = table(this.name);
        const kept = rows.filter((r) => !doomed.has(r));
        store.tables[this.name] = kept;
        touch();
        return { data: null, error: null, status: 204 };
      }

      return { data: null, error: { message: `Unsupported operation ${this.op}` }, status: 400 };
    } catch (e) {
      return { data: null, error: { message: e.message, code: 'DEV_SHIM' }, status: 400 };
    }
  }

  _maybeShape(rows) {
    if (this.singleMode === 'single') {
      if (rows.length !== 1) {
        return { __err: { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: `Results contain ${rows.length} rows` }, status: 406, count: null } };
      }
      return rows[0];
    }
    if (this.singleMode === 'maybe') {
      if (rows.length > 1) {
        return { __err: { data: null, error: { message: 'JSON object requested, multiple rows returned', code: 'PGRST116' }, status: 406 } };
      }
      return rows[0] ?? null;
    }
    return rows;
  }
}

/* ---------------------------------------------------------------- storage */

const objectPath = (bucket, p) => `${bucket}/${p}`;

function signedUrl(bucket, p) {
  const obj = store.buckets[bucket]?.[p];
  if (!obj) return null;
  return `data:${obj.contentType || 'application/octet-stream'};base64,${obj.base64}`;
}

function storageFrom(bucket) {
  store.buckets[bucket] = store.buckets[bucket] || {};
  const bucketMap = () => store.buckets[bucket];
  return {
    async upload(p, body, opts = {}) {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body?.buffer || body);
      bucketMap()[p] = {
        base64: buf.toString('base64'),
        contentType: opts.contentType || 'application/octet-stream',
        size: buf.length,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      touch();
      return { data: { path: p, id: objectPath(bucket, p), fullPath: objectPath(bucket, p) }, error: null };
    },
    async createSignedUrl(p, expiresIn = 3600) {
      const url = signedUrl(bucket, p);
      return url ? { data: { signedUrl: url, path: p, expiresIn }, error: null } : { data: null, error: { message: 'Object not found' } };
    },
    async createSignedUrls(paths, expiresIn = 3600) {
      return { data: (paths || []).map((p) => ({ path: p, signedUrl: signedUrl(bucket, p), error: signedUrl(bucket, p) ? null : 'not found' })), error: null };
    },
    getPublicUrl(p) { return { data: { publicUrl: signedUrl(bucket, p) || '' } }; },
    async list(prefix = '', opts = {}) {
      const files = Object.entries(bucketMap())
        .filter(([p]) => p.startsWith(prefix || ''))
        .map(([p, o]) => ({ name: p.split('/').pop(), id: p, created_at: o.created_at, updated_at: o.updated_at, metadata: { size: o.size, mimetype: o.contentType }, size: o.size, content_type: o.contentType }));
      const sorted = opts?.sortBy ? [...files].sort((a, b) => cmp(a[opts.sortBy.column], b[opts.sortBy.column]) * (opts.sortBy.order === 'desc' ? -1 : 1)) : files;
      return { data: sorted.slice(0, opts?.limit || 100), error: null };
    },
    async download(p) {
      const obj = bucketMap()[p];
      if (!obj) return { data: null, error: { message: 'Object not found' } };
      return { data: new Blob([Buffer.from(obj.base64, 'base64')], { type: obj.contentType }), error: null };
    },
    async remove(paths) {
      for (const p of paths || []) delete bucketMap()[p];
      touch();
      return { data: (paths || []).map((p) => ({ name: p })), error: null };
    },
  };
}

/* ----------------------------------------------------------------- auth */

function decodeToken(token) {
  const raw = String(token || '').replace(/^Bearer\s+/i, '');

  // JWT-shaped demo tokens: the payload carries sub/session_id/aal/exp, which is
  // what the API inspects for single-session, idle timeout and MFA.
  const parts = raw.split('.');
  if (parts.length === 3) {
    let claims;
    try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
    const profile = table('profiles').find((p) => p.user_id && String(p.user_id) === String(claims.sub))
      || table('profiles').find((p) => demoUserId(p.id) === String(claims.sub));
    if (!profile) return null;
    if (profile.status === 'disabled') return null;
    if (claims.exp && claims.exp * 1000 < Date.now()) return null; // expired
    return profile;
  }

  // Legacy opaque form: demo.<profileId>.<nonce>
  const m = raw.match(/^demo\.([^.]+)\./);
  if (!m) return null;
  const profile = table('profiles').find((p) => String(p.id) === m[1]);
  if (!profile) return null;
  if (profile.status === 'disabled') return null;
  return profile;
}

async function sessionFor(email) {
  const profile = table('profiles').find((p) => S(p.email).toLowerCase() === S(email).toLowerCase());
  if (!profile) return { data: { session: null, user: null }, error: { message: 'Invalid login credentials', status: 400 } };
  const token = `demo.${profile.id}.${Math.random().toString(36).slice(2)}`;
  const user = {
    id: demoUserId(profile.id),
    email: profile.email,
    email_confirmed_at: new Date(Date.now() - 864e5).toISOString(),
    confirmed_at: new Date(Date.now() - 864e5).toISOString(),
    user_metadata: { full_name: profile.display_name },
    app_metadata: { provider: 'email' },
    last_sign_in_at: nowIso(),
  };
  const session = { access_token: token, refresh_token: `demo-refresh.${profile.id}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  return { data: { session, user }, error: null };
}

function authApi() {
  return {
    async getUser(token) {
      const profile = decodeToken(token);
      if (!profile) return { data: { user: null }, error: { message: 'Invalid or expired session' } };
      return {
        data: {
          user: {
            id: profile.user_id || demoUserId(profile.id),
            email: profile.email,
            email_confirmed_at: new Date(Date.now() - 864e5).toISOString(),
            confirmed_at: new Date(Date.now() - 864e5).toISOString(),
            user_metadata: { full_name: profile.display_name },
            app_metadata: { provider: 'email' },
            last_sign_in_at: nowIso(),
          },
        },
        error: null,
      };
    },
    async getSession() { return { data: { session: null }, error: null }; },
    async signInWithPassword({ email }) { return sessionFor(email); },
    async signOut() { return { error: null }; },
    async setSession(t) { return { data: { session: t }, error: null }; },
    admin: {
      mfa: { async listFactors() { return { data: { factors: [] }, error: null }; } },
      async listFactors() { return { data: { factors: [] }, error: null }; },
      async deleteUser() { return { data: {}, error: null }; },
    },
    mfa: {
      async listFactors() { return { data: { all: [], totp: [] }, error: null }; },
      async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] }, error: null }; },
    },
  };
}

/* --------------------------------------------------------------- public */

export function createClient() {
  return {
    from(name) { return new Query(name); },
    storage: { from: storageFrom },
    auth: authApi(),
    channel() {
      const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() { return Promise.resolve('ok'); }, send() { return Promise.resolve('ok'); } };
      return ch;
    },
    removeChannel() { return Promise.resolve('ok'); },
    async rpc() { return { data: null, error: { message: 'rpc not supported locally' } }; },
  };
}

export default { createClient };
export { JSON_HEADERS };
