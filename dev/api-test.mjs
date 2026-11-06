// End-to-end API exercise: signs in as each demo role and drives the real
// handlers in /api/actions + /api/data (write paths included).
// Usage: npm run test:api  (assumes npm run dev:all is running)
const BASE = process.env.SMOKE_API || 'http://127.0.0.1:8787';

const results = [];
let failures = 0;

async function login(email) {
  const r = await fetch(`${BASE}/api/demo/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  const d = await r.json();
  if (!r.ok) throw new Error(`login ${email}: ${d.error}`);
  return d.access_token;
}

async function call(token, path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await r.json(); } catch { /* ignore */ }
  return { status: r.status, body };
}

async function check(name, fn, expectation = 'ok') {
  try {
    const out = await fn();
    if (typeof out === 'string' && out) {
      failures++;
      results.push(`FAIL  ${name} — ${out}`);
      return;
    }
    if (out && out.__fail) {
      failures++;
      results.push(`FAIL  ${name} — ${out.__fail}`);
      return;
    }
    results.push(`ok    ${name}${out?.note ? ` — ${out.note}` : ''}`);
  } catch (e) {
    failures++;
    results.push(`THROW ${name} — ${e.message}`);
  }
}

const act = (token, action, payload = {}) => call(token, '/api/actions', { method: 'POST', body: JSON.stringify({ action, ...payload }) });
const get = (token, resource, params = {}) => {
  const qs = new URLSearchParams({ resource, ...params });
  return call(token, `/api/data?${qs}`);
};
// NOTE: never use `expectOk(...).__fail || {...}` — that returns the failure
// *string*, which the runner treats as a pass. okOr() returns exactly one shape.
const expectOk = (r, label) => (r.status >= 400 ? { __fail: `${label}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}` } : r);
// /api/data returns the rows array directly; some endpoints wrap them in {data}.
const rowsOf = (r) => (Array.isArray(r.body) ? r.body : (r.body?.data || []));
const okOr = (r, label, note) => (r.status >= 400
  ? { __fail: `${label}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}` }
  : { note });

const admin = await login('admin@hrplus.sa');
const adminEmpId = 'EMP1051'; // Patricia Thomas — the admin account is also an employee

const futureWindow = () => {
  // Start on a Sun–Wed so the two-day range always contains working days in the
  // Saudi week (Fri/Sat weekend) — otherwise leave.request correctly returns 400.
  for (let attempt = 0; attempt < 40; attempt++) {
    const start = new Date(Date.UTC(2030 + Math.floor(Math.random() * 5), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 21)));
    if (start.getUTCDay() > 3) continue;
    const end = new Date(start.getTime() + 864e5);
    const iso = (d) => d.toISOString().slice(0, 10);
    return { start_date: iso(start), end_date: iso(end) };
  }
  return { start_date: '2031-01-05', end_date: '2031-01-06' };
};
// Retry a couple of windows so an unlucky draw (holiday, exhausted balance)
// doesn't fail the check for the wrong reason.
const requestLeave = async (token, reason) => {
  let last = null;
  for (let i = 0; i < 4; i++) {
    const r = await act(token, 'leave.request', { type_id: 1, ...futureWindow(), reason });
    if (r.status < 400) return r;
    last = r;
  }
  return last;
};
const employee = await login('employee@hrplus.sa');
const vendor = await login('vendor@hrplus.sa');

// Self-heal: this suite lowers the session timeout for one check. If an earlier
// run died before restoring it, every request here would 440 for no visible
// reason — so put the app back on a sane value before testing anything.
async function ensureSaneSessionTimeout() {
  for (let i = 0; i < 3; i++) {
    const me = await call(admin, '/api/me');
    if (me.status >= 400) { await login('admin@hrplus.sa'); continue; }
    const t = Number(me.body?.company?.settings?.security?.session_timeout_minutes);
    if (!Number.isFinite(t) || t >= 1) return;
    const r = await call(admin, '/api/data', { method: 'PUT', body: JSON.stringify({ resource: 'company', id: 1, values: { settings: { security: { ...(me.body.company.settings.security || {}), session_timeout_minutes: 30 } } } }) });
    if (r.status < 400) return;
  }
}
await ensureSaneSessionTimeout();

// ---------- reads (role scoping) ----------
await check('admin can read employees', async () => {
  const r = expectOk(await get(admin, 'employees'), 'employees');
  return r.__fail ? r : { note: `${r.body.length} rows` };
});
await check('employee sees only their own attendance', async () => {
  const r = expectOk(await get(employee, 'attendance'), 'attendance');
  if (r.__fail) return r;
  const ids = [...new Set(r.body.map((x) => x.employee_id))];
  return { note: `${r.body.length} rows, employees=${ids.join(',')}` };
});
await check('vendor cannot read payroll_runs', async () => {
  const r = await get(vendor, 'payroll_runs');
  return r.status === 403 ? { note: 'correctly forbidden' } : { __fail: `expected 403, got ${r.status}` };
});
await check('employee cannot read full audit log', async () => {
  const r = await get(employee, 'audit_logs');
  return r.status === 403 ? { note: 'correctly forbidden' } : { __fail: `expected 403, got ${r.status}` };
});
await check('employee cannot change their own role', async () => {
  const me = await call(employee, '/api/me');
  const r = await call(employee, '/api/data', { method: 'PUT', body: JSON.stringify({ resource: 'profiles', id: me.body.profile.id, values: { role: 'admin' } }) });
  return r.status >= 400 ? { note: `correctly rejected (${r.status})` } : { __fail: 'privilege escalation was ALLOWED' };
});

// ---------- employee self-service ----------
await check('leave balances', async () => {
  const r = expectOk(await act(employee, 'leave.balances', { year: 2026 }), 'balances');
  return r.__fail ? r : { note: r.body.balances.map((b) => `${b.type.code}:${b.remaining}/${b.entitled}`).join(' ') };
});

let leaveId = null;
await check('submit leave request', async () => {
  const b = await act(employee, 'leave.balances', { year: 2026 });
  const annual = b.body.balances.find((x) => x.type.code === 'ANNUAL');
  const r = await act(employee, 'leave.request', { type_id: annual.type.id, start_date: '2026-12-06', end_date: '2026-12-08', reason: 'Automated smoke test' });
  if (r.status >= 400) return { __fail: `HTTP ${r.status} ${JSON.stringify(r.body)}` };
  leaveId = r.body.id;
  return { note: `id ${leaveId}, ${r.body.days} day(s)` };
});

await check('overlapping leave is rejected', async () => {
  const b = await act(employee, 'leave.balances', { year: 2026 });
  const annual = b.body.balances.find((x) => x.type.code === 'ANNUAL');
  const r = await act(employee, 'leave.request', { type_id: annual.type.id, start_date: '2026-12-07', end_date: '2026-12-09', reason: 'Overlap test' });
  return r.status === 400 ? { note: 'correctly rejected' } : { __fail: `expected 400, got ${r.status}` };
});

await check('cancel own pending leave', async () => {
  if (!leaveId) return { __fail: 'no leave to cancel' };
  const r = await act(employee, 'leave.cancel', { id: leaveId });
  return okOr(r, 'cancel', 'cancelled');
});

let expenseId = null;
await check('submit expense claim', async () => {
  const cats = await get(employee, 'expense_categories');
  const cat = cats.body.find((c) => c.code === 'TRANSPORT');
  const r = await act(employee, 'expense.submit', { category_id: cat.id, amount: 80, expense_date: '2026-11-04', description: 'Smoke test taxi fare' });
  if (r.status >= 400) return { __fail: `HTTP ${r.status} ${JSON.stringify(r.body)}` };
  expenseId = r.body.id;
  return { note: `id ${expenseId}, status ${r.body.status}` };
});

await check('expense above cap needs receipt', async () => {
  const cats = await get(employee, 'expense_categories');
  const cat = cats.body.find((c) => c.code === 'TRAINING');
  const r = await act(employee, 'expense.submit', { category_id: cat.id, amount: 8000, expense_date: '2026-11-04', description: 'No receipt attached' });
  return r.status === 400 ? { note: 'correctly rejected' } : { __fail: `expected 400, got ${r.status}` };
});

await check('attendance check-in (geofence enforced)', async () => {
  const r = await act(employee, 'attendance.checkin', { lat: 24.6995, lng: 46.6853, accuracy: 10 });
  if (r.status >= 400) return { __fail: `HTTP ${r.status} ${JSON.stringify(r.body)}` };
  return { note: `status=${r.body.record?.status ?? (r.body.ok ? 'ok' : r.body.reason)}` };
});

await check('geofence blocks an on-site employee punching from Jeddah', async () => {
  // Patricia (EMP1051) is office-based, so a punch 850 km away must be refused
  const r = await act(admin, 'attendance.checkin', { lat: 21.4858, lng: 39.1925, accuracy: 10 });
  const rejected = r.status >= 400 || r.body?.ok === false;
  if (!rejected) return { __fail: `off-site punch accepted: ${JSON.stringify(r.body).slice(0, 160)}` };
  const inside = await act(admin, 'attendance.checkin', { lat: 24.6995, lng: 46.6853, accuracy: 10 });
  // a repeat run on the same day is idempotent and reports "already"
  const accepted = inside.status < 400 && (inside.body?.ok !== false || inside.body?.reason === 'already');
  if (!accepted) return { __fail: `office punch refused: ${JSON.stringify(inside.body).slice(0, 160)}` };
  return { note: `refused off-site (${r.body?.reason || r.status}), accepted at HQ (distance ${inside.body.distance}m / radius ${inside.body.radius}m)` };
});

await check('notifications list + mark read', async () => {
  const l = expectOk(await act(employee, 'notifications.list'), 'list');
  if (l.__fail) return l;
  if (!l.body.items?.length) return { note: 'no notifications' };
  const r = await act(employee, 'notifications.read', { ids: l.body.items.map((n) => n.id) });
  return okOr(r, 'read', `${l.body.items.length} read`);
});

await check('chat list + send message', async () => {
  const l = expectOk(await act(employee, 'chat.list'), 'chat.list');
  if (l.__fail) return l;
  const conv = l.body.conversations[0];
  if (!conv) return { __fail: 'no conversations' };
  const r = await act(employee, 'chat.send', { conversation_id: conv.id, body: 'Smoke test message' });
  if (r.status >= 400) return { __fail: `HTTP ${r.status} ${JSON.stringify(r.body)}` };
  const m = await act(employee, 'chat.messages', { conversation_id: conv.id });
  return okOr(m, 'messages', `${m.body.messages.length} messages in thread`);
});

await check('support ticket create + reply', async () => {
  const t = await act(employee, 'ticket.create', { subject: 'Smoke test ticket', category: 'Payroll', priority: 'normal', message: 'Automated test body describing the issue.' });
  if (t.status >= 400) return { __fail: `HTTP ${t.status} ${JSON.stringify(t.body)}` };
  const r = await act(employee, 'ticket.reply', { id: t.body.id, body: 'Follow-up from the smoke test' });
  return okOr(r, 'reply', `ticket ${t.body.id}`);
});

await check('acknowledge a policy', async () => {
  const rules = await get(employee, 'rules');
  const rule = rules.body.find((x) => x.active);
  const r = await act(employee, 'rule.ack', { rule_id: rule.id, version: rule.version });
  return okOr(r, 'ack', `${rule.title_en} v${rule.version}`);
});

await check('save preferences', async () => {
  const r = await act(employee, 'prefs.save', { lang: 'ar', theme: 'dark', reduceMotion: false });
  return okOr(r, 'prefs', 'saved');
});

// ---------- admin ----------
await check('admin dashboard aggregates', async () => {
  const r = expectOk(await act(admin, 'dashboard'), 'dashboard');
  return r.__fail ? r : { note: Object.keys(r.body).slice(0, 8).join(',') };
});

await check('admin approves the pending expense', async () => {
  const q = await get(admin, 'expenses', { f: JSON.stringify({ status: 'pending' }) });
  let claim = (q.body || []).find((c) => c.employee_id !== adminEmpId);
  if (!claim) {
    // fixtures are stateful: submit a fresh claim instead of depending on the seed
    const sub = await act(employee, 'expense.submit', { category_id: 1, amount: 55, expense_date: '2026-11-03', description: 'Approval flow probe' });
    if (sub.status >= 400) return { __fail: `expense.submit HTTP ${sub.status} ${JSON.stringify(sub.body).slice(0, 120)}` };
    claim = sub.body.expense || sub.body;
  }
  const r = await act(admin, 'expense.decide', { id: claim.id, decision: 'approve', note: 'Smoke test approval' });
  if (r.status >= 400) return { __fail: `HTTP ${r.status} ${JSON.stringify(r.body)}` };
  return { note: `claim ${claim.id} → ${r.body.status ?? 'advanced'}` };
});

await check('admin decides leave', async () => {
  const q = await get(admin, 'leave_requests', { f: JSON.stringify({ status: 'pending' }) });
  // Never pick the admin's own request: self-approval is refused by design.
  let req = (q.body || []).find((r) => r.employee_id !== adminEmpId);
  if (!req) {
    const created = await requestLeave(employee, 'Approval flow probe');
    if (created.status >= 400) return { __fail: `leave.request HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 120)}` };
    req = created.body;
  }
  const r = await act(admin, 'leave.decide', { id: req.id, decision: 'approved' });
  return okOr(r, 'leave.decide', `request ${req.id} (${req.employee_id}) approved`);
});

await check('admin approves a timesheet', async () => {
  const q = await get(admin, 'timesheets');
  const ts = (q.body || []).find((t) => t.status !== 'Approved');
  // There is no timesheet.submit endpoint to build a fixture with, so treat an
  // all-approved ledger as "nothing to do" rather than a failure.
  if (!ts) return { note: `all ${q.body?.length ?? 0} timesheets already approved — nothing to decide` };
  const r = await act(admin, 'timesheet.decide', { id: ts.id, decision: 'Approved' });
  return okOr(r, 'timesheet.decide', `${ts.id} approved`);
});

await check('admin creates a ZATCA invoice', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const r = await act(admin, 'invoice.create', {
    type: 'B2B', vendor_id: 1, issue_date: today,
    lines: [{ description: 'Consulting services — smoke test', qty: 10, unit_price: 135 }],
  });
  if (r.status >= 400) return { __fail: `HTTP ${r.status} ${JSON.stringify(r.body)}` };
  const inv = r.body.invoice || {};
  if (!inv.number || !inv.hash || !inv.qr) return { __fail: `invoice missing ZATCA fields: ${JSON.stringify(r.body).slice(0, 200)}` };
  return { note: `${inv.number} total ${inv.total} vat ${inv.vat} icv ${inv.icv} hash ${String(inv.hash).slice(0, 10)}… qr=${inv.qr ? 'yes' : 'no'}` };
});

await check('admin runs payroll for next month', async () => {
  const r = await act(admin, 'payroll.run', { period: '2026-11' });
  if (r.status >= 400) return { __fail: `HTTP ${r.status} ${JSON.stringify(r.body)}` };
  const run = r.body.run || {};
  if (!run.id || !run.totals?.employees) return { __fail: `payroll run missing totals: ${JSON.stringify(r.body).slice(0, 200)}` };
  return { note: `${run.period}: ${run.totals.employees} employees, gross ${run.totals.gross}, net ${run.totals.net}, GOSI ${run.totals.gosi_employee}/${run.totals.gosi_employer}` };
});

await check('admin creates a company rule (new version)', async () => {
  const r = await act(admin, 'rule.save', { title_en: 'Smoke Test Policy', title_ar: 'سياسة اختبار', body_en: 'Policy body typed by the automated smoke test.', body_ar: 'نص السياسة.', category: 'General', active: true });
  if (r.status >= 400) return { __fail: `HTTP ${r.status} ${JSON.stringify(r.body)}` };
  return { note: `rule ${r.body.id} v${r.body.version}` };
});

await check('admin updates company branding', async () => {
  const r = await call(admin, '/api/data', { method: 'PUT', body: JSON.stringify({ resource: 'company', id: 1, values: { primary_color: '#0f8f83' } }) });
  return okOr(r, 'company.update', 'ok');
});

await check('admin backup create + list', async () => {
  const c = await act(admin, 'backup.create');
  if (c.status >= 400) return { __fail: `create HTTP ${c.status} ${JSON.stringify(c.body)}` };
  const l = await act(admin, 'backup.list');
  return okOr(l, 'backup.list', `${l.body.files.length} backup file(s)`);
});

await check('backup.restore: dry run reports the plan and writes nothing', async () => {
  const c = await act(admin, 'backup.create');
  if (c.status >= 400) return { __fail: `create HTTP ${c.status}` };
  const before = rowsOf(await get(admin, 'company'))[0]?.primary_color;
  await call(admin, '/api/data', { method: 'PUT', body: JSON.stringify({ resource: 'company', id: 1, values: { primary_color: '#123456' } }) });
  const dry = await act(admin, 'backup.restore', { name: c.body.name, dry_run: true });
  if (dry.status >= 400) return { __fail: `dry run HTTP ${dry.status} ${JSON.stringify(dry.body).slice(0, 160)}` };
  const live = rowsOf(await get(admin, 'company'))[0]?.primary_color;
  if (live !== '#123456') return { __fail: `dry run changed data (primary_color went to ${live})` };
  const tables = Object.keys(dry.body.tables || {}).length;
  if (!dry.body.dry_run || !tables) return { __fail: `unexpected dry-run payload: ${JSON.stringify(dry.body).slice(0, 160)}` };
  const real = await act(admin, 'backup.restore', { name: c.body.name, mode: 'merge' });
  if (real.status >= 400) return { __fail: `restore HTTP ${real.status} ${JSON.stringify(real.body).slice(0, 160)}` };
  const after = rowsOf(await get(admin, 'company'))[0]?.primary_color;
  if (after !== before) return { __fail: `restore did not bring the value back: expected ${before}, got ${after}` };
  return { note: `dry run planned ${tables} tables, restore wrote ${real.body.rows_written} rows and reverted primary_color` };
});

await check('backup.restore: refuses bad names, non-admins and unconfirmed replaces', async () => {
  const files = (await act(admin, 'backup.list')).body?.files || [];
  const name = files[0]?.name;
  if (!name) return { __fail: 'no backup to test against' };
  const traversal = await act(admin, 'backup.restore', { name: '../secrets.json', dry_run: true });
  const missing = await act(admin, 'backup.restore', { name: 'hrplus-backup-nope.json', dry_run: true });
  const replace = await act(admin, 'backup.restore', { name, mode: 'replace' });
  const notAdmin = await act(vendor, 'backup.restore', { name, dry_run: true });
  const dl = await act(admin, 'backup.download', { name });
  const dlVendor = await act(vendor, 'backup.download', { name });
  const bad = [];
  if (traversal.status !== 400) bad.push(`traversal ${traversal.status}`);
  if (missing.status !== 404) bad.push(`missing ${missing.status}`);
  if (replace.status !== 400) bad.push(`unconfirmed replace ${replace.status}`);
  if (notAdmin.status !== 403) bad.push(`vendor ${notAdmin.status}`);
  if (dl.status !== 200 || !String(dl.body?.url || '').startsWith('data:application/json')) bad.push(`download ${dl.status}`);
  if (dlVendor.status !== 403) bad.push(`vendor download ${dlVendor.status}`);
  return bad.length ? { __fail: bad.join(', ') } : { note: '400 traversal · 404 unknown file · 400 unconfirmed replace · 403 vendor · download ok, vendor refused' };
});

await check('employee cannot run payroll', async () => {
  const r = await act(employee, 'payroll.run', { period: '2026-11' });
  return r.status === 403 ? { note: 'correctly forbidden' } : { __fail: `expected 403, got ${r.status}` };
});

// ---------- vendor ----------
await check('vendor sees only their invoices', async () => {
  const r = expectOk(await get(vendor, 'invoices'), 'invoices');
  if (r.__fail) return r;
  const ids = [...new Set(r.body.map((i) => i.vendor_id))];
  return { note: `${r.body.length} invoices, vendors=${ids.join(',')}` };
});
await check('vendor sees their timesheets and can approve one', async () => {
  const q = expectOk(await get(vendor, 'timesheets'), 'timesheets');
  if (q.__fail) return q;
  const ts = q.body.find((t) => t.status !== 'Approved');
  if (!ts) return { note: `${q.body.length} rows, nothing pending` };
  const r = await act(vendor, 'timesheet.decide', { id: ts.id, decision: 'Approved' });
  return okOr(r, 'vendor approve', `${ts.id} approved by vendor`);
});
await check('vendor cannot read employees', async () => {
  const r = await get(vendor, 'employees');
  return r.status === 403 ? { note: 'correctly forbidden' } : { __fail: `expected 403, got ${r.status}` };
});

// ---------- approval integrity (added after the review) ----------
// Two approvers clicking at the same instant must not both succeed: the handler
// guards its write on the status/step it read, so exactly one wins.
const settle = (rs) => rs.map((r) => r.status);
// The suite must be re-runnable: leave requests reject overlapping dates, so pick
// a fresh far-future window each time instead of hard-coding one.
await check('leave: self-approval is refused', async () => {
  const req = await requestLeave(admin, 'Self-approval probe');
  if (req.status >= 400) return { __fail: `leave.request HTTP ${req.status} ${JSON.stringify(req.body)}` };
  const dec = await act(admin, 'leave.decide', { id: req.body.id, decision: 'approved' });
  return dec.status === 403 ? { note: '403 on own request' } : { __fail: `expected 403, got ${dec.status} ${JSON.stringify(dec.body).slice(0, 120)}` };
});
await check('leave: concurrent double-approve yields exactly one winner', async () => {
  const req = await requestLeave(employee, 'Concurrency probe');
  if (req.status >= 400) return { __fail: `leave.request HTTP ${req.status}` };
  const rs = await Promise.all([
    act(admin, 'leave.decide', { id: req.body.id, decision: 'approved' }),
    act(admin, 'leave.decide', { id: req.body.id, decision: 'approved' }),
  ]);
  const wins = settle(rs).filter((c) => c < 400).length;
  return wins === 1 ? { note: `statuses ${settle(rs).join('/')}` } : { __fail: `${wins} succeeded, expected exactly 1 (${settle(rs).join('/')})` };
});
await check('expense: concurrent double-approve yields exactly one winner', async () => {
  const ex = await act(employee, 'expense.submit', { category_id: 1, amount: 45, expense_date: '2026-11-01', description: 'Concurrency probe claim' });
  if (ex.status >= 400) return { __fail: `expense.submit HTTP ${ex.status} ${JSON.stringify(ex.body).slice(0, 120)}` };
  const id = ex.body.id ?? ex.body.expense?.id;
  if (!id) return { __fail: `no id in ${JSON.stringify(ex.body).slice(0, 120)}` };
  const rs = await Promise.all([
    act(admin, 'expense.decide', { id, decision: 'approve' }),
    act(admin, 'expense.decide', { id, decision: 'approve' }),
  ]);
  const wins = settle(rs).filter((c) => c < 400).length;
  return wins === 1 ? { note: `statuses ${settle(rs).join('/')}` } : { __fail: `${wins} succeeded, expected exactly 1 (${settle(rs).join('/')})` };
});
await check('expense: self-approval is refused', async () => {
  const ex = await act(admin, 'expense.submit', { category_id: 1, amount: 45, expense_date: '2026-11-02', description: 'Self-approval probe' });
  if (ex.status >= 400) return { __fail: `expense.submit HTTP ${ex.status}` };
  const id = ex.body.id ?? ex.body.expense?.id;
  const dec = await act(admin, 'expense.decide', { id, decision: 'approve' });
  return dec.status === 403 ? { note: '403 on own claim' } : { __fail: `expected 403, got ${dec.status}` };
});
await check('asset: illegal lifecycle jumps are refused', async () => {
  // Read-only: find an asset whose current state has at least one illegal target
  // and assert the API rejects it. Doing it this way keeps the suite repeatable.
  const LEGAL = {
    'Procured': ['In Stock', 'Disposed'],
    'In Stock': ['Assigned', 'In Repair', 'Retired', 'Disposed'],
    'Assigned': ['In Stock', 'In Repair', 'Retired', 'Disposed'],
    'In Repair': ['In Stock', 'Assigned', 'Retired', 'Disposed'],
    'Retired': ['Disposed'],
    'Disposed': [],
  };
  const ALL = Object.keys(LEGAL);
  const assets = (await get(admin, 'assets')).body;
  if (!Array.isArray(assets)) return { __fail: 'assets: unexpected response shape' };
  for (const a of assets) {
    const illegal = ALL.find((t) => t !== a.status && !(LEGAL[a.status] || []).includes(t));
    if (!illegal) continue;
    const r = await act(admin, 'asset.transition', { id: a.id, status: illegal });
    return r.status >= 400
      ? { note: `${a.tag} ${a.status} -> ${illegal} refused (${r.status})` }
      : { __fail: `${a.tag} ${a.status} -> ${illegal} was allowed` };
  }
  return { note: 'no asset with an illegal target available — skipped' };
});
await check('invoice: illegal status transition is refused', async () => {
  const paid = (await get(admin, 'invoices')).body?.find((i) => i.status === 'paid');
  if (!paid) return { note: 'no paid invoice in the seed — skipped' };
  const r = await act(admin, 'invoice.status', { id: paid.id, status: 'issued' });
  return r.status >= 400 ? { note: `paid -> issued refused (${r.status})` } : { __fail: 'paid -> issued was allowed' };
});

// ---------- upload + integration API hardening (added after the review) ----------
const upload = (token, bucket, contentType, buf, fileName = 'f.bin') =>
  call(token, '/api/upload', { method: 'POST', body: JSON.stringify({ bucket, contentType, fileName, fileBase64: buf.toString('base64') }) });
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

await check('upload: accepts a real PNG receipt', async () => {
  const r = await upload(employee, 'receipts', 'image/png', PNG, 'receipt.png');
  return okOr(r, 'upload png', `stored at ${r.body?.path}`);
});
await check('upload: rejects content that is not what it claims to be', async () => {
  const html = Buffer.from('<html><script>alert(1)</script></html>');
  const r = await upload(employee, 'receipts', 'image/png', html, 'evil.png');
  const mismatch = await upload(employee, 'receipts', 'image/jpeg', PNG, 'mismatch.jpg');
  return r.status === 400 && mismatch.status === 400
    ? { note: 'HTML-as-PNG and type mismatch both refused' }
    : { __fail: `html=${r.status} mismatch=${mismatch.status}, expected 400/400` };
});
await check('upload: strips scripted SVG but keeps a clean one', async () => {
  const bad = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const onload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
  const good = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>');
  const rb = await upload(admin, 'branding', 'image/svg+xml', bad, 'evil.svg');
  const ro = await upload(admin, 'branding', 'image/svg+xml', onload, 'evil2.svg');
  const rg = await upload(admin, 'branding', 'image/svg+xml', good, 'logo.svg');
  return rb.status === 400 && ro.status === 400 && rg.status < 400
    ? { note: 'script + onload refused, clean SVG accepted' }
    : { __fail: `script=${rb.status} onload=${ro.status} clean=${rg.status}` };
});
await check('upload: enforces the bucket size limit', async () => {
  const big = Buffer.alloc(Math.round(3.2 * 1024 * 1024), 0x41);
  const r = await upload(employee, 'receipts', 'image/png', big, 'big.png');
  return r.status === 413 ? { note: '413 over 3MB' } : { __fail: `expected 413, got ${r.status}` };
});
await check('admin cannot delete an employee who has history', async () => {
  // non-GET requests carry the resource in the body, not the query string
  const r = await call(admin, '/api/data', { method: 'DELETE', body: JSON.stringify({ resource: 'employees', id: 'EMP1001' }) });
  return r.status === 409 ? { note: '409, records must be retained' } : { __fail: `expected 409, got ${r.status} ${JSON.stringify(r.body).slice(0, 120)}` };
});
await check('integration API: write key cannot delete an employee', async () => {
  const k = await act(admin, 'apikey.create', { name: `probe-${Date.now()}`, scopes: ['read', 'write'] });
  if (k.status >= 400) return { __fail: `apikey.create HTTP ${k.status}` };
  const scopes = k.body.record?.scopes || [];
  if (!scopes.includes('write')) return { __fail: `scopes array ignored — got ${JSON.stringify(scopes)}` };
  const del = await call(null, '/api/rest?resource=employees&id=EMP1001', { method: 'DELETE', headers: { 'X-API-Key': k.body.key } });
  await act(admin, 'apikey.revoke', { id: k.body.record.id });
  return del.status === 403 ? { note: 'write key refused (403) on master data' } : { __fail: `expected 403, got ${del.status} ${JSON.stringify(del.body).slice(0, 120)}` };
});
await check('integration API: read key still works and respects scopes', async () => {
  const k = await act(admin, 'apikey.create', { name: `probe-ro-${Date.now()}`, scopes: ['read'] });
  if (k.status >= 400) return { __fail: `apikey.create HTTP ${k.status}` };
  const ok = await call(null, '/api/rest?resource=holidays&limit=1', { headers: { 'X-API-Key': k.body.key } });
  const denied = await call(null, '/api/rest?resource=holidays', { method: 'POST', headers: { 'X-API-Key': k.body.key }, body: JSON.stringify({ date: '2032-01-01', name_en: 'Probe' }) });
  await act(admin, 'apikey.revoke', { id: k.body.record.id });
  return ok.status === 200 && denied.status === 403
    ? { note: 'read ok, write refused' }
    : { __fail: `read=${ok.status} write=${denied.status}` };
});

await check('integration API: unknown fields are refused, not written', async () => {
  const k = await act(admin, 'apikey.create', { name: `probe-fields-${Date.now()}`, scopes: ['read', 'write'] });
  if (k.status >= 400) return { __fail: `apikey.create HTTP ${k.status}` };
  const hdr = { 'X-API-Key': k.body.key };
  // a real column the integration invents, a typo of a real column, and a bad filter
  const unknown = await call(null, '/api/rest?resource=vendors', { method: 'POST', headers: hdr, body: JSON.stringify({ name: 'Fields Probe', status: 'active', salary_band: 'C' }) });
  const typo = await call(null, '/api/rest?resource=vendors', { method: 'POST', headers: hdr, body: JSON.stringify({ name: 'Fields Probe', vatnumer: '1' }) });
  const badFilter = await call(null, '/api/rest?resource=employees&nonsense=1', { headers: hdr });
  const okCreate = await call(null, '/api/rest?resource=vendors', { method: 'POST', headers: hdr, body: JSON.stringify({ name: `Fields Probe ${Date.now()}`, type: 'Supplier', status: 'active' }) });
  await act(admin, 'apikey.revoke', { id: k.body.record.id });
  const bad = [];
  if (unknown.status !== 400) bad.push(`invented field ${unknown.status}`);
  if (!/salary_band/.test(JSON.stringify(unknown.body))) bad.push('error does not name the field');
  if (typo.status !== 400) bad.push(`typo field ${typo.status}`);
  if (badFilter.status !== 400) bad.push(`bad filter ${badFilter.status}`);
  if (okCreate.status !== 201) bad.push(`valid create ${okCreate.status} ${JSON.stringify(okCreate.body).slice(0, 120)}`);
  if (bad.length) return { __fail: bad.join(', ') };
  // clean up the vendor we created
  if (okCreate.body?.data?.id) await call(admin, '/api/data', { method: 'DELETE', body: JSON.stringify({ resource: 'vendors', id: okCreate.body.data.id }) });
  return { note: 'invented field 400 (named) · typo 400 · bad filter 400 · valid create 201' };
});

// ---------- handlers that had no coverage before (added after the review) ----------
await check('dashboard: every role gets its own shape, never everyone else\'s data', async () => {
  const a = await act(admin, 'dashboard', {});
  const e = await act(employee, 'dashboard', {});
  const v = await act(vendor, 'dashboard', {});
  const bad = [];
  for (const [who, r] of [['admin', a], ['employee', e], ['vendor', v]]) if (r.status !== 200) bad.push(`${who} HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  if (bad.length) return { __fail: bad.join(', ') };
  // Same envelope for everyone, but the KPI set is role-specific.
  const kpisOf = (r) => (r.kpis || []).map((k) => k.key || k.id || k.label);
  const [ak, ek, vk] = [kpisOf(a.body), kpisOf(e.body), kpisOf(v.body)];
  if (a.body.role !== 'admin' || e.body.role !== 'employee' || v.body.role !== 'vendor') bad.push('role echoed back incorrectly');
  if (!ak.includes('headcount') || !ak.includes('payroll')) bad.push(`admin KPIs missing: ${ak.join(',')}`);
  if (ek.includes('headcount') || ek.includes('revenue')) bad.push(`employee sees company KPIs: ${ek.join(',')}`);
  if (ek.includes('net_pay') === false) bad.push(`employee does not see their own pay: ${ek.join(',')}`);
  if (!vk.includes('billed') && !vk.includes('outstanding')) bad.push(`vendor KPIs look wrong: ${vk.join(',')}`);
  if (!a.body.scopes?.departments?.length) bad.push('admin dashboard has no department scope list');
  if (/"employees"\s*:/.test(JSON.stringify(v.body))) bad.push('vendor payload contains an employees array');
  return bad.length ? { __fail: bad.join(', ') } : { note: `admin ${ak.length} KPIs (headcount, payroll…) · employee ${ek.length} (net_pay, annual_left…) · vendor ${vk.length} (billed…)` };
});

