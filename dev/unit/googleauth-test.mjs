// The Google sign-in message handler must ignore anything that does not come from
// our own origin or the configured OAuth proxy — otherwise any window that can
// reach the page could hand us a token pair and hijack the session.
import assert from 'node:assert/strict';

const APP_ORIGIN = 'https://app.hrplus.sa';
const PROXY_ORIGIN = 'https://auth.hrplus.sa';
const HOSTILE_ORIGIN = 'https://evil.example';

/* ------------------------------ fake window ------------------------------- */
const listeners = new Set();
globalThis.window = {
  location: { origin: APP_ORIGIN, search: '', pathname: '/' },
  addEventListener: (type, fn) => { if (type === 'message') listeners.add(fn); },
  removeEventListener: (type, fn) => { if (type === 'message') listeners.delete(fn); },
  open: () => ({}),
  close: () => {},
  history: { replaceState: () => {} },
};
globalThis.document = { cookie: '' };
// Node < 21 has no navigator global
if (!globalThis.navigator) globalThis.navigator = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120' };

const deliver = async (origin, data) => {
  for (const fn of [...listeners]) await fn({ origin, data });
  await new Promise((r) => setTimeout(r, 0)); // let any async handler settle
};
const resetListeners = () => listeners.clear();
const calls = () => globalThis.__authCalls ?? [];

// importing after the globals exist, so module-level code sees them
const { signInWithGoogle } = await import('../../.tmp/googleauth.mjs');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  globalThis.__authCalls.length = 0;
  resetListeners();
  try { await fn(); pass++; } catch (e) { fail++; console.log(`FAIL ${name} — ${e.message}`); }
};

await t('opens the Google consent URL and starts listening', async () => {
  signInWithGoogle('HRplus');
  assert.equal(listeners.size, 1, 'expected exactly one message listener');
});

await t('ignores a token pair posted from a hostile origin', async () => {
  signInWithGoogle();
  await deliver(HOSTILE_ORIGIN, { type: 'google-auth-success', access_token: 'attacker-at', refresh_token: 'attacker-rt' });
  assert.deepEqual(calls(), [], 'setSession must not be called for an untrusted origin');
});

await t('ignores an id_token posted from a hostile origin', async () => {
  signInWithGoogle();
  await deliver(HOSTILE_ORIGIN, { type: 'google-auth-success', id_token: 'attacker-id' });
  assert.deepEqual(calls(), [], 'signInWithIdToken must not be called for an untrusted origin');
});

await t('ignores right-looking payloads with non-string tokens', async () => {
  signInWithGoogle();
  await deliver(APP_ORIGIN, { type: 'google-auth-success', access_token: { evil: true }, refresh_token: ['x'] });
  await deliver(APP_ORIGIN, { type: 'google-auth-success', id_token: 42 });
  assert.deepEqual(calls(), [], 'tokens must be strings');
});

await t('ignores an empty success message', async () => {
  signInWithGoogle();
  await deliver(APP_ORIGIN, { type: 'google-auth-success' });
  assert.deepEqual(calls(), [], 'no tokens means nothing to do');
});

await t('accepts a token pair from our own origin', async () => {
  signInWithGoogle();
  await deliver(APP_ORIGIN, { type: 'google-auth-success', access_token: 'good-at', refresh_token: 'good-rt' });
  assert.equal(calls().length, 1);
  assert.equal(calls()[0].kind, 'setSession');
  assert.equal(calls()[0].args.access_token, 'good-at');
});

await t('accepts an id_token from the configured proxy origin', async () => {
  signInWithGoogle();
  await deliver(PROXY_ORIGIN, { type: 'google-auth-success', id_token: 'good-id' });
  assert.equal(calls().length, 1);
  assert.equal(calls()[0].kind, 'signInWithIdToken');
});

await t('clicking sign-in twice does not stack listeners', async () => {
  signInWithGoogle();
  signInWithGoogle();
  assert.equal(listeners.size, 1, `expected 1 listener, got ${listeners.size}`);
  await deliver(APP_ORIGIN, { type: 'google-auth-success', access_token: 'a', refresh_token: 'r' });
  assert.equal(calls().length, 1, 'the result must be processed exactly once');
});

await t('stops listening once a trusted success is handled', async () => {
  signInWithGoogle();
  await deliver(APP_ORIGIN, { type: 'google-auth-success', access_token: 'a', refresh_token: 'r' });
  assert.equal(listeners.size, 0, 'listener should be removed after success');
});

console.log(`${pass}/${pass + fail} Google sign-in origin assertions passed${fail ? ` — ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
