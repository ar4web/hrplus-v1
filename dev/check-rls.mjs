// Exercises the RLS + storage policies in supabase/migrations against a throwaway
// PostgreSQL database with Supabase-like roles (anon / authenticated / service_role,
// auth.uid(), storage.objects). Proves the policies do what they claim instead of
// leaving them as untested SQL.
//
// Usage: node dev/check-rls.mjs           (uses the local dev cluster)
//        DATABASE_URL=... node dev/check-rls.mjs   (any Postgres you can create DBs on)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:5433/postgres';
const DB = 'hrplus_rls_check';
const adminUrl = BASE.replace(/\/[^/]*$/, '/postgres');
const dbUrl = BASE.replace(/\/[^/]*$/, `/${DB}`);

const run = (args, opts = {}) => execFileSync('psql', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const psqlFile = (url, file) => run([url, '-q', '-v', 'ON_ERROR_STOP=1', '-f', file]);
const sql = (url, q, { tolerate = false } = {}) => {
  try { return run([url, '-t', '-A', '-F', '|', '-c', q]).trim(); }
  catch (e) { if (tolerate) return `ERROR: ${String(e.stderr || e.message).split('\n')[0]}`; throw e; }
};

/* ---------- build a throwaway database with the Supabase scaffolding ---------- */
try { run([adminUrl, '-q', '-c', `drop database if exists ${DB}`]); } catch { /* first run */ }
run([adminUrl, '-q', '-c', `create database ${DB}`]);
psqlFile(dbUrl, 'dev/rls-harness.sql');
psqlFile(dbUrl, 'supabase/migrations/0001_init.sql');
psqlFile(dbUrl, 'supabase/migrations/0002_storage.sql');

// fixtures: two users linked to two employees, one of them an admin
sql(dbUrl, `
  insert into employees (id, full_name, hire_date) values
    ('EMP1001', 'Employee One', '2024-01-01'),
    ('EMP1002', 'Employee Two', '2024-01-01');
  insert into profiles (user_id, email, role, employee_id, display_name, status) values
    ('11111111-1111-4111-8111-111111111111', 'one@x.sa', 'employee', 'EMP1001', 'Employee One', 'active'),
    ('22222222-2222-4222-8222-222222222222', 'admin@x.sa', 'admin', 'EMP1002', 'Admin Two', 'active');
`);

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

// Run a statement as a given role/user, returning the statement's output (or its
// error). psql echoes the transaction commands, so strip those out.
const NOISE = /^(BEGIN|SET|ROLLBACK|COMMIT|INSERT \d+ \d+|DELETE \d+)$/;
const clean = (out) => out.split('\n').map((l) => l.trim()).filter((l) => l && !NOISE.test(l)).join('\n');
const as = (role, uid, q) => clean(sql(dbUrl, `
  begin;
  set local role ${role};
  ${uid ? `set local request.jwt.claim.sub = '${uid}';` : ''}
  ${q}
  rollback;
`, { tolerate: true }));

let pass = 0, fail = 0;
const t = (name, got, expect) => {
  const ok = typeof expect === 'function' ? expect(got) : got === expect;
  if (ok) { pass++; return; }
  fail++;
  console.log(`FAIL ${name}\n      got: ${String(got).slice(0, 160)}`);
};

/* ------------------------------- table RLS -------------------------------- */
t('anon cannot read employees at all', as('anon', null, 'select count(*) from employees;'), (g) => /permission denied|ERROR/.test(g));
t('authenticated cannot read the employee table directly', as('authenticated', U1, 'select count(*) from employees;'), (g) => /permission denied|ERROR/.test(g));
t('authenticated reads only their own profile row', as('authenticated', U1, 'select display_name from profiles order by display_name;'), 'Employee One');
t('authenticated sees no other profile row', as('authenticated', U1, 'select count(*) from profiles;'), '1');
t('authenticated cannot read the email column', as('authenticated', U1, 'select email from profiles;'), (g) => /permission denied|ERROR/.test(g));
t('authenticated cannot read payslips', as('authenticated', U1, 'select count(*) from payslips;'), (g) => /permission denied|ERROR/.test(g));
t('authenticated cannot read invoices', as('authenticated', U1, 'select count(*) from invoices;'), (g) => /permission denied|ERROR/.test(g));
t('authenticated cannot write employees', as('authenticated', U1, `insert into employees (id, full_name, hire_date) values ('EVIL','x','2024-01-01');`), (g) => /permission denied|ERROR/.test(g));
t('service_role bypasses RLS (reads every profile)', as('service_role', null, 'select count(*) from profiles;'), '2');

/* ---------------------------- storage policies ---------------------------- */
// receipts are private and owner-scoped by the first path segment
t('employee can upload into their own receipts folder', as('authenticated', U1, `insert into storage.objects (bucket_id, name) values ('receipts','EMP1001/r.pdf');`), (g) => !/ERROR/.test(g));
t('employee cannot upload into someone else\'s folder', as('authenticated', U1, `insert into storage.objects (bucket_id, name) values ('receipts','EMP1002/r.pdf');`), (g) => /ERROR|denied/.test(g));
t('employee cannot upload into backups', as('authenticated', U1, `insert into storage.objects (bucket_id, name) values ('backups','dump.json');`), (g) => /ERROR|denied/.test(g));
t('admin can upload into backups', as('authenticated', U2, `insert into storage.objects (bucket_id, name) values ('backups','dump.json');`), (g) => !/ERROR/.test(g));

// seed two objects as the service role, then check visibility per role
sql(dbUrl, `insert into storage.objects (bucket_id, name) values ('receipts','EMP1001/a.pdf'), ('receipts','EMP1002/b.pdf'), ('branding','logo.svg');`);
t('employee sees only their own receipts', as('authenticated', U1, `select count(*) from storage.objects where bucket_id = 'receipts';`), '1');
t('admin sees all receipts', as('authenticated', U2, `select count(*) from storage.objects where bucket_id = 'receipts';`), '2');
t('anon cannot list receipts', as('anon', null, `select count(*) from storage.objects where bucket_id = 'receipts';`), '0');
t('branding is publicly readable', as('anon', null, `select count(*) from storage.objects where bucket_id = 'branding';`), '1');

/* ------------------------------- buckets ---------------------------------- */
// Exactly the buckets the code uses — an extra bucket is either dead
// infrastructure or something nobody reviewed.
t('only the used buckets exist', sql(dbUrl, `select string_agg(id, ',' order by id) from storage.buckets;`), 'backups,branding,receipts');
t('receipts are private, branding is public', sql(dbUrl, `select string_agg(id || '=' || public, ',' order by id) from storage.buckets where id in ('receipts','branding');`), 'branding=true,receipts=false');

/* -------------------------------- cleanup --------------------------------- */
run([adminUrl, '-q', '-c', `drop database ${DB}`]);
try { fs.unlinkSync(''); } catch { /* noop */ }

console.log(`${pass}/${pass + fail} RLS/storage policy assertions passed${fail ? ` — ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