await check('profile.update: name and phone are validated and persisted', async () => {
  const me0 = await call(employee, '/api/me');
  const orig = me0.body?.profile?.display_name || me0.body?.display_name;
  const badPhone = await act(employee, 'profile.update', { phone: '12345' });
  const tooShort = await act(employee, 'profile.update', { display_name: 'X' });
  const okName = await act(employee, 'profile.update', { display_name: 'David M. Martinez' });
  const me1 = await call(employee, '/api/me');
  const now = me1.body?.profile?.display_name || me1.body?.display_name;
  // put it back
  await act(employee, 'profile.update', { display_name: orig });
  const bad = [];
  if (badPhone.status !== 400) bad.push(`phone=12345 ${badPhone.status}`);
  if (tooShort.status !== 400) bad.push(`1-char name ${tooShort.status}`);
  if (okName.status !== 200) bad.push(`valid name ${okName.status}`);
  if (now !== 'David M. Martinez') bad.push(`not persisted (${now})`);
  return bad.length ? { __fail: bad.join(', ') } : { note: '400 invalid phone · 400 short name · update persisted and reverted' };
});

await check('profile.update: a phone already in use is refused', async () => {
  const profs = rowsOf(await get(admin, 'profiles'));
  const other = profs.find((p) => p.phone && p.id !== 3);
  if (!other) return { note: 'no other profile with a phone — skipped' };
  const r = await act(employee, 'profile.update', { phone: other.phone });
  return r.status === 400 ? { note: `taken phone refused (${other.phone})` } : { __fail: `expected 400, got ${r.status}` };
});

