// Contract audit: the frontend and the API must agree on names.
//
// Two classes of bug this catches, neither of which a page-load smoke test can:
//   1. a button that calls an action or resource the server does not implement
//      ("Unknown action" only happens when a user clicks it);
//   2. a server action that forgot to authorise the caller.
//
// Usage: node dev/audit-contract.mjs
import fs from 'node:fs';
import path from 'node:path';

const walk = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) acc.push(p);
  }
  return acc;
};

const actionsSrc = fs.readFileSync('api/actions.js', 'utf8');
const dataSrc = fs.readFileSync('api/data.js', 'utf8');

/* ------------------------- what the server implements ------------------------ */
// handlers are declared either as H['name'] = … or H.name = …
const handlers = new Set([
  ...[...actionsSrc.matchAll(/H\[['"]([a-z_.]+)['"]\]\s*=/g)].map((m) => m[1]),
  ...[...actionsSrc.matchAll(/\bH\.([a-z_]+)\s*=/g)].map((m) => m[1]),
]);
const pendingOk = new Set(
  ((actionsSrc.match(/const PENDING_OK = \[([\s\S]*?)\]/) || [, ''])[1])
    .split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean),
);
const resources = new Set([...dataSrc.matchAll(/^ {2}([a-z_]+): \{ read:/gm)].map((m) => m[1]));

/* --------------------------- what the client calls -------------------------- */
const files = walk('src');
const acts = new Set();
const res = new Set();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bact\(\s*'([a-z_.]+)'/g)) acts.add(m[1]);
  for (const m of src.matchAll(/\b(?:getRes|updateRes|delRes)\(\s*'([a-z_]+)'/g)) res.add(m[1]);
  for (const m of src.matchAll(/'([a-z_]+\.[a-z_]+)'/g)) {
    // action names referenced only as strings (e.g. audit.event allowlists) are ignored
    if (handlers.has(m[1])) acts.add(m[1]);
  }
}

/* ------------------------- authorisation of each handler -------------------- */
// Actions that operate on the caller's own records need no role check; everything
// else must gate on requireRole / ownEmployee / ownVendor within its first lines,
// or be listed here with a reason.
const SELF_SCOPED = {
  'prefs.save': 'writes ctx.profile.prefs',
  'profile.update': 'writes ctx.profile',
  'mfa.sync': 'reads the caller’s own auth factors',
  'audit.event': 'allowlisted client events, actor taken from ctx',
  'notifications.list': 'scoped to ctx.profile.id',
  'notifications.read': 'scoped to ctx.profile.id',
  'leave.balances': 'ownEmployee()',
  'leave.cancel': 'own request or admin',
  'ticket.create': 'creates for ctx.profile.id',
  'ticket.reply': 'owner or admin check',
  'ticket.status': 'owner (resolve only) or admin',
  'chat.list': 'membership filter on ctx.profile.id',
  'chat.messages': 'myConversation() membership check',
  'chat.send': 'myConversation() membership check',
  'chat.create': 'allowedContacts() recipient check',
  'chat.contacts': 'allowedContacts() scopes the list to who the caller may message',
  dashboard: 'role-branched read-only aggregates',
};

const problems = [];
const warnings = [];

for (const name of acts) {
  if (!handlers.has(name) && !pendingOk.has(name)) problems.push(`UI calls action "${name}" which the server does not implement`);
}
for (const name of res) {
  if (!resources.has(name)) problems.push(`UI reads resource "${name}" which data.js does not expose`);
}
for (const name of pendingOk) {
  if (!handlers.has(name)) problems.push(`PENDING_OK lists "${name}" but no handler exists`);
}

const blocks = [...actionsSrc.matchAll(/H(?:\[['"]([a-z_.]+)['"]\]|\.([a-z_]+))\s*=\s*async[\s\S]*?(?=\nH(?:\[|\.)|$)/g)];
for (const m of blocks) {
  const name = m[1] || m[2];
  const body = m[0];
  const head = body.split('\n').slice(0, 8).join('\n');
  const guarded = /requireRole\(|requireAnyRole\(|ownEmployee\(|ownVendor\(|ownProfile\(|isAdmin\(ctx\)/.test(head);
  if (!guarded && !SELF_SCOPED[name]) warnings.push(`action "${name}" has no visible role/ownership guard`);
}

/* ------------------------------ dead handlers ------------------------------- */
const neverCalled = [...handlers].filter((h) => !acts.has(h) && !pendingOk.has(h)).sort();

/* ---------------------------- test coverage -------------------------------- */
// Which handlers does the API suite actually call? Keep this honest: a handler
// nobody exercises is a handler whose guards have never been run.
const testSrc = fs.readFileSync('dev/api-test.mjs', 'utf8');
// Handlers are named as quoted strings in the test file (`'payroll.run'`, `'dashboard'`).
const tested = new Set([...handlers].filter((h) => testSrc.includes(`'${h}'`) || testSrc.includes(`"${h}"`)));
const untested = [...handlers].filter((h) => !tested.has(h)).sort();

/* --------------------------------- report ---------------------------------- */
console.log(`client actions: ${acts.size} · server handlers: ${handlers.size} · resources: ${resources.size}`);
if (neverCalled.length) console.log(`handlers not referenced by the UI (may be integration-only): ${neverCalled.join(', ')}`);
console.log(`actions exercised by dev/api-test.mjs: ${tested.size}/${handlers.size}`);
if (untested.length) console.log(`handlers with no API test: ${untested.join(', ')}`);
if (warnings.length) console.log(`\nWARN (${warnings.length}):\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
console.log(`\n=== CONTRACT PROBLEMS (${problems.length}) ===`);
console.log(problems.length ? problems.map((p) => `  - ${p}`).join('\n') : 'none — every action and resource the UI uses exists on the server');
process.exit(problems.length ? 1 : 0);
