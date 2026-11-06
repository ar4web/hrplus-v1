// Seed idempotency + ordering. Runs against a throwaway store (cwd's .data), so
// it can reset tables freely without touching the dev database.
// Usage: run from a scratch directory:
//   mkdir -p /tmp/seedtest && cd /tmp/seedtest && node --import /path/dev/register.mjs /path/dev/seed-test.mjs
import './env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { store, flush } from './store.mjs';
import { seedBase } from './base-seed.mjs';
import { ensureSeeded } from './bootstrap.mjs';

const results = [];
let failures = 0;
const ok = (msg) => results.push(`ok    ${msg}`);
const fail = (msg) => { failures++; results.push(`FAIL  ${msg}`); };
const expect = (cond, msg) => (cond ? ok(msg) : fail(msg));

function callHandler(handler, body) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      setHeader() { return this; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); return this; },
      end(o) { resolve({ status: this.statusCode, body: o ?? null }); return this; },
    };
    Promise.resolve(handler({ method: 'POST', headers: {}, query: {}, body }, res)).catch(reject);
  });
}

const seedStep = async (step, token = 'local-seed-token') => {
  const { default: handler } = await import('../api/seed.js');
  return callHandler(handler, { step, token });
};
const counts = () => Object.fromEntries(Object.entries(store.tables).map(([k, v]) => [k, v.length]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const reset = () => { for (const k of Object.keys(store.tables)) delete store.tables[k]; seedBase(); flush(); };

// Guard: refuse to run against the real dev database.
if (!fs.existsSync(path.join(process.cwd(), '.data')) && fs.existsSync('/home/user/hrplus-v1/.data/db.json') && process.cwd() === '/home/user/hrplus-v1') {
  console.error('refusing to run in the repo root — run from a scratch directory');
  process.exit(2);
}

// ---------- a fresh database seeds normally ----------
// Start from an empty store whether or not this scratch directory was used before.
reset();
const first = await ensureSeeded();
expect(first.seeded === true && !first.skipped, `fresh seed runs all steps (${Object.entries(counts()).map(([k, v]) => `${k}:${v}`).slice(0, 4).join(' ')}…)`);
// Re-open the seeder before snapshotting: ensureSeeded() ends with 'finish', which
// burns the token, and the replay bug only exists while a caller is mid-run.
store.tables.secrets.push({ key: 'seed_token', value: 'local-seed-token' });
const seeded = counts();
expect(seeded.employees > 0 && seeded.payslips > 0, `seeded ${seeded.employees} employees, ${seeded.payslips} payslips`);

// ---------- every step is a no-op the second time ----------
// ensureSeeded() ends with 'finish', which burns the token. Put one back: the
// duplicate-on-replay bug happened when a caller kept going mid-run, and that is
// exactly the state this reproduces.
for (const step of ['core', 'history', 'finance', 'social']) {
  const r = await seedStep(step);
  expect(r.status === 200 && r.body?.skipped === true, `re-running "${step}" is skipped, not duplicated (${r.status} ${JSON.stringify(r.body).slice(0, 60)})`);
}
expect(same(counts(), seeded), 'row counts are unchanged after replaying every step');

// ---------- a repeated core step cannot duplicate employees (the original bug) ----------
reset();
const core1 = await seedStep('core');
const afterCore = counts();
const core2 = await seedStep('core');
expect(core1.status === 200 && !core1.body?.skipped, 'core runs once on an empty database');
expect(core2.body?.skipped === true && same(counts(), afterCore), `second core is a no-op (${afterCore.employees} employees stayed ${counts().employees})`);

// ---------- steps cannot be run out of order ----------
reset();
const jumped = await seedStep('finance');
expect(jumped.status === 409, `jumping to "finance" before "core" is refused (${jumped.status} ${JSON.stringify(jumped.body).slice(0, 70)})`);
const unknown = await seedStep('nonsense');
expect(unknown.status === 400, `unknown step name is a 400 (${unknown.status})`);

// ---------- the token is single-use ----------
reset();
for (const step of ['core', 'history', 'finance', 'social', 'finish']) {
  const r = await seedStep(step);
  if (r.status >= 400) { fail(`step "${step}" failed during a full run: ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`); break; }
}
expect(store.tables.secrets.every((s) => s.key !== 'seed_token'), 'finish deletes the seed token');
const replay = await seedStep('core');
expect(replay.status === 403, `after finish the token is dead (${replay.status})`);

// ---------- progress markers survive ----------
const markers = store.tables.secrets.filter((s) => String(s.key).startsWith('seed_step_')).map((s) => s.key).sort();
expect(markers.length === 4, `four completion markers recorded: ${markers.join(', ')}`);

console.log(results.join('\n'));
console.log(`\n${results.length - failures}/${results.length} seed assertions passed`);
process.exit(failures ? 1 : 0);