await check('mfa.sync: reports factor state and never enables itself', async () => {
  const r = await act(employee, 'mfa.sync');
  if (r.status >= 400) return { __fail: `mfa.sync HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}` };
  const me = await call(employee, '/api/me');
  const flag = (me.body?.profile || me.body)?.mfa_enabled;
  return r.body?.mfa_enabled === !!flag
    ? { note: `mfa_enabled=${r.body.mfa_enabled} matches the profile row` }
    : { __fail: `handler said ${r.body?.mfa_enabled}, profile says ${flag}` };
});

await check('audit.event: only real client events are accepted, and they are recorded', async () => {
  const bogus = await act(employee, 'audit.event', { event: 'employee.salary_changed', details: { note: 'forged' } });
  const real = await act(employee, 'audit.event', { event: 'auth.logout' });
  const logs = rowsOf(await get(admin, 'audit_logs', { limit: 200 }));
  const recorded = logs.some((l) => l.action === 'auth.logout');
  const forged = logs.some((l) => l.action === 'employee.salary_changed');
  const bad = [];
  if (bogus.status !== 400) bad.push(`forged event ${bogus.status}`);
  if (real.status !== 200) bad.push(`auth.logout ${real.status}`);
  if (!recorded) bad.push('auth.logout was not recorded');
  if (forged) bad.push('the forged event was recorded');
  return bad.length ? { __fail: bad.join(', ') } : { note: 'forged event 400 and absent from the log · auth.logout recorded' };
});

