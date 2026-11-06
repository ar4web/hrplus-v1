// Business actions. Every handler enforces role + ownership server-side.
import crypto from 'node:crypto';
import { supabase, cors, authenticate, HttpError, need, sendError, audit, notify, notifyAdmins, notifyEmployee, notifyVendor, fireWebhooks, requireRole, fetchAll, sha256hex, getZatcaKeys, normPhone } from './_lib.js';
import { r2, r1, riyadhDate, riyadhTime, riyadhMinutes, addDays, workingDays, calendarDays, haversine, gosi, yearsOfService, toMin, overlapDays, DEFAULT_WORKDAYS, monthsBack, lastDayOf } from './_saudi.js';
import { signInvoice, computeLines, INITIAL_PIH } from './_zatca.js';

const H = {};
const PENDING_OK = ['prefs.save', 'profile.update', 'mfa.sync', 'notifications.list', 'notifications.read', 'ticket.create', 'ticket.reply', 'audit.event'];

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await authenticate(req);
    const b = req.body || {};
    const fn = H[b.action];
    if (!fn) throw new HttpError(400, 'Unknown action');
    if (ctx.profile.status === 'pending' && !PENDING_OK.includes(b.action)) throw new HttpError(403, 'Your account is awaiting approval by an administrator');
    const out = await fn(ctx, b);
    res.status(200).json(out ?? { ok: true });
  } catch (e) { sendError(res, e); }
}

const isAdmin = (ctx) => ctx.profile.role === 'admin';
async function ownEmployee(ctx) {
  need(ctx.profile.employee_id, 'No employee record is linked to your account');
  const { data } = await supabase.from('employees').select('*').eq('id', ctx.profile.employee_id).maybeSingle();
  need(data, 'Employee not found', 404);
  return data;
}
async function holidaySet() { const { data } = await supabase.from('holidays').select('date'); return new Set((data || []).map((h) => h.date)); }
const workDaysOf = (c) => (Array.isArray(c?.working_hours?.days) && c.working_hours.days.length ? c.working_hours.days : DEFAULT_WORKDAYS);
const isoOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/* ---------------- profile / prefs ---------------- */
H['prefs.save'] = async (ctx, b) => {
  const allowed = ['lang', 'theme', 'fontScale', 'highContrast', 'reduceMotion', 'largeTargets', 'density', 'announce', 'dashboard', 'shortcuts'];
  const patch = {}; for (const k of allowed) if (b.prefs && k in b.prefs) patch[k] = b.prefs[k];
  const prefs = { ...(ctx.profile.prefs || {}), ...patch };
  const { error } = await supabase.from('profiles').update({ prefs }).eq('id', ctx.profile.id);
  if (error) throw error;
  return { prefs };
};
H['profile.update'] = async (ctx, b) => {
  const v = {};
  if (b.display_name != null) { const n = String(b.display_name).trim(); need(n.length >= 2 && n.length <= 80, 'Name must be 2-80 characters'); v.display_name = n; }
  if (b.phone != null) {
    const p = normPhone(b.phone); need(!p || /^\+\d{9,15}$/.test(p), 'Invalid phone number');
    if (p) { const { data } = await supabase.from('profiles').select('id').eq('phone', p).neq('id', ctx.profile.id).limit(1); need(!data?.length, 'Phone number already in use'); }
    v.phone = p || null;
  }
  const { data, error } = await supabase.from('profiles').update(v).eq('id', ctx.profile.id).select('id,display_name,phone').single();
  if (error) throw error;
  await audit(ctx, 'profile.update', 'profiles', ctx.profile.id, { fields: Object.keys(v) });
  return data;
};
H['mfa.sync'] = async (ctx) => {
  const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: ctx.user.id });
  if (error) throw error;
  const enabled = (data?.factors || []).some((f) => f.status === 'verified');
  await supabase.from('profiles').update({ mfa_enabled: enabled }).eq('id', ctx.profile.id);
  if (enabled !== !!ctx.profile.mfa_enabled) await audit(ctx, enabled ? 'mfa.enabled' : 'mfa.disabled', 'profiles', ctx.profile.id);
  return { mfa_enabled: enabled };
};
H['audit.event'] = async (ctx, b) => {
  const ok = ['auth.logout', 'auth.idle_timeout', 'document.export', 'payroll.wps_export', 'invoice.download', 'payslip.download', 'settings.export'];
  need(ok.includes(b.event), 'Event not allowed');
  await audit(ctx, b.event, b.resource || null, b.record_id || null, typeof b.details === 'object' ? b.details : {});
  return { ok: true };
};

/* ---------------- notifications ---------------- */
H['notifications.list'] = async (ctx) => {
  const { data } = await supabase.from('notifications').select('*').eq('profile_id', ctx.profile.id).order('created_at', { ascending: false }).limit(40);
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('profile_id', ctx.profile.id).eq('read', false);
  return { items: data || [], unread: count || 0 };
};
H['notifications.read'] = async (ctx, b) => {
  let q = supabase.from('notifications').update({ read: true }).eq('profile_id', ctx.profile.id);
  if (b.id) q = q.eq('id', b.id);
  const { error } = await q; if (error) throw error;
  return { ok: true };
};

/* ---------------- attendance ---------------- */
async function punch(ctx, b, kind) {
  const emp = await ownEmployee(ctx);
  const c = ctx.company || {};
  const lat = Number(b.lat), lng = Number(b.lng), accuracy = Math.max(0, Number(b.accuracy) || 0);
  need(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180, 'Valid GPS coordinates are required');
  let at = new Date();
  if (b.offline && b.at) {
    const t = new Date(b.at);
    need(!isNaN(t) && t <= new Date(Date.now() + 60000) && Date.now() - t < 72 * 3600e3, 'Offline punch is too old (max 72h) or invalid');
    at = t;
  }
  const radius = Number(c.geofence_radius) || 200;
  const dist = Math.round(haversine(Number(c.geofence_lat), Number(c.geofence_lng), lat, lng));
  const inside = dist <= radius + Math.min(accuracy, 100);
  const remoteOk = c.settings?.attendance?.remote_exempt !== false && emp.location === 'Remote';
  if (!inside && !remoteOk) {
    await audit(ctx, `attendance.${kind}_rejected`, 'attendance', null, { distance: dist, radius, accuracy });
    return { ok: false, reason: 'outside', distance: dist, radius, accuracy };
  }
  const day = riyadhDate(at);
  const { data: existing } = await supabase.from('attendance').select('*').eq('employee_id', emp.id).eq('date', day).maybeSingle();
  if (kind === 'checkin') {
    if (existing?.check_in) return { ok: false, reason: 'already', record: existing, distance: dist, radius };
    const start = toMin(c.working_hours?.start || '08:00') + (Number(c.settings?.attendance?.grace_minutes) || 15);
    const status = riyadhMinutes(at) > start ? 'late' : 'present';
    const row = { employee_id: emp.id, date: day, check_in: at.toISOString(), status, lat, lng, distance_m: dist, remote: !inside, source: b.offline ? 'offline' : 'online' };
    const q = existing ? supabase.from('attendance').update(row).eq('id', existing.id) : supabase.from('attendance').insert(row);
    const { data, error } = await q.select().single(); if (error) throw error;
    await audit(ctx, 'attendance.checkin', 'attendance', data.id, { distance: dist, status, source: row.source });
    await fireWebhooks('attendance.checkin', { employee_id: emp.id, date: day, check_in: row.check_in, status, remote: row.remote });
    return { ok: true, record: data, distance: dist, radius, remote: !inside };
  }
  if (!existing?.check_in) return { ok: false, reason: 'no_checkin', distance: dist, radius };
  if (existing.check_out) return { ok: false, reason: 'already_out', record: existing, distance: dist, radius };
  need(at > new Date(existing.check_in), 'Check-out must be after check-in');
  const { data, error } = await supabase.from('attendance').update({ check_out: at.toISOString() }).eq('id', existing.id).select().single();
  if (error) throw error;
  await audit(ctx, 'attendance.checkout', 'attendance', data.id, { distance: dist, source: b.offline ? 'offline' : 'online' });
  await fireWebhooks('attendance.checkout', { employee_id: emp.id, date: day, check_out: data.check_out });
  return { ok: true, record: data, distance: dist, radius, remote: !inside };
}
H['attendance.checkin'] = (ctx, b) => punch(ctx, b, 'checkin');
H['attendance.checkout'] = (ctx, b) => punch(ctx, b, 'checkout');

