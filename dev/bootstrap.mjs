import './env.mjs';
// Bootstraps the local database the first time the dev API server starts:
// reference rows first, then the app's own seeder (api/seed.js) exactly as it
// would run against Supabase.
import { store, state, table, flush } from './store.mjs';
import { seedBase } from './base-seed.mjs';

const STEPS = ['core', 'history', 'finance', 'social'];

function callHandler(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); return this; },
      end(o) { resolve({ status: this.statusCode, body: o ?? null }); return this; },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

export async function ensureSeeded({ log = () => {} } = {}) {
  const seeded = table('profiles').length > 0 && table('employees').length > 0;
  if (seeded) return { seeded: true, skipped: true };

  seedBase();
  state.paused = true;
  const { default: seedHandler } = await import('../api/seed.js');
  for (const step of [...STEPS, 'finish']) {
    const req = { method: 'POST', headers: {}, query: {}, body: { token: 'local-seed-token', step } };
    const out = await callHandler(seedHandler, req);
    if (out.status !== 200) throw new Error(`seed step "${step}" failed: ${JSON.stringify(out.body)}`);
    log(`seed ${step}:`, out.body);
  }
  state.paused = false;
  flush();
  return { seeded: true, tables: Object.fromEntries(Object.entries(store.tables).map(([k, v]) => [k, v.length])) };
}