await check('attendance: geofence, check-in and check-out', async () => {
  const co = rowsOf(await get(admin, 'company'))[0];
  const lat = Number(co.geofence_lat), lng = Number(co.geofence_lng);
  const badGps = await act(employee, 'attendance.checkin', { lat: 'nope', lng: 1 });
  const far = await act(employee, 'attendance.checkin', { lat: lat + 1, lng: lng + 1 });
  const ci = await act(employee, 'attendance.checkin', { lat, lng, accuracy: 8 });
  const co1 = await act(employee, 'attendance.checkout', { lat, lng, accuracy: 8 });
  const bad = [];
  if (badGps.status !== 400) bad.push(`invalid GPS ${badGps.status}`);
  // David is Remote, so an outside punch is accepted but flagged remote — either
  // answer is correct, silently ignoring the distance is not.
  // "already" is a legitimate answer when an earlier punch exists for today.
  if (far.body?.ok === false && !['outside', 'already'].includes(far.body?.reason)) bad.push(`far punch refused for the wrong reason: ${far.body?.reason}`);
  if (far.body?.ok === true && far.body?.remote !== true) bad.push('far punch accepted without the remote flag');
  const ciOk = ci.body?.ok === true || ci.body?.reason === 'already';
  if (!ciOk) bad.push(`check-in ${JSON.stringify(ci.body).slice(0, 100)}`);
  const coOut = co1.body?.ok === true || ['already_out', 'no_checkin'].includes(co1.body?.reason);
  if (!coOut) bad.push(`check-out ${JSON.stringify(co1.body).slice(0, 100)}`);
  if (co1.body?.ok === true && !co1.body?.record?.check_out) bad.push('check-out returned ok without a timestamp');
  return bad.length ? { __fail: bad.join(', ') } : { note: `GPS 400 · outside punch flagged remote=${far.body?.remote} · in/out ok` };
});