/* ---------------- leave ---------------- */
async function balancesFor(empId, year) {
  const [{ data: emp }, { data: types }, { data: reqs }] = await Promise.all([
    supabase.from('employees').select('id,hire_date,gender').eq('id', empId).maybeSingle(),
    supabase.from('leave_types').select('*').order('id'),
    supabase.from('leave_requests').select('type_id,days,status,start_date').eq('employee_id', empId).gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`),
  ]);
  need(emp, 'Employee not found', 404);
  const yrs = yearsOfService(emp.hire_date, riyadhDate());
  return (types || []).filter((t) => t.active !== false && (!t.gender || t.gender === emp.gender)).map((t) => {
    const entitled = t.days_after_5y && yrs >= 5 ? t.days_after_5y : t.annual_days;
    const used = (reqs || []).filter((r) => r.type_id === t.id && r.status === 'approved').reduce((s, r) => s + Number(r.days || 0), 0);
    const pending = (reqs || []).filter((r) => r.type_id === t.id && r.status === 'pending').reduce((s, r) => s + Number(r.days || 0), 0);
    return { type: t, entitled: entitled || 0, used, pending, remaining: entitled ? Math.max(0, entitled - used) : null, years_of_service: r1(yrs) };
  });
}
H['leave.balances'] = async (ctx, b) => {
  const empId = isAdmin(ctx) && b.employee_id ? b.employee_id : ctx.profile.employee_id;
  need(empId, 'No employee record is linked to your account');
  return { balances: await balancesFor(empId, Number(b.year) || Number(riyadhDate().slice(0, 4))) };
};
H['leave.request'] = async (ctx, b) => {
  const emp = await ownEmployee(ctx);
  need(isoOk(b.start_date) && isoOk(b.end_date), 'Start and end dates are required');
  need(b.end_date >= b.start_date, 'End date must be on or after start date');
  const { data: type } = await supabase.from('leave_types').select('*').eq('id', b.type_id).maybeSingle();
  need(type && type.active !== false, 'Choose a valid leave type');
  need(!type.gender || type.gender === emp.gender, `${type.name_en} is not applicable`);
  const today = riyadhDate();
  if (type.notice_days && type.code !== 'SICK') need(calendarDays(today, b.start_date) - 1 >= type.notice_days, `${type.name_en} requires at least ${type.notice_days} days notice`);
  need(b.start_date >= addDays(today, -30), 'Start date is too far in the past');
  const hol = await holidaySet();
  const days = type.calendar_days ? calendarDays(b.start_date, b.end_date) : workingDays(b.start_date, b.end_date, hol, workDaysOf(ctx.company));
  need(days > 0, 'Selected range has no working days (weekends/holidays)');
  if (type.max_consecutive) need(days <= type.max_consecutive, `Maximum ${type.max_consecutive} days per request for ${type.name_en}`);
  if (type.requires_document) need(String(b.reason || '').trim().length >= 5, 'Please describe the supporting document / reason');
  const { data: overlaps } = await supabase.from('leave_requests').select('id').eq('employee_id', emp.id).in('status', ['pending', 'approved']).lte('start_date', b.end_date).gte('end_date', b.start_date);
  need(!overlaps?.length, 'You already have a leave request overlapping these dates');
  const bal = (await balancesFor(emp.id, Number(b.start_date.slice(0, 4)))).find((x) => x.type.id === type.id);
  if (bal && bal.entitled && type.paid !== false) need(bal.remaining - bal.pending >= days, `Insufficient balance: ${Math.max(0, bal.remaining - bal.pending)} day(s) available`);
  const { data, error } = await supabase.from('leave_requests').insert({ employee_id: emp.id, type_id: type.id, start_date: b.start_date, end_date: b.end_date, days, reason: String(b.reason || '').slice(0, 500), status: 'pending' }).select().single();
  if (error) throw error;
  await audit(ctx, 'leave.request', 'leave_requests', data.id, { type: type.code, days });
  await notifyAdmins({ title: [`Leave request: ${emp.full_name}`, `طلب إجازة: ${emp.full_name_ar || emp.full_name}`], body: [`${type.name_en} · ${days} day(s) from ${b.start_date}`, `${type.name_ar} · ${days} يوم من ${b.start_date}`], link: '/leave?tab=approvals', level: 'action' });
  await fireWebhooks('leave.requested', { id: data.id, employee_id: emp.id, type: type.code, start_date: b.start_date, end_date: b.end_date, days });
  return data;
};
H['leave.cancel'] = async (ctx, b) => {
  const { data: r } = await supabase.from('leave_requests').select('*').eq('id', b.id).maybeSingle();
  need(r, 'Request not found', 404);
  need(isAdmin(ctx) || r.employee_id === ctx.profile.employee_id, 'Forbidden', 403);
  need(r.status === 'pending' || (isAdmin(ctx) && r.status === 'approved'), 'Only pending requests can be cancelled');
  await supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', r.id);
  await audit(ctx, 'leave.cancel', 'leave_requests', r.id);
  return { ok: true };
};
H['leave.decide'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  need(['approved', 'rejected'].includes(b.decision), 'Invalid decision');
  const { data: r } = await supabase.from('leave_requests').select('*, leave_types(name_en,name_ar)').eq('id', b.id).maybeSingle();
  need(r && r.status === 'pending', 'Request is not pending');
  if (b.decision === 'rejected') need(String(b.note || '').trim().length >= 3, 'Please give a reason for rejection');
  const { data, error } = await supabase.from('leave_requests').update({ status: b.decision, decision_note: String(b.note || '').slice(0, 300), decided_by: ctx.profile.display_name, decided_at: new Date().toISOString() }).eq('id', r.id).select().single();
  if (error) throw error;
  await audit(ctx, `leave.${b.decision}`, 'leave_requests', r.id, { employee_id: r.employee_id });
  const ok = b.decision === 'approved';
  await notifyEmployee(r.employee_id, { title: [`Leave ${ok ? 'approved' : 'rejected'}`, ok ? 'تمت الموافقة على الإجازة' : 'تم رفض الإجازة'], body: [`${r.leave_types?.name_en} ${r.start_date} → ${r.end_date}${b.note ? ' · ' + b.note : ''}`, `${r.leave_types?.name_ar} ${r.start_date} ← ${r.end_date}`], link: '/leave', level: ok ? 'success' : 'warning' });
  await fireWebhooks('leave.decided', { id: r.id, employee_id: r.employee_id, decision: b.decision });
  return data;
};

/* ---------------- expenses ---------------- */
const DEFAULT_CHAIN = [{ max: 1000, steps: ['Line Manager'] }, { max: 5000, steps: ['Line Manager', 'Finance'] }, { max: null, steps: ['Line Manager', 'Finance', 'CEO'] }];
function chainFor(amount, cfg) {
  const tiers = Array.isArray(cfg) && cfg.length ? cfg : DEFAULT_CHAIN;
  const t = tiers.find((x) => x.max == null || x.max === '' || amount <= Number(x.max)) || tiers[tiers.length - 1];
  return [...t.steps];
}
H['expense.submit'] = async (ctx, b) => {
  const emp = await ownEmployee(ctx);
  const amount = r2(b.amount);
  need(amount > 0 && amount <= 1000000, 'Enter a valid amount');
  need(isoOk(b.expense_date) && b.expense_date <= riyadhDate(), 'Expense date cannot be in the future');
  need(String(b.description || '').trim().length >= 3, 'Description is required');
  const { data: cat } = await supabase.from('expense_categories').select('*').eq('id', b.category_id).maybeSingle();
  need(cat && cat.active !== false, 'Choose a valid category');
  const receiptAbove = Number(ctx.company?.settings?.expense?.receipt_required_above ?? 100);
  if (b.receipt_path) need(String(b.receipt_path).startsWith(`${ctx.profile.id}/`), 'Invalid receipt reference', 403);
  need(b.receipt_path || amount <= receiptAbove, `A receipt is required for claims above SAR ${receiptAbove}`);
  const steps = chainFor(amount, ctx.company?.settings?.expense_chain);
  const over = cat.cap_per_claim && amount > Number(cat.cap_per_claim);
  if (over && !steps.includes('CEO')) steps.push('CEO');
  const chain = steps.map((s) => ({ step: s, status: 'pending', by: null, at: null, note: null }));
  const { data, error } = await supabase.from('expenses').insert({ employee_id: emp.id, category_id: cat.id, amount, vat_amount: r2(b.vat_amount || 0), expense_date: b.expense_date, description: String(b.description).slice(0, 300), receipt_path: b.receipt_path || null, status: 'pending', approval_chain: chain, current_step: 0, over_cap: !!over }).select().single();
  if (error) throw error;
  await audit(ctx, 'expense.submit', 'expenses', data.id, { amount, steps: steps.length });
  await notifyAdmins({ title: [`Expense claim: SAR ${amount.toLocaleString()}`, `مطالبة مصروفات: ${amount.toLocaleString()} ر.س`], body: [`${emp.full_name} · ${cat.name_en}${over ? ' · exceeds cap' : ''}`, `${emp.full_name_ar || emp.full_name} · ${cat.name_ar}`], link: '/expenses?tab=queue', level: 'action' });
  await fireWebhooks('expense.submitted', { id: data.id, employee_id: emp.id, amount, category: cat.code });
  return data;
};
H['expense.decide'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  const { data: x } = await supabase.from('expenses').select('*').eq('id', b.id).maybeSingle();
  need(x && x.status === 'pending', 'Claim is not pending');
  need(['approve', 'reject'].includes(b.decision), 'Invalid decision');
  if (b.decision === 'reject') need(String(b.note || '').trim().length >= 3, 'Please give a reason');
  const chain = [...(x.approval_chain || [])];
  const i = x.current_step || 0;
  chain[i] = { ...chain[i], status: b.decision === 'approve' ? 'approved' : 'rejected', by: ctx.profile.display_name, at: new Date().toISOString(), note: b.note || null };
  let status = 'pending', step = i;
  if (b.decision === 'reject') status = 'rejected';
  else if (i + 1 >= chain.length) status = 'approved'; else step = i + 1;
  const { data, error } = await supabase.from('expenses').update({ approval_chain: chain, current_step: step, status }).eq('id', x.id).select().single();
  if (error) throw error;
  await audit(ctx, `expense.${b.decision}`, 'expenses', x.id, { step: chain[i].step, status });
  if (status !== 'pending') {
    await notifyEmployee(x.employee_id, { title: [`Expense ${status}`, status === 'approved' ? 'تمت الموافقة على المصروف' : 'تم رفض المصروف'], body: [`SAR ${Number(x.amount).toLocaleString()} · ${x.description}`, `${Number(x.amount).toLocaleString()} ر.س · ${x.description}`], link: '/expenses', level: status === 'approved' ? 'success' : 'warning' });
    await fireWebhooks('expense.decided', { id: x.id, status });
  }
  return data;
};

/* ---------------- payroll ---------------- */
H['payroll.run'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  const period = /^\d{4}-\d{2}$/.test(b.period || '') ? b.period : riyadhDate().slice(0, 7);
  const pStart = `${period}-01`, pEnd = lastDayOf(period);
  let { data: run } = await supabase.from('payroll_runs').select('*').eq('period', period).maybeSingle();
  need(!run || run.status === 'draft', `Payroll for ${period} is ${run?.status} and locked`, 409);
  const [emps, ts, leaves] = await Promise.all([
    fetchAll(() => supabase.from('employees').select('*').lte('hire_date', pEnd).neq('status', 'Terminated').order('id')),
    fetchAll(() => supabase.from('timesheets').select('employee_id,overtime_hours,status,date').gte('date', pStart).lte('date', pEnd).order('id')),
    fetchAll(() => supabase.from('leave_requests').select('employee_id,start_date,end_date,status, leave_types(paid)').eq('status', 'approved').lte('start_date', pEnd).gte('end_date', pStart).order('id')),
  ]);
  const cfg = ctx.company?.settings?.gosi;
  const rows = emps.map((e) => {
    const basic = r2(e.basic_salary), housing = r2(e.housing_allowance), transport = r2(e.transport_allowance), other = r2(e.other_allowance);
    const fixed = basic + housing + transport + other;
    const otHours = ts.filter((t) => t.employee_id === e.id && t.status === 'Approved').reduce((s, t) => s + Number(t.overtime_hours || 0), 0);
    const overtime = r2(otHours * (fixed / 176) * 1.5);
    const unpaid = leaves.filter((l) => l.employee_id === e.id && l.leave_types && l.leave_types.paid === false).reduce((s, l) => s + overlapDays(l.start_date, l.end_date, pStart, pEnd), 0);
    const deductions = r2((fixed / 30) * unpaid);
    const g = gosi(e, cfg);
    const gross = r2(fixed + overtime);
    return { employee_id: e.id, period, basic, housing, transport, other_allowance: other, overtime, bonus: 0, gross, gosi_base: g.base, gosi_employee: g.employee, gosi_employer: g.employer, deductions, net: r2(gross - g.employee - deductions), payment_method: 'WPS Bank Transfer', status: 'draft' };
  });
  const totals = { employees: rows.length, gross: r2(rows.reduce((s, r) => s + r.gross, 0)), net: r2(rows.reduce((s, r) => s + r.net, 0)), gosi_employee: r2(rows.reduce((s, r) => s + r.gosi_employee, 0)), gosi_employer: r2(rows.reduce((s, r) => s + r.gosi_employer, 0)), overtime: r2(rows.reduce((s, r) => s + r.overtime, 0)), deductions: r2(rows.reduce((s, r) => s + r.deductions, 0)) };
  if (!run) { const { data, error } = await supabase.from('payroll_runs').insert({ period, status: 'draft', totals }).select().single(); if (error) throw error; run = data; }
  else { await supabase.from('payslips').delete().eq('run_id', run.id); const { data } = await supabase.from('payroll_runs').update({ totals }).eq('id', run.id).select().single(); run = data; }
  for (let i = 0; i < rows.length; i += 500) { const { error } = await supabase.from('payslips').insert(rows.slice(i, i + 500).map((r) => ({ ...r, run_id: run.id }))); if (error) throw error; }
  await audit(ctx, 'payroll.run', 'payroll_runs', run.id, { period, ...totals });
  await fireWebhooks('payroll.generated', { period, ...totals });
  return { run };
};
H['payroll.finalize'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  need(['approved', 'paid', 'draft'].includes(b.status), 'Invalid status');
  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', b.run_id).maybeSingle();
  need(run, 'Run not found', 404);
  need(run.status !== 'paid', 'Paid runs are locked', 409);
  const { data, error } = await supabase.from('payroll_runs').update({ status: b.status, finalized_at: b.status === 'paid' ? new Date().toISOString() : null }).eq('id', run.id).select().single();
  if (error) throw error;
  await supabase.from('payslips').update({ status: b.status }).eq('run_id', run.id);
  await audit(ctx, `payroll.${b.status}`, 'payroll_runs', run.id, { period: run.period });
  if (b.status === 'paid') {
    const { data: profs } = await supabase.from('profiles').select('id').not('employee_id', 'is', null);
    await notify((profs || []).map((p) => p.id), { title: [`Payslip ready · ${run.period}`, `قسيمة الراتب جاهزة · ${run.period}`], body: ['Your salary has been transferred via WPS.', 'تم تحويل راتبك عبر نظام حماية الأجور.'], link: '/payroll', level: 'success' });
    await fireWebhooks('payroll.paid', { period: run.period, totals: run.totals });
  }
  return data;
};

/* ---------------- timesheets ---------------- */
H['timesheet.decide'] = async (ctx, b) => {
  requireRole(ctx, 'admin', 'vendor');
  need(['Approved', 'Rejected'].includes(b.decision), 'Invalid decision');
  const { data: t } = await supabase.from('timesheets').select('*').eq('id', b.id).maybeSingle();
  need(t, 'Timesheet not found', 404);
  if (ctx.profile.role === 'vendor') need(t.vendor_id === ctx.profile.vendor_id, 'Forbidden', 403);
  need(t.status !== 'Approved', 'Already approved');
  const { data, error } = await supabase.from('timesheets').update({ status: b.decision, decided_at: new Date().toISOString() }).eq('id', t.id).select().single();
  if (error) throw error;
  await audit(ctx, `timesheet.${b.decision.toLowerCase()}`, 'timesheets', t.id, { vendor_id: t.vendor_id });
  await notifyEmployee(t.employee_id, { title: [`Timesheet ${b.decision.toLowerCase()}`, b.decision === 'Approved' ? 'تم اعتماد سجل الساعات' : 'تم رفض سجل الساعات'], body: [`${t.project} · ${t.date}`, `${t.project} · ${t.date}`], link: '/timesheets', level: b.decision === 'Approved' ? 'success' : 'warning' });
  if (ctx.profile.role === 'vendor') await notifyAdmins({ title: [`Client ${b.decision.toLowerCase()} timesheet ${t.id}`, `العميل ${b.decision === 'Approved' ? 'اعتمد' : 'رفض'} السجل ${t.id}`], body: [t.project, t.project], link: '/timesheets', level: 'info' });
  return data;
};

/* ---------------- invoices (ZATCA) ---------------- */
H['invoice.lines_from_timesheets'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  need(/^\d{4}-\d{2}$/.test(b.period || ''), 'Choose a month');
  const { data: v } = await supabase.from('vendors').select('*').eq('id', b.vendor_id).maybeSingle();
  need(v, 'Vendor not found', 404);
  const { data: ts } = await supabase.from('timesheets').select('*').eq('vendor_id', v.id).eq('status', 'Approved').gte('date', `${b.period}-01`).lte('date', lastDayOf(b.period));
  const byProject = new Map();
  for (const t of ts || []) { const k = t.project; const o = byProject.get(k) || { hours: 0, rate: Number(t.bill_rate) || Number(v.billable_rate) || 0 }; o.hours += Number(t.regular_hours || 0) + Number(t.overtime_hours || 0); byProject.set(k, o); }
  return { lines: [...byProject.entries()].map(([p, o]) => ({ description: `Consulting services – ${p} (${b.period})`, qty: o.hours, unit_price: o.rate })), count: (ts || []).length };
};
function sendLinks(inv, company, buyer) {
  const text = `${company.legal_name_en}\nTax invoice ${inv.number}\nTotal: SAR ${Number(inv.total).toLocaleString('en-US', { minimumFractionDigits: 2 })} (incl. 15% VAT)\nDue: ${inv.due_date}`;
  const email = buyer?.email ? `mailto:${encodeURIComponent(buyer.email)}?subject=${encodeURIComponent(`Tax Invoice ${inv.number} – ${company.legal_name_en}`)}&body=${encodeURIComponent(text)}` : null;
  const digits = String(buyer?.phone || '').replace(/\D/g, '');
  const whatsapp = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  return { email, whatsapp };
}
H['invoice.create'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  const company = ctx.company;
  need(company?.vat_number && /^3\d{13}3$/.test(company.vat_number), 'Set a valid 15-digit VAT number (starts and ends with 3) in Company Setup first');
  const type = b.type === 'B2C' ? 'B2C' : 'B2B';
  const { lines, subtotal, vat, total } = computeLines(b.lines);
  need(lines.length, 'Add at least one line item');
  let buyer, vendor_id = null;
  if (type === 'B2B') {
    const { data: v } = await supabase.from('vendors').select('*').eq('id', b.vendor_id).maybeSingle();
    need(v, 'Choose a customer');
    need(v.vat_number, 'B2B (standard) invoices require the buyer VAT number');
    vendor_id = v.id;
    buyer = { name: v.name, name_ar: v.name_ar, vat_number: v.vat_number, cr_number: v.cr_number, address: v.address, city: v.city, email: v.email, phone: v.phone };
  } else {
    buyer = { name: String(b.buyer?.name || 'Cash customer').slice(0, 120), phone: String(b.buyer?.phone || '').slice(0, 20), email: String(b.buyer?.email || '').slice(0, 120) };
  }
  const { data: last } = await supabase.from('invoices').select('icv,hash').order('icv', { ascending: false }).limit(1);
  const icv = (last?.[0]?.icv || 0) + 1;
  const prev_hash = last?.[0]?.hash || INITIAL_PIH;
  const now = new Date();
  const issue_date = riyadhDate(now), issue_time = riyadhTime(now);
  const terms = Number(company.settings?.invoicing?.payment_terms_days) || 30;
  const prefix = company.settings?.invoicing?.prefix || 'INV';
  const inv = { number: `${prefix}-${issue_date.slice(0, 4)}-${String(icv).padStart(5, '0')}`, uuid: crypto.randomUUID(), icv, prev_hash, issue_date, issue_time, type, buyer, lines, subtotal, vat, total };
  const signed = signInvoice({ company, inv, keys: await getZatcaKeys() });
  const design = ['classic', 'band', 'minimal'].includes(b.design) ? b.design : (company.settings?.invoicing?.default_design || 'classic');
  const due_date = isoOk(b.due_date) ? b.due_date : addDays(issue_date, terms);
  const channels = [];
  if (b.send?.email && buyer.email) channels.push({ channel: 'email', to: buyer.email, at: now.toISOString(), status: 'prepared' });
  if (b.send?.whatsapp && buyer.phone) channels.push({ channel: 'whatsapp', to: buyer.phone, at: now.toISOString(), status: 'prepared' });
  const { data, error } = await supabase.from('invoices').insert({ ...inv, vendor_id, due_date, design, status: channels.length ? 'sent' : 'issued', notes: String(b.notes || '').slice(0, 500), sent_via: channels, hash: signed.hash, signature: signed.signature, qr: signed.qr, xml: signed.xml }).select().single();
  if (error) throw error;
  await audit(ctx, 'invoice.create', 'invoices', data.id, { number: inv.number, type, total, vendor_id });
  if (vendor_id) await notifyVendor(vendor_id, { title: [`New tax invoice ${inv.number}`, `فاتورة ضريبية جديدة ${inv.number}`], body: [`SAR ${total.toLocaleString()} due ${due_date}`, `${total.toLocaleString()} ر.س تستحق ${due_date}`], link: '/invoices', level: 'info' });
  await fireWebhooks('invoice.created', { id: data.id, number: inv.number, type, total, vat, vendor_id, uuid: inv.uuid });
  return { invoice: data, links: sendLinks(data, company, buyer) };
};
H['invoice.send'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  need(['email', 'whatsapp'].includes(b.channel), 'Invalid channel');
  const { data: inv } = await supabase.from('invoices').select('*').eq('id', b.id).maybeSingle();
  need(inv, 'Invoice not found', 404);
  const links = sendLinks(inv, ctx.company, inv.buyer || {});
  const sent = [...(inv.sent_via || []), { channel: b.channel, to: b.channel === 'email' ? inv.buyer?.email : inv.buyer?.phone, at: new Date().toISOString(), status: 'opened' }];
  await supabase.from('invoices').update({ sent_via: sent, status: inv.status === 'issued' ? 'sent' : inv.status }).eq('id', inv.id);
  await audit(ctx, 'invoice.send', 'invoices', inv.id, { channel: b.channel });
  await fireWebhooks('invoice.sent', { id: inv.id, number: inv.number, channel: b.channel });
  return { link: links[b.channel] };
};
H['invoice.status'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  need(['paid', 'void', 'sent', 'issued'].includes(b.status), 'Invalid status');
  const { data, error } = await supabase.from('invoices').update({ status: b.status }).eq('id', b.id).select().single();
  if (error) throw error;
  await audit(ctx, `invoice.${b.status}`, 'invoices', b.id);
  if (b.status === 'paid' && data.vendor_id) await notifyVendor(data.vendor_id, { title: [`Payment received · ${data.number}`, `تم استلام الدفعة · ${data.number}`], body: ['Thank you for your payment.', 'شكراً لسدادكم.'], link: '/invoices', level: 'success' });
  return data;
};

/* ---------------- assets ---------------- */
const ASSET_STATES = ['Procured', 'In Stock', 'Assigned', 'In Repair', 'Retired', 'Disposed'];
H['asset.transition'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  need(ASSET_STATES.includes(b.status), 'Invalid lifecycle stage');
  const { data: a } = await supabase.from('assets').select('*').eq('id', b.id).maybeSingle();
  need(a, 'Asset not found', 404);
  need(a.status !== 'Disposed', 'Disposed assets cannot change state');
  if (b.status === 'Assigned') need(b.assigned_to, 'Choose an employee to assign to');
  const assigned_to = b.status === 'Assigned' ? b.assigned_to : (b.status === 'In Repair' ? a.assigned_to : null);
  const history = [...(a.history || []), { at: new Date().toISOString(), from: a.status, to: b.status, by: ctx.profile.display_name, note: String(b.note || '').slice(0, 200), assigned_to }];
  const { data, error } = await supabase.from('assets').update({ status: b.status, assigned_to, history }).eq('id', a.id).select('*, employees(full_name,department)').single();
  if (error) throw error;
  await audit(ctx, 'asset.transition', 'assets', a.id, { from: a.status, to: b.status, assigned_to });
  if (b.status === 'Assigned') await notifyEmployee(assigned_to, { title: [`Asset assigned: ${a.name}`, `تم تسليمك أصلاً: ${a.name}`], body: [`Tag ${a.tag}`, `الرمز ${a.tag}`], link: '/assets', level: 'info' });
  return data;
};

/* ---------------- documents ---------------- */
const SELF_SERVICE_DOCS = ['salary_certificate', 'employment_certificate', 'bank_letter', 'noc', 'exit_reentry_request', 'iqama_renewal_request'];
H['document.log'] = async (ctx, b) => {
  requireRole(ctx, 'admin', 'employee');
  need(/^[a-z_]+$/.test(b.template_key || ''), 'Invalid template');
  let empId = b.employee_id || null;
  if (!isAdmin(ctx)) { need(SELF_SERVICE_DOCS.includes(b.template_key), 'This document must be issued by HR', 403); empId = ctx.profile.employee_id; need(empId, 'No employee record linked'); }
  const { data, error } = await supabase.from('documents').insert({ template_key: b.template_key, employee_id: empId, title: String(b.title || '').slice(0, 200), lang: ['both', 'en', 'ar'].includes(b.lang) ? b.lang : 'both', fields: b.fields || {}, format: String(b.format || 'print').slice(0, 10), created_by: ctx.profile.display_name }).select().single();
  if (error) throw error;
  await audit(ctx, 'document.export', 'documents', data.id, { template: b.template_key, format: b.format, employee_id: empId });
  return data;
};

/* ---------------- rules & acknowledgements ---------------- */
H['rule.save'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  const v = { title_en: String(b.title_en || '').trim(), title_ar: String(b.title_ar || '').trim(), body_en: String(b.body_en || '').trim(), body_ar: String(b.body_ar || '').trim(), category: String(b.category || 'General'), active: b.active !== false };
  need(v.title_en && v.body_en, 'English title and body are required');
  need(v.title_ar && v.body_ar, 'Arabic title and body are required (bilingual policy)');
  let data, bumped = false;
  if (b.id) {
    const { data: cur } = await supabase.from('rules').select('*').eq('id', b.id).maybeSingle();
    need(cur, 'Rule not found', 404);
    bumped = cur.body_en !== v.body_en || cur.body_ar !== v.body_ar || cur.title_en !== v.title_en || cur.title_ar !== v.title_ar;
    const patch = { ...v, ...(bumped ? { version: (cur.version || 1) + 1, published_at: new Date().toISOString(), history: [...(cur.history || []), { version: cur.version, title_en: cur.title_en, body_en: cur.body_en, title_ar: cur.title_ar, body_ar: cur.body_ar, published_at: cur.published_at }] } : {}) };
    ({ data } = await supabase.from('rules').update(patch).eq('id', b.id).select().single());
  } else {
    bumped = true;
    ({ data } = await supabase.from('rules').insert({ ...v, version: 1, published_at: new Date().toISOString(), history: [] }).select().single());
  }
  await audit(ctx, bumped ? 'rule.publish' : 'rule.update', 'rules', data.id, { version: data.version });
  if (bumped && data.active) {
    const { data: profs } = await supabase.from('profiles').select('id').eq('role', 'employee').not('employee_id', 'is', null);
    await notify((profs || []).map((p) => p.id), { title: [`Policy update: ${data.title_en} v${data.version}`, `تحديث سياسة: ${data.title_ar} الإصدار ${data.version}`], body: ['Please read and acknowledge.', 'يرجى القراءة والإقرار.'], link: '/policies?tab=rules', level: 'action' });
    await fireWebhooks('rule.published', { id: data.id, version: data.version, title: data.title_en });
  }
  return data;
};
H['rule.ack'] = async (ctx, b) => {
  const emp = await ownEmployee(ctx);
  const { data: rule } = await supabase.from('rules').select('*').eq('id', b.rule_id).maybeSingle();
  need(rule && rule.active, 'Rule not found', 404);
  const { data: ex } = await supabase.from('rule_acks').select('id').eq('rule_id', rule.id).eq('employee_id', emp.id).eq('version', rule.version).limit(1);
  if (ex?.length) return { ok: true, already: true };
  const { data, error } = await supabase.from('rule_acks').insert({ rule_id: rule.id, employee_id: emp.id, version: rule.version, acked_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  await audit(ctx, 'rule.acknowledge', 'rules', rule.id, { version: rule.version });
  return data;
};

/* ---------------- support tickets ---------------- */
H['ticket.create'] = async (ctx, b) => {
  const subject = String(b.subject || '').trim(), message = String(b.message || '').trim();
  need(subject.length >= 4, 'Subject is too short'); need(message.length >= 10, 'Please describe the issue (min 10 characters)');
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('tickets').insert({ profile_id: ctx.profile.id, requester: ctx.profile.display_name, subject: subject.slice(0, 140), category: String(b.category || 'General').slice(0, 40), priority: ['low', 'normal', 'high', 'urgent'].includes(b.priority) ? b.priority : 'normal', status: 'open', context: String(b.context || '').slice(0, 60), messages: [{ by: ctx.profile.display_name, role: ctx.profile.role, body: message.slice(0, 4000), at: now }], updated_at: now }).select().single();
  if (error) throw error;
  await audit(ctx, 'ticket.create', 'tickets', data.id);
  await notifyAdmins({ title: [`Support ticket #${data.id}: ${subject}`, `تذكرة دعم #${data.id}: ${subject}`], body: [`${ctx.profile.display_name} · ${data.priority}`, `${ctx.profile.display_name} · ${data.priority}`], link: '/support?tab=tickets', level: data.priority === 'urgent' ? 'warning' : 'info' }, ctx.profile.id);
  await fireWebhooks('ticket.created', { id: data.id, subject: data.subject, priority: data.priority });
  return data;
};
H['ticket.reply'] = async (ctx, b) => {
  const { data: t } = await supabase.from('tickets').select('*').eq('id', b.id).maybeSingle();
  need(t, 'Ticket not found', 404);
  need(isAdmin(ctx) || t.profile_id === ctx.profile.id, 'Forbidden', 403);
  const body = String(b.body || '').trim(); need(body.length >= 1, 'Message is empty');
  const now = new Date().toISOString();
  const status = isAdmin(ctx) ? (t.status === 'open' ? 'in_progress' : t.status) : (t.status === 'resolved' ? 'open' : t.status);
  const { data, error } = await supabase.from('tickets').update({ messages: [...(t.messages || []), { by: ctx.profile.display_name, role: ctx.profile.role, body: body.slice(0, 4000), at: now }], updated_at: now, status }).eq('id', t.id).select().single();
  if (error) throw error;
  if (isAdmin(ctx) && t.profile_id !== ctx.profile.id) await notify([t.profile_id], { title: [`Reply on ticket #${t.id}`, `رد على التذكرة #${t.id}`], body: [body.slice(0, 120), body.slice(0, 120)], link: '/support?tab=tickets', level: 'info' });
  else await notifyAdmins({ title: [`New reply on ticket #${t.id}`, `رد جديد على التذكرة #${t.id}`], body: [body.slice(0, 120), body.slice(0, 120)], link: '/support?tab=tickets' }, ctx.profile.id);
  return data;
};
H['ticket.status'] = async (ctx, b) => {
  const { data: t } = await supabase.from('tickets').select('*').eq('id', b.id).maybeSingle();
  need(t, 'Ticket not found', 404);
  need(isAdmin(ctx) || (t.profile_id === ctx.profile.id && b.status === 'resolved'), 'Forbidden', 403);
  need(['open', 'in_progress', 'resolved', 'closed'].includes(b.status), 'Invalid status');
  const { data } = await supabase.from('tickets').update({ status: b.status, updated_at: new Date().toISOString() }).eq('id', t.id).select().single();
  await audit(ctx, 'ticket.status', 'tickets', t.id, { status: b.status });
  if (t.profile_id !== ctx.profile.id) await notify([t.profile_id], { title: [`Ticket #${t.id} ${b.status.replace('_', ' ')}`, `التذكرة #${t.id}: ${b.status}`], body: [t.subject, t.subject], link: '/support?tab=tickets' });
  return data;
};

/* ---------------- chat ---------------- */
async function allowedContacts(ctx, ids) {
  let q = supabase.from('profiles').select('id,display_name,role,employee_id,vendor_id,last_seen,status, employees(department,job_title)').neq('id', ctx.profile.id).neq('status', 'disabled');
  if (ctx.profile.role === 'vendor') q = q.or(`role.eq.admin,vendor_id.eq.${Number(ctx.profile.vendor_id) || 0}`);
  else if (ctx.profile.role === 'employee') q = q.in('role', ['admin', 'employee']);
  if (ids) q = q.in('id', ids);
  const { data, error } = await q.order('display_name');
  if (error) throw error;
  return (data || []).filter((p) => p.status !== 'pending');
}
H['chat.contacts'] = async (ctx) => ({ contacts: (await allowedContacts(ctx)).map((p) => ({ id: p.id, name: p.display_name, role: p.role, department: p.employees?.department || null, title: p.employees?.job_title || null, online: p.last_seen && Date.now() - Date.parse(p.last_seen) < 5 * 60000, claimed: true })) });
async function myConversation(ctx, id) {
  const { data: c } = await supabase.from('conversations').select('*').eq('id', id).maybeSingle();
  need(c && (c.members || []).includes(ctx.profile.id), 'Conversation not found', 404);
  return c;
}
H['chat.list'] = async (ctx) => {
  const { data, error } = await supabase.from('conversations').select('*').contains('members', JSON.stringify([ctx.profile.id])).order('updated_at', { ascending: false });
  if (error) throw error;
  const ids = [...new Set((data || []).flatMap((c) => c.members || []))];
  const { data: profs } = ids.length ? await supabase.from('profiles').select('id,display_name,role,last_seen').in('id', ids) : { data: [] };
  const pm = new Map((profs || []).map((p) => [p.id, p]));
  return {
    conversations: (data || []).map((c) => {
      const others = (c.members || []).filter((m) => m !== ctx.profile.id).map((m) => pm.get(m)).filter(Boolean);
      const read = c.reads?.[ctx.profile.id];
      return { id: c.id, is_group: c.is_group, name: c.is_group ? c.name : (others[0]?.display_name || 'Conversation'), member_count: (c.members || []).length, others: others.slice(0, 6).map((o) => ({ id: o.id, name: o.display_name, role: o.role, online: o.last_seen && Date.now() - Date.parse(o.last_seen) < 5 * 60000 })), last_message: c.last_message, last_sender_id: c.last_sender_id, updated_at: c.updated_at, unread: !!(c.last_sender_id && c.last_sender_id !== ctx.profile.id && (!read || read < c.updated_at)) };
    }),
  };
};
H['chat.messages'] = async (ctx, b) => {
  const c = await myConversation(ctx, b.conversation_id);
  const { data } = await supabase.from('messages').select('id,conversation_id,sender_id,sender_name,body,created_at').eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(200);
  await supabase.from('conversations').update({ reads: { ...(c.reads || {}), [ctx.profile.id]: new Date().toISOString() } }).eq('id', c.id);
  return { messages: (data || []).reverse(), members: c.members };
};
H['chat.send'] = async (ctx, b) => {
  const c = await myConversation(ctx, b.conversation_id);
  const body = String(b.body || '').trim(); need(body.length >= 1 && body.length <= 4000, 'Message must be 1-4000 characters');
  const { data, error } = await supabase.from('messages').insert({ conversation_id: c.id, sender_id: ctx.profile.id, sender_name: ctx.profile.display_name, body }).select().single();
  if (error) throw error;
  await supabase.from('conversations').update({ last_message: body.slice(0, 140), last_sender_id: ctx.profile.id, updated_at: data.created_at, reads: { ...(c.reads || {}), [ctx.profile.id]: data.created_at } }).eq('id', c.id);
  return data;
};
H['chat.create'] = async (ctx, b) => {
  const ids = [...new Set((b.member_ids || []).map(Number).filter(Boolean))].filter((i) => i !== ctx.profile.id);
  need(ids.length >= 1, 'Choose at least one person');
  const allowed = await allowedContacts(ctx, ids);
  need(allowed.length === ids.length, 'You cannot message one or more of the selected people', 403);
  if (!b.is_group) {
    need(ids.length === 1, 'Direct messages have exactly one recipient');
    const { data: ex } = await supabase.from('conversations').select('*').eq('is_group', false).contains('members', JSON.stringify([ctx.profile.id, ids[0]]));
    const found = (ex || []).find((c) => (c.members || []).length === 2);
    if (found) return { conversation: found };
  } else need(String(b.name || '').trim().length >= 2, 'Group name is required');
  if (b.is_group) need(ctx.profile.role !== 'vendor', 'Vendors cannot create groups', 403);
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('conversations').insert({ name: b.is_group ? String(b.name).trim().slice(0, 60) : null, is_group: !!b.is_group, members: [ctx.profile.id, ...ids], created_by: ctx.profile.id, reads: {}, updated_at: now }).select().single();
  if (error) throw error;
  await audit(ctx, 'chat.create', 'conversations', data.id, { group: !!b.is_group, members: ids.length + 1 });
  return { conversation: data };
};

/* ---------------- admin: backups, keys, webhooks, users ---------------- */
const BACKUP_TABLES = ['company', 'vendors', 'employees', 'profiles', 'timesheets', 'attendance', 'leave_types', 'leave_requests', 'holidays', 'payroll_runs', 'payslips', 'invoices', 'expense_categories', 'expenses', 'assets', 'documents', 'rules', 'rule_acks', 'tickets', 'faqs', 'conversations', 'messages', 'webhooks', 'app_links', 'audit_logs'];
H['backup.create'] = async (ctx) => {
  requireRole(ctx, 'admin');
  const dump = { app: 'HRplus', version: 1, created_at: new Date().toISOString(), created_by: ctx.profile.email, tables: {} };
  for (const t of BACKUP_TABLES) dump.tables[t] = await fetchAll(() => supabase.from(t).select('*').order('id'));
  for (const p of dump.tables.profiles) delete p.session_id;
  const name = `hrplus-backup-${dump.created_at.replace(/[:.]/g, '-')}.json`;
  const buf = Buffer.from(JSON.stringify(dump));
  const { error } = await supabase.storage.from('backups').upload(name, buf, { contentType: 'application/json' });
  if (error) throw error;
  await audit(ctx, 'backup.create', 'backups', name, { bytes: buf.length });
  const counts = Object.fromEntries(Object.entries(dump.tables).map(([k, v]) => [k, v.length]));
  return { name, bytes: buf.length, counts };
};
H['backup.list'] = async (ctx) => {
  requireRole(ctx, 'admin');
  const { data, error } = await supabase.storage.from('backups').list('', { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return { files: (data || []).filter((f) => f.name.endsWith('.json')).map((f) => ({ name: f.name, size: f.metadata?.size, created_at: f.created_at })) };
};
H['backup.download'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  need(/^hrplus-backup-[\w-]+\.json$/.test(b.name || ''), 'Invalid backup name');
  const { data, error } = await supabase.storage.from('backups').createSignedUrl(b.name, 120, { download: true });
  if (error) throw error;
  await audit(ctx, 'backup.download', 'backups', b.name);
  return { url: data.signedUrl };
};
H['apikey.create'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  const name = String(b.name || '').trim(); need(name.length >= 2, 'Name is required');
  const scopes = b.write ? ['read', 'write'] : ['read'];
  const raw = 'hrp_' + crypto.randomBytes(24).toString('hex');
  const { data, error } = await supabase.from('api_keys').insert({ name: name.slice(0, 60), prefix: raw.slice(0, 10), key_hash: sha256hex(raw), scopes, revoked: false }).select('id,name,prefix,scopes,created_at').single();
  if (error) throw error;
  await audit(ctx, 'apikey.create', 'api_keys', data.id, { scopes });
  return { key: raw, record: data };
};
H['apikey.revoke'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  await supabase.from('api_keys').update({ revoked: true }).eq('id', b.id);
  await audit(ctx, 'apikey.revoke', 'api_keys', b.id);
  return { ok: true };
};
H['webhook.test'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  await fireWebhooks('test.ping', { message: 'Hello from HRplus', by: ctx.profile.email }, b.id);
  const { data } = await supabase.from('webhooks').select('last_status,last_fired_at').eq('id', b.id).maybeSingle();
  await audit(ctx, 'webhook.test', 'webhooks', b.id, { status: data?.last_status });
  return data;
};
H['users.provision'] = async (ctx, b) => {
  requireRole(ctx, 'admin');
  const email = String(b.email || '').toLowerCase().trim();
  need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Valid email required');
  need(['admin', 'employee', 'vendor'].includes(b.role), 'Invalid role');
  if (b.role === 'vendor') need(b.vendor_id, 'Choose the vendor this user belongs to');
  const { data: ex } = await supabase.from('profiles').select('id').eq('email', email).limit(1);
  need(!ex?.length, 'A user with this email already exists');
  const phone = b.phone ? normPhone(b.phone) : null;
  const { data, error } = await supabase.from('profiles').insert({ email, role: b.role, employee_id: b.employee_id || null, vendor_id: b.vendor_id || null, display_name: String(b.display_name || email.split('@')[0]).slice(0, 80), phone, status: 'active', prefs: {}, mfa_enabled: false }).select('id,email,role,employee_id,vendor_id,display_name,phone,status').single();
  if (error) throw error;
  await audit(ctx, 'users.provision', 'profiles', data.id, { email, role: b.role });
  return data;
};

/* ---------------- dashboard ---------------- */
const RANGES = { '30d': 30, '90d': 90, '6m': 182, '12m': 365 };
function periodOf(b) { const days = RANGES[b.range] || 30; const end = riyadhDate(); const start = addDays(end, -(days - 1)); const pend = addDays(start, -1); return { days, start, end, pstart: addDays(pend, -(days - 1)), pend }; }
const kpi = (key, en, ar, value, prev, fmt, tone, cmp, invert = false) => ({ key, label: [en, ar], value, prev: cmp ? prev : null, fmt, tone, invert });
const inR = (d, s, e) => d >= s && d <= e;
function attStats(att, ok, s, e) {
  const days = new Map();
  for (const a of att) {
    if (!ok(a.employee_id) || !inR(a.date, s, e) || a.status === 'leave') continue;
    let o = days.get(a.date); if (!o) days.set(a.date, (o = { p: 0, n: 0 }));
    o.n++; if (a.status === 'present' || a.status === 'late') o.p++;
  }
  let P = 0, N = 0; for (const o of days.values()) { P += o.p; N += o.n; }
  return { days, rate: N ? r1((P / N) * 100) : null };
}
function trend(days, s, e, valueOf) {
  const keys = [...days.keys()].filter((d) => inR(d, s, e)).sort();
  if (calendarDays(s, e) <= 92) return { labels: keys, values: keys.map((k) => valueOf([days.get(k)])) };
  const buckets = new Map();
  for (const k of keys) { const wk = addDays(s, Math.floor((calendarDays(s, k) - 1) / 7) * 7); if (!buckets.has(wk)) buckets.set(wk, []); buckets.get(wk).push(days.get(k)); }
  const wks = [...buckets.keys()].sort();
  return { labels: wks, values: wks.map((w) => valueOf(buckets.get(w))), weekly: true };
}
const rateOf = (list) => { const p = list.reduce((s, o) => s + o.p, 0), n = list.reduce((s, o) => s + o.n, 0); return n ? r1((p / n) * 100) : null; };
const sumBy = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
function groupSum(arr, key, val) { const m = new Map(); for (const x of arr) { const k = key(x); m.set(k, (m.get(k) || 0) + (Number(val(x)) || 0)); } return m; }

H.dashboard = async (ctx, b) => {
  const P = periodOf(b), cmp = !!b.compare;
  if (ctx.profile.role === 'admin') return adminDash(ctx, b, P, cmp);
  if (ctx.profile.role === 'vendor') return vendorDash(ctx, b, P, cmp);
  return employeeDash(ctx, b, P, cmp);
};

async function adminDash(ctx, b, P, cmp) {
  const { start, end, pstart, pend, days } = P;
  const [emps, att, ts, slips, leaves, invs, exps, logs, vendors] = await Promise.all([
    fetchAll(() => supabase.from('employees').select('id,full_name,department,nationality,is_saudi,status,hire_date,iqama_expiry,primary_client,gender').order('id')),
    fetchAll(() => supabase.from('attendance').select('id,employee_id,date,status').gte('date', pstart).lte('date', end).order('id')),
    fetchAll(() => supabase.from('timesheets').select('id,employee_id,vendor_id,date,regular_hours,overtime_hours,bill_rate,status').order('id')),
    fetchAll(() => supabase.from('payslips').select('id,employee_id,period,gross,net,gosi_employee,gosi_employer').order('id')),
    fetchAll(() => supabase.from('leave_requests').select('id,employee_id,start_date,end_date,days,status,type_id, leave_types(name_en,name_ar,color)').order('id')),
    fetchAll(() => supabase.from('invoices').select('id,vendor_id,issue_date,total,vat,status').order('id')),
    supabase.from('expenses').select('id,employee_id,amount').eq('status', 'pending').then((r) => r.data || []),
    supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(25).then((r) => r.data || []),
    supabase.from('vendors').select('id,name').then((r) => r.data || []),
  ]);
  const dept = b.department && b.department !== 'all' ? b.department : null;
  const client = b.client && b.client !== 'all' ? b.client : null;
  const E = emps.filter((e) => (!dept || e.department === dept) && (!client || e.primary_client === client));
  const ids = new Set(E.map((e) => e.id)); const ok = (id) => ids.has(id);
  const vname = new Map(vendors.map((v) => [v.id, v.name]));
  const live = E.filter((e) => e.status !== 'Terminated');
  const head = live.length, headPrev = live.filter((e) => e.hire_date <= pend).length;
  const saud = head ? r1((live.filter((e) => e.is_saudi).length / head) * 100) : 0;
  const saudPrev = headPrev ? r1((live.filter((e) => e.is_saudi && e.hire_date <= pend).length / headPrev) * 100) : 0;
  const A = attStats(att, ok, start, end), Ap = attStats(att, ok, pstart, pend);
  const periods = [...new Set(slips.map((s) => s.period))].sort();
  const lastP = periods[periods.length - 1], prevP = periods[periods.length - 2];
  const S = slips.filter((s) => ok(s.employee_id));
  const grossOf = (p) => r2(sumBy(S.filter((s) => s.period === p), (s) => s.gross));
  const gosiOf = (p) => r2(sumBy(S.filter((s) => s.period === p), (s) => Number(s.gosi_employee) + Number(s.gosi_employer)));
  const T = ts.filter((t) => ok(t.employee_id) && t.status === 'Approved');
  const rev = (s, e) => r2(sumBy(T.filter((t) => inR(t.date, s, e)), (t) => (Number(t.regular_hours) + Number(t.overtime_hours)) * Number(t.bill_rate)));
  const today = end;
  const iq = live.filter((e) => !e.is_saudi && e.iqama_expiry).map((e) => ({ ...e, days: calendarDays(today, e.iqama_expiry) - 1 })).filter((e) => e.days <= 60);
  const pendL = leaves.filter((l) => l.status === 'pending' && ok(l.employee_id)).length;
  const pendE = exps.filter((x) => ok(x.employee_id)).length;
  const pendT = ts.filter((t) => ok(t.employee_id) && ['Pending Review', 'Submitted'].includes(t.status)).length;
  const kpis = [
    kpi('headcount', 'Headcount', 'عدد الموظفين', head, headPrev, 'num', 'brand', cmp),
    kpi('saudization', 'Saudization (Nitaqat)', 'نسبة السعودة (نطاقات)', saud, saudPrev, 'pct', 'mint', cmp),
    kpi('attendance', 'Attendance rate', 'نسبة الحضور', A.rate, Ap.rate, 'pct', 'sky', cmp),
    kpi('payroll', `Gross payroll · ${lastP || '—'}`, `إجمالي الرواتب · ${lastP || '—'}`, grossOf(lastP), grossOf(prevP), 'sar', 'violet', cmp),
    kpi('gosi', 'GOSI contributions', 'اشتراكات التأمينات', gosiOf(lastP), gosiOf(prevP), 'sar', 'amber', cmp),
    kpi('revenue', 'Billable revenue', 'الإيرادات القابلة للفوترة', rev(start, end), rev(pstart, pend), 'sar', 'coral', cmp),
    kpi('iqama', 'Iqama alerts (≤60d)', 'تنبيهات الإقامة (≤60 يوم)', iq.length, null, 'num', 'rose', false, true),
    kpi('approvals', 'Pending approvals', 'موافقات معلقة', pendL + pendE + pendT, null, 'num', 'gold', false, true),
  ];
  const nMonths = Math.max(6, Math.min(12, Math.ceil(days / 30)));
  const months = lastP ? monthsBack(lastP, nMonths) : [];
  const prevMonths = months.length ? monthsBack(addDays(`${months[0]}-01`, -1).slice(0, 7), nMonths) : [];
  const netOf = (p) => r2(sumBy(S.filter((s) => s.period === p), (s) => s.net));
  const tr = trend(A.days, start, end, rateOf), trp = trend(Ap.days, pstart, pend, rateOf);
  const revCur = groupSum(T.filter((t) => inR(t.date, start, end)), (t) => vname.get(t.vendor_id) || 'Other', (t) => (Number(t.regular_hours) + Number(t.overtime_hours)) * Number(t.bill_rate));
  const revPrev = groupSum(T.filter((t) => inR(t.date, pstart, pend)), (t) => vname.get(t.vendor_id) || 'Other', (t) => (Number(t.regular_hours) + Number(t.overtime_hours)) * Number(t.bill_rate));
  const clients = [...new Set([...revCur.keys(), ...revPrev.keys()])].sort();
  const byDept = groupSum(live, (e) => e.department, () => 1);
  const nat = groupSum(live, (e) => (e.is_saudi ? 'Saudi' : String(e.nationality || '').replace('Expat - ', '')), () => 1);
  const natSorted = [...nat.entries()].sort((a, b2) => b2[1] - a[1]);
  const natTop = natSorted.slice(0, 6); const natRest = natSorted.slice(6).reduce((s, x) => s + x[1], 0);
  if (natRest) natTop.push(['Other', natRest]);
  const L = leaves.filter((l) => l.status === 'approved' && ok(l.employee_id));
  const lt = groupSum(L, (l) => l.leave_types?.name_en || 'Other', (l) => overlapDays(l.start_date, l.end_date, start, end) ? l.days : 0);
  const ltAr = new Map(L.map((l) => [l.leave_types?.name_en, l.leave_types?.name_ar]));
  const ltEntries = [...lt.entries()].filter(([, v]) => v > 0);
  const outstanding = r2(sumBy(invs.filter((i) => ['issued', 'sent'].includes(i.status)), (i) => i.total));
  const charts = [
    { key: 'payroll_trend', type: 'line', title: ['Payroll trend', 'اتجاه الرواتب'], fmt: 'sar', xfmt: 'month', labels: months, series: [{ name: ['Gross', 'الإجمالي'], data: months.map(grossOf) }, { name: ['Net', 'الصافي'], data: months.map(netOf) }, ...(cmp ? [{ name: ['Gross · previous', 'الإجمالي · السابق'], data: prevMonths.map(grossOf), dashed: true }] : [])] },
    { key: 'attendance_trend', type: 'line', title: [tr.weekly ? 'Attendance rate (weekly)' : 'Attendance rate (daily)', tr.weekly ? 'نسبة الحضور (أسبوعي)' : 'نسبة الحضور (يومي)'], fmt: 'pct', xfmt: 'day', labels: tr.labels, series: [{ name: ['This period', 'الفترة الحالية'], data: tr.values }, ...(cmp ? [{ name: ['Previous period', 'الفترة السابقة'], data: tr.labels.map((_, i) => trp.values[i] ?? null), dashed: true }] : [])] },
    { key: 'revenue_by_client', type: 'bar', title: ['Billable revenue by client', 'الإيرادات حسب العميل'], fmt: 'sar', xfmt: 'text', labels: clients, series: [{ name: ['This period', 'الفترة الحالية'], data: clients.map((c) => r2(revCur.get(c) || 0)) }, ...(cmp ? [{ name: ['Previous', 'السابقة'], data: clients.map((c) => r2(revPrev.get(c) || 0)) }] : [])], footer: { label: ['Outstanding receivables', 'الذمم المستحقة'], value: outstanding, fmt: 'sar' } },
    { key: 'headcount_by_dept', type: 'hbar', title: ['Headcount by department', 'الموظفون حسب الإدارة'], fmt: 'num', labels: [...byDept.keys()], series: [{ name: ['Employees', 'الموظفون'], data: [...byDept.values()] }] },
    { key: 'workforce_mix', type: 'donut', title: ['Workforce nationality mix', 'توزيع الجنسيات'], fmt: 'num', labels: natTop.map((x) => x[0]), series: [{ name: ['Employees', 'الموظفون'], data: natTop.map((x) => x[1]) }] },
    { key: 'leave_by_type', type: 'donut', title: ['Leave days by type', 'أيام الإجازات حسب النوع'], fmt: 'num', labels: ltEntries.map((x) => x[0]), labels_ar: ltEntries.map((x) => ltAr.get(x[0]) || x[0]), series: [{ name: ['Days', 'أيام'], data: ltEntries.map((x) => x[1]) }] },
    { key: 'iqama_watch', type: 'list', title: ['Iqama expiry watch', 'متابعة انتهاء الإقامات'], items: iq.sort((a, c) => a.days - c.days).slice(0, 12).map((e) => ({ id: e.id, title: e.full_name, sub: `${e.nationality} · ${e.iqama_expiry}`, value: e.days, tone: e.days < 0 ? 'rose' : e.days <= 30 ? 'coral' : 'amber', link: '/directory?tab=iqama' })) },
    { key: 'activity', type: 'feed', title: ['Activity feed', 'سجل النشاط'], items: logs.map((l) => ({ at: l.created_at, actor: l.actor_email, role: l.actor_role, action: l.action, resource: l.resource, record: l.record_id })) },
  ];
  return { role: 'admin', period: P, kpis, charts, scopes: { departments: [...new Set(emps.map((e) => e.department))].sort(), clients: [...new Set(emps.map((e) => e.primary_client).filter(Boolean))].sort() } };
}

async function employeeDash(ctx, b, P, cmp) {
  const { start, end, pstart, pend, days } = P;
  const empId = ctx.profile.employee_id;
  need(empId, 'No employee record linked');
  const [att, slips, leaves, exps, assets, rules, acks, notes, bal] = await Promise.all([
    fetchAll(() => supabase.from('attendance').select('id,date,status,check_in,check_out').eq('employee_id', empId).gte('date', pstart).lte('date', end).order('id')),
    supabase.from('payslips').select('period,gross,net,gosi_employee').eq('employee_id', empId).eq('status', 'paid').order('period').then((r) => r.data || []),
    supabase.from('leave_requests').select('days,status,start_date,end_date, leave_types(name_en,name_ar)').eq('employee_id', empId).then((r) => r.data || []),
    supabase.from('expenses').select('amount,status,expense_date, expense_categories(name_en,name_ar)').eq('employee_id', empId).then((r) => r.data || []),
    supabase.from('assets').select('id').eq('assigned_to', empId).then((r) => r.data || []),
    supabase.from('rules').select('id,version').eq('active', true).then((r) => r.data || []),
    supabase.from('rule_acks').select('rule_id,version').eq('employee_id', empId).then((r) => r.data || []),
    supabase.from('notifications').select('*').eq('profile_id', ctx.profile.id).order('created_at', { ascending: false }).limit(20).then((r) => r.data || []),
    balancesFor(empId, Number(end.slice(0, 4))),
  ]);
  const me = () => true;
  const A = attStats(att, me, start, end), Ap = attStats(att, me, pstart, pend);
  const hrs = (a) => (a.check_in && a.check_out ? (Date.parse(a.check_out) - Date.parse(a.check_in)) / 3600e3 : 0);
  const avgH = (s, e) => { const r = att.filter((a) => inR(a.date, s, e) && a.check_out); return r.length ? r1(sumBy(r, hrs) / r.length) : null; };
  const annual = bal.find((x) => x.type.code === 'ANNUAL');
  const last = slips[slips.length - 1], prev = slips[slips.length - 2];
  const pending = leaves.filter((l) => l.status === 'pending').length + exps.filter((x) => x.status === 'pending').length;
  const unacked = rules.filter((r) => !acks.some((a) => a.rule_id === r.id && a.version === r.version)).length;
  const lateCount = (s, e) => att.filter((a) => inR(a.date, s, e) && a.status === 'late').length;
  const kpis = [
    kpi('attendance', 'My attendance', 'نسبة حضوري', A.rate, Ap.rate, 'pct', 'sky', cmp),
    kpi('avg_hours', 'Avg hours / day', 'متوسط الساعات يومياً', avgH(start, end), avgH(pstart, pend), 'hrs', 'mint', cmp),
    kpi('annual_left', 'Annual leave left', 'رصيد الإجازة السنوية', annual ? annual.remaining : 0, null, 'days', 'brand', false),
    kpi('net_pay', `Net pay · ${last?.period || '—'}`, `صافي الراتب · ${last?.period || '—'}`, last ? Number(last.net) : 0, prev ? Number(prev.net) : null, 'sar', 'violet', cmp),
    kpi('late', 'Late arrivals', 'مرات التأخير', lateCount(start, end), lateCount(pstart, pend), 'num', 'coral', cmp, true),
    kpi('pending', 'Pending requests', 'طلبات معلقة', pending, null, 'num', 'amber', false),
    kpi('assets', 'Assets in custody', 'العهد المسلمة', assets.length, null, 'num', 'gold', false),
    kpi('policies', 'Policies to acknowledge', 'سياسات بانتظار الإقرار', unacked, null, 'num', 'rose', false, true),
  ];
  const hDays = new Map(att.filter((a) => inR(a.date, start, end)).map((a) => [a.date, { h: hrs(a) }]));
  const ht = trend(hDays, start, end, (list) => r1(sumBy(list, (o) => o.h) / (list.length || 1)));
  const months = slips.slice(-Math.max(6, Math.min(12, Math.ceil(days / 30))));
  const lt = groupSum(leaves.filter((l) => l.status === 'approved' && l.start_date.startsWith(end.slice(0, 4))), (l) => l.leave_types?.name_en || 'Other', (l) => l.days);
  const ex = groupSum(exps.filter((x) => x.status !== 'rejected' && inR(x.expense_date, start, end)), (x) => x.expense_categories?.name_en || 'Other', (x) => x.amount);
  const charts = [
    { key: 'hours_trend', type: 'bar', title: [ht.weekly ? 'Avg hours per day (weekly)' : 'Hours worked per day', ht.weekly ? 'متوسط الساعات (أسبوعي)' : 'ساعات العمل اليومية'], fmt: 'hrs', xfmt: 'day', labels: ht.labels, series: [{ name: ['Hours', 'ساعات'], data: ht.values }] },
    { key: 'net_pay_trend', type: 'line', title: ['My net pay', 'صافي راتبي'], fmt: 'sar', xfmt: 'month', labels: months.map((m) => m.period), series: [{ name: ['Net', 'الصافي'], data: months.map((m) => Number(m.net)) }, { name: ['Gross', 'الإجمالي'], data: months.map((m) => Number(m.gross)) }] },
    { key: 'leave_usage', type: 'donut', title: ['Leave used this year', 'الإجازات المستخدمة هذا العام'], fmt: 'num', labels: [...lt.keys()], series: [{ name: ['Days', 'أيام'], data: [...lt.values()] }] },
    { key: 'leave_balances', type: 'hbar', title: ['Leave balances', 'أرصدة الإجازات'], fmt: 'num', labels: bal.filter((x) => x.entitled && x.entitled <= 60).map((x) => x.type.name_en), labels_ar: bal.filter((x) => x.entitled && x.entitled <= 60).map((x) => x.type.name_ar), series: [{ name: ['Remaining', 'المتبقي'], data: bal.filter((x) => x.entitled && x.entitled <= 60).map((x) => x.remaining) }] },
    { key: 'expenses_by_cat', type: 'donut', title: ['My expenses by category', 'مصروفاتي حسب الفئة'], fmt: 'sar', labels: [...ex.keys()], series: [{ name: ['SAR', 'ر.س'], data: [...ex.values()].map(r2) }] },
    { key: 'activity', type: 'feed', title: ['My activity', 'نشاطي'], items: notes.map((n) => ({ at: n.created_at, title: [n.title, n.title_ar || n.title], body: [n.body, n.body_ar || n.body], level: n.level, link: n.link })) },
  ];
  return { role: 'employee', period: P, kpis, charts, scopes: null };
}

async function vendorDash(ctx, b, P, cmp) {
  const { start, end, pstart, pend, days } = P;
  const vid = ctx.profile.vendor_id;
  need(vid, 'No vendor record linked');
  const [invs, ts, notes] = await Promise.all([
    supabase.from('invoices').select('id,number,issue_date,total,vat,status,due_date').eq('vendor_id', vid).order('issue_date').then((r) => r.data || []),
    supabase.from('timesheets').select('id,date,project,regular_hours,overtime_hours,bill_rate,status,employee_id, employees(full_name)').eq('vendor_id', vid).order('date').then((r) => r.data || []),
    supabase.from('notifications').select('*').eq('profile_id', ctx.profile.id).order('created_at', { ascending: false }).limit(20).then((r) => r.data || []),
  ]);
  const billed = (s, e) => r2(sumBy(invs.filter((i) => i.status !== 'void' && inR(i.issue_date, s, e)), (i) => i.total));
  const hours = (s, e) => r1(sumBy(ts.filter((t) => inR(t.date, s, e)), (t) => Number(t.regular_hours) + Number(t.overtime_hours)));
  const outstanding = r2(sumBy(invs.filter((i) => ['issued', 'sent'].includes(i.status)), (i) => i.total));
  const overdue = invs.filter((i) => ['issued', 'sent'].includes(i.status) && i.due_date < end).length;
  const pendingTs = ts.filter((t) => ['Pending Review', 'Submitted'].includes(t.status)).length;
  const consultants = new Set(ts.filter((t) => inR(t.date, start, end)).map((t) => t.employee_id)).size;
  const kpis = [
    kpi('billed', 'Invoiced (incl. VAT)', 'المفوتر (شامل الضريبة)', billed(start, end), billed(pstart, pend), 'sar', 'brand', cmp),
    kpi('outstanding', 'Outstanding balance', 'الرصيد المستحق', outstanding, null, 'sar', 'coral', false, true),
    kpi('hours', 'Hours delivered', 'الساعات المنجزة', hours(start, end), hours(pstart, pend), 'hrs', 'sky', cmp),
    kpi('pending_ts', 'Timesheets to approve', 'سجلات بانتظار اعتمادك', pendingTs, null, 'num', 'amber', false, true),
    kpi('consultants', 'Active consultants', 'المستشارون النشطون', consultants, null, 'num', 'mint', false),
    kpi('overdue', 'Overdue invoices', 'فواتير متأخرة', overdue, null, 'num', 'rose', false, true),
  ];
  const months = monthsBack(end.slice(0, 7), Math.max(6, Math.min(12, Math.ceil(days / 30))));
  const byProject = groupSum(ts.filter((t) => inR(t.date, start, end)), (t) => t.project, (t) => Number(t.regular_hours) + Number(t.overtime_hours));
  const byStatus = groupSum(ts, (t) => t.status, () => 1);
  const byPerson = groupSum(ts.filter((t) => inR(t.date, start, end)), (t) => t.employees?.full_name || t.employee_id, (t) => Number(t.regular_hours) + Number(t.overtime_hours));
  const charts = [
    { key: 'invoiced_monthly', type: 'bar', title: ['Invoiced per month', 'المفوتر شهرياً'], fmt: 'sar', xfmt: 'month', labels: months, series: [{ name: ['Invoiced', 'المفوتر'], data: months.map((m) => r2(sumBy(invs.filter((i) => i.status !== 'void' && i.issue_date.startsWith(m)), (i) => i.total))) }] },
    { key: 'hours_by_project', type: 'hbar', title: ['Hours by project', 'الساعات حسب المشروع'], fmt: 'hrs', labels: [...byProject.keys()], series: [{ name: ['Hours', 'ساعات'], data: [...byProject.values()] }] },
    { key: 'timesheet_status', type: 'donut', title: ['Timesheet status', 'حالة السجلات'], fmt: 'num', labels: [...byStatus.keys()], series: [{ name: ['Timesheets', 'السجلات'], data: [...byStatus.values()] }] },
    { key: 'hours_by_consultant', type: 'hbar', title: ['Hours by consultant', 'الساعات حسب المستشار'], fmt: 'hrs', labels: [...byPerson.keys()].slice(0, 12), series: [{ name: ['Hours', 'ساعات'], data: [...byPerson.values()].slice(0, 12) }] },
    { key: 'activity', type: 'feed', title: ['Account activity', 'نشاط الحساب'], items: [...notes.map((n) => ({ at: n.created_at, title: [n.title, n.title_ar || n.title], body: [n.body, n.body_ar || n.body], level: n.level, link: n.link })), ...invs.slice(-8).map((i) => ({ at: `${i.issue_date}T09:00:00Z`, title: [`Invoice ${i.number}`, `فاتورة ${i.number}`], body: [`SAR ${Number(i.total).toLocaleString()} · ${i.status}`, `${Number(i.total).toLocaleString()} ر.س · ${i.status}`], level: i.status === 'paid' ? 'success' : 'info', link: '/invoices' }))].sort((a, c) => (a.at < c.at ? 1 : -1)).slice(0, 20) },
  ];
  return { role: 'vendor', period: P, kpis, charts, scopes: null };
}
