// Local API server: serves the real /api handlers (data, actions, me, upload,
// auth-phone, rest) against the in-memory Supabase emulator, so the frontend
// can run end-to-end with no cloud project. Development only.
import './env.mjs';
import { register } from 'node:module';
import crypto from 'node:crypto';
import http from 'node:http';

// The handlers in /api import @supabase/supabase-js lazily, so registering the
// resolve hook here lets `node dev/server.mjs` work on its own. Without it the
// real client is loaded, hits the placeholder URL and every request fails with
// a confusing 401 "Invalid or expired session".
if (!process.env.HRPLUS_LOCAL_EMULATOR) {
  register('./hooks.mjs', import.meta.url);
  process.env.HRPLUS_LOCAL_EMULATOR = '1';
}
import { ensureSeeded } from './bootstrap.mjs';
import { store, table, flush } from './store.mjs';
import { demoUserId } from './supabase-local.mjs';

const PORT = Number(process.env.DEV_API_PORT || 8787);
const HOST = process.env.DEV_API_HOST || '0.0.0.0';

const ROUTES = {
  '/api/me': () => import('../api/me.js'),
  '/api/data': () => import('../api/data.js'),
  '/api/actions': () => import('../api/actions.js'),
  '/api/upload': () => import('../api/upload.js'),
  '/api/auth-phone': () => import('../api/auth-phone.js'),
  '/api/rest': () => import('../api/rest.js'),
  '/api/seed': () => import('../api/seed.js'),
};

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 20 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

function makeRes(res) {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    setHeader(k, v) { res.setHeader(k, v); return this; },
    json(obj) {
      const body = JSON.stringify(obj);
      res.writeHead(this.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
    },
    end(body) { res.writeHead(this.statusCode); res.end(body ?? ''); },
  };
}

async function jsonBody(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/$/, '') || '/';
  const query = Object.fromEntries(url.searchParams.entries());

  // ---- demo auth helpers (not part of the production API surface) ----
  if (path === '/api/demo/accounts') {
    const profiles = table('profiles')
      .filter((p) => p.status !== 'disabled')
      .map((p) => ({ id: p.id, email: p.email, name: p.display_name, role: p.role, employee_id: p.employee_id, vendor_id: p.vendor_id }));
    const picked = ['admin@hrplus.sa', 'employee@hrplus.sa', 'vendor@hrplus.sa']
      .map((e) => profiles.find((p) => p.email === e))
      .filter(Boolean);
    return jsonBody(res, 200, { accounts: picked, all: profiles });
  }

  if (path === '/api/demo/login' && req.method === 'POST') {
    const body = (await readBody(req)) || {};
    const email = String(body.email || '').toLowerCase().trim();
    const profile = table('profiles').find((p) => String(p.email || '').toLowerCase() === email);
    if (!profile) return jsonBody(res, 401, { error: 'Unknown demo account' });
    if (profile.status === 'disabled') return jsonBody(res, 403, { error: 'Account disabled' });
    // Mint a JWT-shaped token rather than an opaque one: the API reads
    // claims.session_id (single-session + idle timeout, 440) and claims.aal
    // (MFA) from it, and those controls are only exercised if the local token
    // carries them. The emulator never verifies the signature, matching the
    // fact that only Supabase's own key can sign in production.
    const expires_at = Math.floor(Date.now() / 1000) + 8 * 3600;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const access_token = [
      b64({ alg: 'none', typ: 'JWT' }),
      b64({
        sub: demoUserId(profile.id),
        email: profile.email,
        role: 'authenticated',
        aud: 'authenticated',
        aal: 'aal1',
        amr: [{ method: 'password', timestamp: now }],
        session_id: crypto.randomUUID(),
        iat: now,
        exp: expires_at,
      }),
      crypto.randomBytes(24).toString('base64url'),
    ].join('.');
    return jsonBody(res, 200, {
      access_token,
      refresh_token: `demo-refresh.${profile.id}`,
      token_type: 'bearer',
      expires_in: 28800,
      expires_at,
      user: {
        id: demoUserId(profile.id),
        email: profile.email,
        email_confirmed_at: new Date(Date.now() - 864e5).toISOString(),
        user_metadata: { full_name: profile.display_name },
        app_metadata: { provider: 'email' },
      },
    });
  }

  if (path === '/api/health') {
    return jsonBody(res, 200, { ok: true, mode: 'local', tables: Object.fromEntries(Object.entries(store.tables).map(([k, v]) => [k, v.length])) });
  }

  // ---- production handlers ----
  const load = ROUTES[path];
  if (!load) return jsonBody(res, 404, { error: `No local route for ${path}` });

  try {
    const mod = await load();
    const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req);
    const reqShim = {
      method: req.method,
      headers: req.headers,
      query,
      body,
      socket: req.socket,
      url: req.url,
    };
    await mod.default(reqShim, makeRes(res));
    flush();
  } catch (e) {
    console.error(`[dev-api] ${path} failed:`, e);
    if (!res.headersSent) jsonBody(res, 500, { error: e.message });
  }
});

ensureSeeded({ log: (...a) => console.log('[dev-api]', ...a) })
  .then((r) => {
    if (r.skipped) console.log('[dev-api] database already seeded');
    else console.log('[dev-api] seeded tables:', r.tables);
    server.listen(PORT, HOST, () => {
      console.log(`[dev-api] local HRplus API on http://${HOST}:${PORT}`);
      console.log('[dev-api] demo accounts: admin@hrplus.sa · employee@hrplus.sa · vendor@hrplus.sa');
    });
  })
  .catch((e) => {
    console.error('[dev-api] bootstrap failed:', e);
    process.exit(1);
  });