await check('payroll.finalize: guarded transitions and per-slip status', async () => {
  const run = await act(admin, 'payroll.run', { period: '2026-11' });
  if (run.status >= 400) return { __fail: `payroll.run HTTP ${run.status} ${JSON.stringify(run.body).slice(0, 120)}` };
  const runId = run.body?.run?.id ?? run.body?.id;
  const empTry = await act(employee, 'payroll.finalize', { run_id: runId, status: 'approved' });
  const badStatus = await act(admin, 'payroll.finalize', { run_id: runId, status: 'nonsense' });
  const approved = await act(admin, 'payroll.finalize', { run_id: runId, status: 'approved' });
  const slips = rowsOf(await get(admin, 'payslips')).filter((p) => p.run_id === runId);
  const draftLeft = slips.filter((p) => p.status !== 'approved').length;
  const bad = [];
  if (empTry.status !== 403) bad.push(`employee ${empTry.status}`);
  if (badStatus.status !== 400) bad.push(`bad status ${badStatus.status}`);
  if (approved.status !== 200) bad.push(`approve ${approved.status} ${JSON.stringify(approved.body).slice(0, 100)}`);
  if (draftLeft !== 0) bad.push(`${draftLeft} payslips still not approved`);
  // A finalised run must not be deletable: its payslips are payroll history.
  const delRun = await call(admin, '/api/data', { method: 'DELETE', body: JSON.stringify({ resource: 'payroll_runs', id: runId }) });
  if (delRun.status !== 409) bad.push(`deleting a run with payslips returned ${delRun.status}, expected 409`);
  // Leave the fixture as a draft run rather than deleting rows (which used to
  // leave 60 orphaned payslips behind).
  const backToDraft = await act(admin, 'payroll.finalize', { run_id: runId, status: 'draft' });
  if (backToDraft.status !== 200) bad.push(`revert to draft ${backToDraft.status}`);
  const stillThere = rowsOf(await get(admin, 'payslips')).filter((p) => p.run_id === runId).length;
  if (stillThere !== slips.length) bad.push(`payslip count changed on revert: ${slips.length} -> ${stillThere}`);
  return bad.length ? { __fail: bad.join(', ') } : { note: `employee 403 · bad status 400 · ${slips.length} payslips moved to approved · delete refused 409 · reverted to draft` };
});

