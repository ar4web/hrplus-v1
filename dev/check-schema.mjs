// Validates supabase/migrations/*.sql against the application:
//   1. every table the API touches must exist
//   2. every column present in the app's own seeded data must exist
//   3. the seeded data must actually load into the schema (types/constraints)
//   4. every column referenced by the SQL-ish query code must exist
// Usage: node dev/check-schema.mjs [psql-connection-args]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

// Prefer DATABASE_URL (what `npm run test:schema` exports); otherwise the dev cluster.
const PG = process.env.DATABASE_URL ? `"${process.env.DATABASE_URL}"` : (process.env.PG_ARGS || '-h /tmp -p 5433 -U postgres -d hrplus_test');
const pgArgs = () => (process.env.DATABASE_URL ? [process.env.DATABASE_URL] : PG.split(' '));
const pg = (sql) => execFileSync('psql', [...pgArgs(), '-t', '-A', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();

const dbFile = '.data/db.json';
if (!fs.existsSync(dbFile)) { console.error('run the seeder first (npm run db:seed)'); process.exit(1); }
const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

// ---- live schema from Postgres ----
const cols = new Map();   // table -> Set(column)
const q = pg(`select table_name, column_name from information_schema.columns where table_schema='public' order by table_name, ordinal_position`);
for (const line of q.split('\n').filter(Boolean)) {
  const [t, c] = line.split('|');
  if (!cols.has(t)) cols.set(t, new Set());
  cols.get(t).add(c);
}

const problems = [];
const notes = [];

// ---- 1. tables referenced by the API code ----
const apiFiles = fs.readdirSync('api').filter((f) => f.endsWith('.js'));
const code = apiFiles.map((f) => ({ f, src: fs.readFileSync(`api/${f}`, 'utf8') }));
const fromTables = new Set();
const buckets = new Set();
for (const { src } of code) {
  // .storage.from('bucket') is a storage bucket, not a table — collect separately
  for (const m of src.matchAll(/\.storage\s*\.\s*from\(\s*'([a-z_]+)'\s*\)/g)) buckets.add(m[1]);
  const noStorage = src.replace(/\.storage\s*\.\s*from\(\s*'[a-z_]+'\s*\)/g, '');
  for (const m of noStorage.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)) fromTables.add(m[1]);
}
for (const t of fromTables) if (!cols.has(t)) problems.push(`API uses table "${t}" but the schema has no such table`);

// ---- 2. columns present in the app's seeded data ----
for (const [t, rows] of Object.entries(db.tables)) {
  if (!cols.has(t)) { problems.push(`seeded data has table "${t}" with no schema table`); continue; }
  const seen = new Set();
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
  for (const k of seen) if (!cols.get(t).has(k)) problems.push(`column ${t}.${k} exists in app data but not in the schema`);
}

// ---- 3. columns referenced by query code (select lists / filters / order / insert keys) ----
const SKIP = new Set(['resource', 'id', 'limit', 'offset', 'order', 'asc', 'q', 'dcol', 'from', 'to', 'f', 'select', 'count', 'ascending', 'head', 'event', 'data', 'error']);
const EMBED = new Set(['employees', 'vendors', 'profiles', 'leave_types', 'expense_categories', 'payroll_runs', 'rules', 'conversations', 'invoices', 'receipt_url']);
function noteCol(table, col) {
  if (!cols.has(table)) return;
  if (SKIP.has(col) || col.includes('(') || col === '*') return;
  if (!cols.get(table).has(col)) problems.push(`code reads ${table}.${col} which is not in the schema`);
}
// Only look at the select list that belongs to the nearest preceding .from('t')
// without crossing into another .from( — otherwise embed columns get attributed
// to the wrong table.
function topLevelKeys(body) {
  const out = []; let depth = 0, quote = null, cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) { cur += ch; if (ch === quote && body[i - 1] !== '\\') quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    if (ch === '}' || ch === ']' || ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

for (const { src } of code) {
  for (const m of src.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)) {
    const table = m[1];
    const rest = src.slice(m.index + m[0].length);
    const nextFrom = rest.indexOf(".from(");
    const window = rest.slice(0, nextFrom === -1 ? 600 : Math.min(nextFrom, 600));
    const sel = window.match(/\.select\(\s*'([^']*)'/);
    if (sel) {
      // remove embedded relations before splitting on commas
      const flat = sel[1].replace(/[a-z_]+\s*\([^)]*\)/g, '');
      for (const raw of flat.split(',')) {
        const part = raw.trim().split(/\s+/)[0];
        if (!part || part === '*' || EMBED.has(part)) continue;
        noteCol(table, part.split(':').pop());
      }
    }
    for (const body of window.matchAll(/\.(?:insert|update|upsert)\(\s*\{([\s\S]*?)\}\s*\)/g)) {
      for (const kv of topLevelKeys(body[1])) {
        const key = kv.match(/^([a-z_]+)\s*:/);
        if (key) noteCol(table, key[1]);
        else if (/^\.\.\./.test(kv) === false && /^[a-z_]+$/.test(kv)) noteCol(table, kv);
      }
    }
  }
}

// ---- 3b. constraints the app relies on ----
const uniques = pg(`select indexdef from pg_indexes where schemaname='public'`);
for (const need of [['invoices', 'icv'], ['invoices', 'number'], ['profiles', 'email'], ['payslips', 'employee_id'], ['attendance', 'employee_id'], ['rule_acks', 'rule_id'], ['payroll_runs', 'period'], ['api_keys', 'key_hash']]) {
  const [t, c] = need;
  const found = uniques.split('\n').some((l) => l.includes(` ${t} `) || l.includes(`.${t} `) || l.includes(t)) && /unique/i.test(uniques);
  if (!found) notes.push(`no unique index mentioning ${t}.${c} (needed for idempotency / ICV safety)`);
}

// ---- 4. actually load the seeded data (proves column names + types) ----
// Parent tables first so foreign keys hold; use a temp file because a single
// -c argument overflows ARG_MAX on the larger tables.
const LOAD_ORDER = ['company', 'vendors', 'employees', 'profiles', 'leave_types', 'holidays',
  'expense_categories', 'rules', 'faqs', 'app_links', 'timesheets', 'attendance', 'leave_requests',
  'payroll_runs', 'payslips', 'invoices', 'expenses', 'assets', 'documents', 'rule_acks', 'tickets',
  'conversations', 'messages', 'notifications', 'audit_logs', 'webhooks', 'api_keys', 'secrets'];
const loadErrors = [];
const resetSql = `truncate ${LOAD_ORDER.filter((t) => cols.has(t)).join(', ')} restart identity cascade;`;
execFileSync('psql', [...pgArgs(), '-q', '-c', resetSql], { encoding: 'utf8' });
const ordered = LOAD_ORDER.filter((t) => db.tables[t]?.length && cols.has(t));
for (const t of ordered) {
  const rows = db.tables[t];
  const tableCols = cols.get(t);
  const filtered = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => tableCols.has(k))));
  let failed = false;
  for (let i = 0; i < filtered.length && !failed; i += 200) {
    const chunk = JSON.stringify(filtered.slice(i, i + 200)).replace(/\$\$/g, '$ $');
    fs.writeFileSync('/tmp/load.sql', `insert into ${t} select * from json_populate_recordset(null::${t}, $$ ${chunk} $$::json);`);
    try {
      execFileSync('psql', [...pgArgs(), '-q', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/load.sql'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      loadErrors.push(`${t} (rows ${i}+): ${String(e.stderr || e.message).replace(/\n/g, ' ').slice(0, 300)}`);
      failed = true;
    }
  }
}
// sequences must not collide with the ids we just inserted (serial PKs only)
const serialTables = new Set(pg(`select table_name from information_schema.columns where table_schema='public' and column_name='id' and data_type in ('integer','bigint')`).split('\n').filter(Boolean));
for (const t of ordered) {
  if (!serialTables.has(t)) continue;
  execFileSync('psql', [...pgArgs(), '-q', '-c', `select setval(pg_get_serial_sequence('${t}','id'), coalesce((select max(id) from ${t}), 1))`], { encoding: 'utf8' });
}
// ---- 5. round-trip: what we loaded must equal what the app has ----
const countDiffs = [];
for (const t of ordered) {
  const src = db.tables[t].length;
  const got = Number(pg(`select count(*) from ${t}`));
  if (got !== src) countDiffs.push(`${t}: app ${src} vs postgres ${got}`);
}

// reload-check can't be repeated on a dirty db; report counts
let loaded = '';
try { loaded = Object.keys(db.tables).length + ' tables checked'; } catch { /* ignore */ }

// The public REST API writes against api/_schema.js. If a migration renames or
// drops a column, that list goes stale and integrations start getting 400s for
// fields the database no longer has — so compare it here.
{
  const { COLUMNS } = await import('../api/_schema.js');
  let checked = 0;
  for (const [t, list] of Object.entries(COLUMNS)) {
    if (!cols.has(t)) { problems.push(`_schema.js lists table "${t}" which the database does not have`); continue; }
    for (const c of list) { checked++; if (!cols.get(t).has(c)) problems.push(`_schema.js allows ${t}.${c} which is not in the schema`); }
    const declared = new Set(list);
    for (const c of cols.get(t)) if (!declared.has(c)) notes.push(`_schema.js does not expose ${t}.${c} (reads/writes of it are refused with 400)`);
  }
  notes.push(`_schema.js: ${Object.keys(COLUMNS).length} tables, ${checked} columns checked against the live schema`);
}

console.log(`schema tables: ${cols.size} · tables used by API: ${fromTables.size} · storage buckets used: ${[...buckets].join(', ') || 'none'} · ${loaded}`);
console.log(`\n=== PROBLEMS (${problems.length}) ===`);
console.log([...new Set(problems)].join('\n') || 'none');
console.log(`\n=== DATA LOAD ERRORS (${loadErrors.length}) ===`);
console.log(loadErrors.join('\n') || 'none — the app\'s own seeded rows load cleanly into the schema');
console.log(`\n=== ROW-COUNT ROUND TRIP (${countDiffs.length}) ===`);
console.log(countDiffs.join('\n') || `all ${ordered.length} non-empty tables match row-for-row after load`);
if (notes.length) { console.log(`\n=== NOTES (${notes.length}) ===`); console.log([...new Set(notes)].join('\n')); }
process.exit([...new Set(problems)].length || loadErrors.length || countDiffs.length ? 1 : 0);