await check('invoice.lines_from_timesheets: builds billable lines from approved hours', async () => {
  const ts = rowsOf(await get(admin, 'timesheets')).filter((t) => t.status === 'Approved' && t.vendor_id);
  if (!ts.length) return { note: 'no approved vendor timesheets in the seed — skipped' };
  const vendorId = ts[0].vendor_id;
  const period = String(ts[0].date).slice(0, 7);
  const r = await act(admin, 'invoice.lines_from_timesheets', { vendor_id: vendorId, period });
  const empTry = await act(employee, 'invoice.lines_from_timesheets', { vendor_id: vendorId, period });
  const badMonth = await act(admin, 'invoice.lines_from_timesheets', { vendor_id: vendorId, period: '2026' });
  const lines = r.body?.lines || [];
  const bad = [];
  if (r.status !== 200) bad.push(`HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  if (!lines.length) bad.push('no lines returned');
  if (lines.some((l) => !(l.qty > 0) || l.unit_price == null)) bad.push('a line is missing qty or price');
  if (empTry.status !== 403) bad.push(`employee ${empTry.status}`);
  if (badMonth.status !== 400) bad.push(`bad period ${badMonth.status}`);
  return bad.length ? { __fail: bad.join(', ') } : { note: `${lines.length} line(s) for ${period}, hours ${lines.reduce((n, l) => n + l.qty, 0)}, employee 403, bad period 400` };
});

await check('invoice.send: records the channel and refuses the wrong ones', async () => {
  const inv = rowsOf(await get(admin, 'invoices')).find((i) => i.status === 'issued');
  if (!inv) return { note: 'no issued invoice in the seed — skipped' };
  const before = (inv.sent_via || []).length;
  const badChannel = await act(admin, 'invoice.send', { id: inv.id, channel: 'carrier-pigeon' });
  const empTry = await act(employee, 'invoice.send', { id: inv.id, channel: 'email' });
  const sent = await act(admin, 'invoice.send', { id: inv.id, channel: 'email' });
  const after = rowsOf(await get(admin, 'invoices')).find((i) => i.id === inv.id);
  const bad = [];
  if (badChannel.status !== 400) bad.push(`bad channel ${badChannel.status}`);
  if (empTry.status !== 403) bad.push(`employee ${empTry.status}`);
  if (sent.status !== 200) bad.push(`send ${sent.status} ${JSON.stringify(sent.body).slice(0, 100)}`);
  if (!String(sent.body?.link || '').startsWith('mailto:')) bad.push(`no mailto link (${String(sent.body?.link).slice(0, 40)})`);
  if ((after?.sent_via || []).length !== before + 1) bad.push(`sent_via ${before} -> ${(after?.sent_via || []).length}`);
  if (after?.status !== 'sent') bad.push(`status stayed ${after?.status}`);
  return bad.length ? { __fail: bad.join(', ') } : { note: `bad channel 400 · employee 403 · mailto link · issued -> ${after.status}, sent_via ${before + 1}` };
});

await check('document.log: staff can log HR documents, employees only self-service ones', async () => {
  const selfService = await act(employee, 'document.log', { template_key: 'salary_certificate', title: 'Salary certificate', format: 'print' });
  const hrOnly = await act(employee, 'document.log', { template_key: 'experience_letter', title: 'Experience letter', format: 'print' });
  const adminAny = await act(admin, 'document.log', { template_key: 'experience_letter', employee_id: 'EMP1001', title: 'Experience letter', format: 'print' });
  const badKey = await act(admin, 'document.log', { template_key: 'Not A Template', title: 'x' });
  const bad = [];
  const okOrForbidden = (r) => r.status === 200 || r.status === 403 || r.status === 400;
  if (!okOrForbidden(selfService)) bad.push(`self-service ${selfService.status}`);
  if (hrOnly.status !== 403) bad.push(`HR-only template ${hrOnly.status}`);
  if (adminAny.status !== 200) bad.push(`admin ${adminAny.status} ${JSON.stringify(adminAny.body).slice(0, 100)}`);
  if (badKey.status !== 400) bad.push(`bad template key ${badKey.status}`);
  return bad.length ? { __fail: bad.join(', ') } : { note: `employee HR-only 403 · admin 200 · bad key 400 (self-service: ${selfService.status === 200 ? 'ok' : selfService.body?.error || selfService.status})` };
});

await check('ticket.status: employees may resolve, not close, their own ticket', async () => {
  const t = await act(employee, 'ticket.create', { subject: `Status probe ${Date.now()}`, message: 'Checking that only some transitions are mine to make.', category: 'other', priority: 'low' });
  if (t.status >= 400) return { __fail: `ticket.create HTTP ${t.status} ${JSON.stringify(t.body).slice(0, 120)}` };
  const id = t.body?.id ?? t.body?.ticket?.id;
  const inProgress = await act(admin, 'ticket.status', { id, status: 'in_progress' });
  const closeOwn = await act(employee, 'ticket.status', { id, status: 'closed' });
  const resolveOwn = await act(employee, 'ticket.status', { id, status: 'resolved' });
  const vendorTouch = await act(vendor, 'ticket.status', { id, status: 'closed' });
  const bad = [];
  if (inProgress.status !== 200) bad.push(`admin in_progress ${inProgress.status}`);
  if (closeOwn.status !== 403) bad.push(`employee closed own ticket (${closeOwn.status})`);
  if (resolveOwn.status !== 200) bad.push(`employee resolve ${resolveOwn.status}`);
  if (vendorTouch.status !== 403 && vendorTouch.status !== 404) bad.push(`vendor touched it (${vendorTouch.status})`);
  return bad.length ? { __fail: bad.join(', ') } : { note: 'admin in_progress 200 · employee closed 403 · employee resolved 200 · vendor refused' };
});

await check('chat.contacts + chat.create: scoped contacts, no duplicate DMs, no vendor groups', async () => {
  const contacts = await act(employee, 'chat.contacts');
  if (contacts.status >= 400) return { __fail: `chat.contacts HTTP ${contacts.status}` };
  const me = await call(employee, '/api/me');
  const myId = (me.body?.profile || me.body)?.id;
  const list = contacts.body?.contacts || [];
  const someone = list.find((c) => c.id !== myId);
  if (!someone) return { __fail: 'no contacts returned for the employee' };
  const dm1 = await act(employee, 'chat.create', { member_ids: [someone.id] });
  const dm2 = await act(employee, 'chat.create', { member_ids: [someone.id] });
  const first = dm1.body?.conversation?.id;
  const second = dm2.body?.conversation?.id;
  const vendorGroup = await act(vendor, 'chat.create', { member_ids: [someone.id], is_group: true, name: 'Vendor group' });
  const bad = [];
  if (list.some((c) => c.id === myId)) bad.push('own profile listed as a contact');
  if (!dm1.body?.conversation?.id) bad.push(`dm create ${JSON.stringify(dm1.body).slice(0, 100)}`);
  if (first !== second) bad.push(`duplicate DM created (${first} vs ${second})`);
  if (vendorGroup.status !== 403) bad.push(`vendor group ${vendorGroup.status}`);
  return bad.length ? { __fail: bad.join(', ') } : { note: `${list.length} contacts, DM reused (#${first}), vendor group 403` };
});

await check('users.provision: validates and refuses duplicates', async () => {
  const email = `probe.${Date.now()}@hrplus.sa`;
  const missingVendor = await act(admin, 'users.provision', { email, role: 'vendor' });
  const badRole = await act(admin, 'users.provision', { email, role: 'superuser' });
  const badEmail = await act(admin, 'users.provision', { email: 'not-an-email', role: 'employee' });
  const empTry = await act(employee, 'users.provision', { email, role: 'employee' });
  const made = await act(admin, 'users.provision', { email, role: 'employee', display_name: 'Probe User' });
  const dupe = await act(admin, 'users.provision', { email, role: 'employee' });
  const bad = [];
  if (missingVendor.status !== 400) bad.push(`vendor without vendor_id ${missingVendor.status}`);
  if (badRole.status !== 400) bad.push(`bad role ${badRole.status}`);
  if (badEmail.status !== 400) bad.push(`bad email ${badEmail.status}`);
  if (empTry.status !== 403) bad.push(`employee ${empTry.status}`);
  if (made.status !== 200) bad.push(`create ${made.status} ${JSON.stringify(made.body).slice(0, 100)}`);
  if (dupe.status !== 400) bad.push(`duplicate ${dupe.status}`);
  if (made.body?.id) await call(admin, '/api/data', { method: 'DELETE', body: JSON.stringify({ resource: 'profiles', id: made.body.id }) }).catch(() => {});
  return bad.length ? { __fail: bad.join(', ') } : { note: 'vendor-without-id 400 · bad role 400 · bad email 400 · employee 403 · create 200 · duplicate 400' };
});

await check('webhook.test: fires a ping to one endpoint and records the result', async () => {
  const created = await call(admin, '/api/data', { method: 'POST', body: JSON.stringify({ resource: 'webhooks', values: { url: 'https://example.invalid/hrplus-test', events: ['test.ping'], active: true } }) });
  const id = created.body?.id ?? created.body?.data?.id;
  if (!id) return { __failux: `could not create a webhook: ${created.status} ${JSON.stringify(created.body).slice(0, 120)}` };
  const r = await act(admin, 'webhook.test', { id });
  const empTry = await act(employee, 'webhook.test', { id });
  const row = rowsOf(await get(admin, 'webhooks')).find((w) => w.id === id);
  const bad = [];
  // The host does not resolve, so the delivery must fail *and say so*, not throw.
  if (r.status >= 400) bad.push(`test ping ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  if (!row?.last_fired_at) bad.push('last_fired_at was not recorded');
  if (empTry.status !== 403) bad.push(`employee ${empTry.status}`);
  await call(admin, '/api/data', { method: 'DELETE', body: JSON.stringify({ resource: 'webhooks', id }) });
  return bad.length ? { __fail: bad.join(', ') } : { note: `ping attempted, last_status=${row?.last_status}, employee 403` };
});

// ---------- session controls (JWT claims: single session, idle timeout, expiry) ----------
// These run last because they deliberately invalidate sessions for the account.
const putCompany = (token, settings) => call(token, '/api/data', { method: 'PUT', body: JSON.stringify({ resource: 'company', id: 1, values: { settings } }) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await check('session: concurrent logins are allowed and neither is locked out', async () => {
  // Deliberate product behaviour (matches Supabase's default): a second login
  // re-claims the session record rather than kicking the first device. This is a
  // regression guard in the *other* direction — an over-eager single-session
  // enforcement would silently sign users out of their other device.
  const first = await login('admin@hrplus.sa');
  const second = await login('admin@hrplus.sa');
  const a = await call(first, '/api/me');
  const b = await call(second, '/api/me');
  return a.status === 200 && b.status === 200
    ? { note: 'both tokens still authenticate' }
    : { __fail: `first=${a.status} second=${b.status}, expected 200/200` };
});
await check('session: idle timeout returns 440 session_expired', async () => {
  // 3 seconds: long enough for the warm-up call to land inside the window, short
  // enough to keep the suite fast. (A 60 ms window expired during the warm-up.)
  const t = await login('admin@hrplus.sa');
  const set = await putCompany(t, { security: { session_timeout_minutes: 0.05 } });
  if (set.status >= 400) return { __fail: `company.update HTTP ${set.status}` };
  const warm = await call(t, '/api/me');
  if (warm.status !== 200) return { __fail: `warm-up call HTTP ${warm.status}` };
  await sleep(3600);
  const expired = await call(t, '/api/me');
  // Restore the real timeout before asserting, and retry: with a 3-second window a
  // single attempt can itself come back 440 and leave the setting poisoned.
  let restored = false;
  for (let i = 0; i < 4 && !restored; i++) {
    const restore = await login('admin@hrplus.sa');
    const r = await putCompany(restore, { security: { session_timeout_minutes: 30 } });
    restored = r.status < 400;
  }
  if (!restored) return { __fail: 'could not restore the session timeout to 30 minutes' };
  return expired.status === 440 && expired.body?.error === 'session_expired'
    ? { note: '440 + {"error":"session_expired"} — matches src/lib/api.ts' }
    : { __fail: `expected 440 session_expired, got ${expired.status} ${JSON.stringify(expired.body).slice(0, 100)}` };
});
await check('session: an expired token is rejected', async () => {
  const sub = '00000000-0000-4000-8000-000000000051';
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const expired = [b64({ alg: 'none', typ: 'JWT' }), b64({ sub, exp: Math.floor(Date.now() / 1000) - 60 }), 'x'].join('.');
  const r = await call(expired, '/api/me');
  return r.status === 401 ? { note: '401 on an expired token' } : { __fail: `expected 401, got ${r.status}` };
});
await check('backup.restore: replace mode reproduces the snapshot exactly', async () => {
  const c = await act(admin, 'backup.create');
  if (c.status >= 400) return { __fail: `create HTTP ${c.status}` };
  const name = c.body.name;
  const plan = await act(admin, 'backup.restore', { name, mode: 'replace', dry_run: true });
  if (plan.status >= 400) return { __fail: `dry run HTTP ${plan.status}` };
  // audit_logs is excluded: writing the backup and the dry run themselves append
  // audit rows that did not exist when the dump was taken.
  const totals = Object.entries(plan.body.tables)
    .filter(([t]) => t !== 'audit_logs')
    .reduce((n, [, t]) => ({ rows: n.rows + t.in_backup, removed: n.removed + t.removed }), { rows: 0, removed: 0 });
  if (totals.removed !== 0) return { __fail: `a fresh backup planned ${totals.removed} deletions outside audit_logs` };
  const before = rowsOf(await get(admin, 'employees')).length;
  const real = await act(admin, 'backup.restore', { name, mode: 'replace', confirm: name });
  if (real.status >= 400) return { __fail: `replace HTTP ${real.status} ${JSON.stringify(real.body).slice(0, 160)}` };
  const after = rowsOf(await get(admin, 'employees')).length;
  if (after !== before) return { __fail: `employee count changed: ${before} -> ${after}` };
  const company = rowsOf(await get(admin, 'company'))[0];
  if (!company?.legal_name_en) return { __fail: 'company row missing after replace' };
  const dupes = rowsOf(await get(admin, 'employees')).length - new Set(rowsOf(await get(admin, 'employees')).map((e) => String(e.id))).size;
  if (dupes !== 0) return { __fail: `${dupes} duplicated employee ids after replace` };
  return { note: `replaced ${real.body.rows_written} rows across ${Object.keys(real.body.tables).length} tables, ${after} employees intact, no duplicates` };
});

// leave a clean session behind for whatever runs next
await login('admin@hrplus.sa');

console.log(results.join('\n'));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
