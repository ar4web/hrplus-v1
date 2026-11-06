// One-time, token-guarded bootstrap seeder. Requires secrets.seed_token; the token is deleted on 'finish'.
import crypto from 'node:crypto';
import { supabase, cors, sendError, HttpError, getCompany, getZatcaKeys, fetchAll } from './_lib.js';
import { EMPLOYEES, TIMESHEETS } from './_seeddata.js';
import { r2, addDays, dow, workingDays, calendarDays, gosi, lastDayOf, monthsBack } from './_saudi.js';
import { signInvoice, computeLines, INITIAL_PIH } from './_zatca.js';

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261106);
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const between = (a, b) => a + Math.floor(R() * (b - a + 1));

const AR_FIRST = { Diego: 'دييغو', Lucia: 'لوسيا', David: 'ديفيد', Michael: 'مايكل', Priya: 'بريا', Linda: 'ليندا', Arjun: 'أرجون', Robert: 'روبرت', Ethan: 'إيثان', Elizabeth: 'إليزابيث', Noah: 'نوح', Olivia: 'أوليفيا', Fatima: 'فاطمة', James: 'جيمس', Hana: 'هناء', Isabella: 'إيزابيلا', Nisha: 'نيشا', Lucas: 'لوكاس', Barbara: 'باربرا', Sofia: 'صوفيا', Omar: 'عمر', Carlos: 'كارلوس', Mary: 'ماري', Wei: 'وي', Raj: 'راج', Patricia: 'باتريشيا', Aisha: 'عائشة', Mohammed: 'محمد', Chen: 'تشين', Ava: 'آفا', John: 'جون' };
const AR_LAST = { Brown: 'براون', Wilson: 'ويلسون', Martinez: 'مارتينيز', Kim: 'كيم', Davis: 'ديفيس', Lee: 'لي', Santos: 'سانتوس', Johnson: 'جونسون', Thomas: 'توماس', Gonzalez: 'غونزاليس', Williams: 'ويليامز', Lopez: 'لوبيز', Hernandez: 'هيرنانديز', Jones: 'جونز', Garcia: 'غارسيا', Smith: 'سميث', Rodriguez: 'رودريغيز', Chen: 'تشين', Wang: 'وانغ', Okafor: 'أوكافور', Silva: 'سيلفا', Miller: 'ميلر', Khan: 'خان', Haddad: 'حداد', Ali: 'علي' };
const BANKS = [['RJHI', '80'], ['SNBC', '10'], ['SABB', '45'], ['RIBL', '20'], ['ALBI', '15'], ['ARNB', '30']];
const digits = (n) => Array.from({ length: n }, () => between(0, 9)).join('');

async function insertChunks(table, rows, size = 800) {
  for (let i = 0; i < rows.length; i += size) { const { error } = await supabase.from(table).insert(rows.slice(i, i + size)); if (error) throw new Error(`${table}: ${error.message}`); }
}
const iso = (day, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(day + 'T00:00:00Z') + ((h - 3) * 60 + m) * 60000).toISOString(); };
const hm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

async function core() {
  const { data: vendors } = await supabase.from('vendors').select('*');
  const vByName = new Map(vendors.map((v) => [v.name, v]));
  const seen = new Set();
  const emps = EMPLOYEES.map((e) => {
    const [first, ...rest] = e.full_name.split(' '); const last = rest.join(' ');
    const saudi = e.nationality === 'Saudi Citizen';
    const basic = r2(e.annual_salary / 12);
    let email = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '');
    if (seen.has(email)) email += e.id.slice(-2); seen.add(email);
    email += '@hrplus.sa';
    if (e.id === 'EMP1003') email = 'employee@hrplus.sa';
    if (e.id === 'EMP1051') email = 'admin@hrplus.sa';
    const bank = pick(BANKS);
    return {
      id: e.id, full_name: e.full_name, full_name_ar: `${AR_FIRST[first] || first} ${AR_LAST[last] || last}`, email,
      phone: e.id === 'EMP1003' ? '+966500000003' : e.id === 'EMP1051' ? '+966500000001' : `+9665${between(3, 9)}${digits(7)}`,
      gender: e.gender, age: e.age, department: e.department, job_title: e.job_title, location: e.location, hire_date: e.hire_date,
      employment_type: e.employment_type, status: e.status, nationality: e.nationality, is_saudi: saudi, iqama_number: e.iqama_number,
      iqama_expiry: e.iqama_expiry, iqama_renewal_status: e.iqama_renewal_status, annual_salary: e.annual_salary, bonus: e.bonus,
      basic_salary: basic, housing_allowance: r2(basic * (saudi ? 0.25 : 0.2)), transport_allowance: r2(basic * 0.1), other_allowance: r2(basic * 0.05),
      primary_client: e.primary_client, bank_code: bank[0], iban: `SA${digits(2)}${bank[1]}${digits(18)}`,
    };
  });
  await insertChunks('employees', emps);
  const gulf = vByName.get('Gulf Cloud Infrastructure');
  const profiles = emps.map((e) => ({ email: e.email, role: e.id === 'EMP1051' ? 'admin' : 'employee', employee_id: e.id, display_name: e.full_name, phone: e.phone, status: 'active', prefs: {}, mfa_enabled: false }));
  profiles.push({ email: 'vendor@hrplus.sa', role: 'vendor', vendor_id: gulf.id, display_name: 'Gulf Cloud · Accounts', phone: '+966500000005', status: 'active', prefs: {}, mfa_enabled: false });
  for (const v of vendors.filter((x) => x.type === 'client' && x.id !== gulf.id && x.email)) profiles.push({ email: v.email, role: 'vendor', vendor_id: v.id, display_name: `${v.name} · Accounts`, phone: v.phone, status: 'active', prefs: {}, mfa_enabled: false });
  await insertChunks('profiles', profiles);
  await insertChunks('timesheets', TIMESHEETS.map((t) => ({ id: t.id, date: t.date, employee_id: t.employee_id, vendor_id: vByName.get(t.client)?.id || null, project: t.project, regular_hours: t.regular_hours, overtime_hours: t.overtime_hours, bill_rate: r2(t.rate_usd * 3.75), status: t.status })));
  return { employees: emps.length, profiles: profiles.length, timesheets: TIMESHEETS.length };
}

async function history() {
  const emps = await fetchAll(() => supabase.from('employees').select('*').order('id'));
  const { data: hol } = await supabase.from('holidays').select('date');
  const H = new Set((hol || []).map((h) => h.date));
  const company = await getCompany(true);
  const { data: types } = await supabase.from('leave_types').select('*');
  const T = Object.fromEntries(types.map((t) => [t.code, t]));
  // attendance: last ~14 weeks of working days
  const end = '2026-11-05', start = '2026-08-02';
  const workDays = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (dow(d) <= 4 && !H.has(d)) workDays.push(d);
  const last7 = workDays.slice(-7);
  const att = [];
  for (const e of emps) {
    const remote = e.location === 'Remote';
    for (const d of workDays) {
      if (e.hire_date > d) continue;
      if (e.status === 'On Leave' && last7.includes(d)) { att.push({ employee_id: e.id, date: d, status: 'leave', source: 'system', remote: false }); continue; }
      const x = R();
      if (x < 0.035) { att.push({ employee_id: e.id, date: d, status: 'absent', source: 'system', remote: false }); continue; }
      const late = x < 0.12;
      const inMin = late ? between(8 * 60 + 16, 9 * 60 + 25) : between(7 * 60 + 30, 8 * 60 + 14);
      const outMin = between(16 * 60 + 25, 18 * 60 + 10);
      const dist = remote ? null : between(8, 190);
      att.push({ employee_id: e.id, date: d, check_in: iso(d, hm(inMin)), check_out: iso(d, hm(outMin)), status: late ? 'late' : 'present', lat: remote ? null : 24.6995 + (R() - 0.5) * 0.002, lng: remote ? null : 46.6853 + (R() - 0.5) * 0.002, distance_m: dist, remote, source: R() < 0.04 ? 'offline' : 'online' });
    }
  }
  await insertChunks('attendance', att, 1000);
  // leave requests
  const wd = (s, e2) => workingDays(s, e2, H);
  const leaves = [];
  const mk = (emp, code, s, e2, status, reason, note) => { const t = T[code]; leaves.push({ employee_id: emp, type_id: t.id, start_date: s, end_date: e2, days: t.calendar_days ? calendarDays(s, e2) : wd(s, e2), reason, status, decided_by: status === 'pending' ? null : 'Patricia Thomas', decision_note: note || null, decided_at: status === 'pending' ? null : new Date(Date.parse(s) - 5 * 864e5).toISOString(), created_at: new Date(Date.parse(s) - 12 * 864e5).toISOString() }); };
  mk('EMP1003', 'ANNUAL', '2026-07-12', '2026-07-16', 'approved', 'Family trip to Abha');
  mk('EMP1003', 'SICK', '2026-09-08', '2026-09-08', 'approved', 'Flu — medical report attached');
  mk('EMP1003', 'ANNUAL', '2026-12-20', '2026-12-24', 'pending', 'Year-end vacation');
  const reasons = ['Family visit', 'Personal matters', 'Travel abroad', 'Rest and recovery', 'Wedding of a relative', 'Medical appointment'];
  for (const e of emps) {
    if (e.id === 'EMP1003') continue;
    if (e.status === 'On Leave') mk(e.id, 'ANNUAL', last7[0], '2026-11-12', 'approved', 'Annual vacation');
    const n = between(0, 3);
    for (let i = 0; i < n; i++) {
      const month = between(1, 9); const day = between(1, 20);
      const s = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const sick = R() < 0.3;
      const e2 = addDays(s, sick ? between(0, 1) : between(2, 6));
      if (s < e.hire_date) continue;
      if (wd(s, e2) === 0) continue;
      mk(e.id, sick ? 'SICK' : 'ANNUAL', s, e2, R() < 0.9 ? 'approved' : 'rejected', sick ? 'Medical leave' : pick(reasons), undefined);
    }
    if (R() < 0.14) { const s = addDays('2026-11-15', between(0, 40)); const e2 = addDays(s, between(1, 4)); if (wd(s, e2)) mk(e.id, R() < 0.2 ? 'MARRIAGE' : 'ANNUAL', s, e2, 'pending', pick(reasons)); }
  }
  mk('EMP1013', 'HAJJ', '2026-05-22', '2026-06-01', 'approved', 'Hajj 1447');
  mk('EMP1022', 'MATERNITY', '2026-02-01', '2026-04-25', 'approved', 'Maternity leave');
  mk('EMP1047', 'UNPAID', '2026-10-11', '2026-10-15', 'approved', 'Personal travel (unpaid)');
  for (const l of leaves) if (l.status === 'rejected') l.decision_note = 'Team coverage insufficient in that period';
  await insertChunks('leave_requests', leaves);
  // payroll: 12 paid months
  const ts = await fetchAll(() => supabase.from('timesheets').select('*').order('id'));
  const periods = monthsBack('2026-10', 12);
  const cfg = company.settings?.gosi;
  for (const p of periods) {
    const pEnd = lastDayOf(p);
    const rows = emps.filter((e) => e.hire_date <= pEnd).map((e) => {
      const basic = Number(e.basic_salary), housing = Number(e.housing_allowance), transport = Number(e.transport_allowance), other = Number(e.other_allowance);
      const fixed = basic + housing + transport + other;
      const ot = ts.filter((t) => t.employee_id === e.id && t.status === 'Approved' && t.date.startsWith(p)).reduce((s, t) => s + Number(t.overtime_hours), 0);
      const overtime = r2(ot * (fixed / 176) * 1.5);
      const bonus = p === '2026-03' ? Number(e.bonus || 0) : 0;
      const unpaid = p === '2026-10' && e.id === 'EMP1047' ? 5 : 0;
      const deductions = r2((fixed / 30) * unpaid);
      const g = gosi(e, cfg);
      const gross = r2(fixed + overtime + bonus);
      return { employee_id: e.id, period: p, basic, housing, transport, other_allowance: other, overtime, bonus, gross, gosi_base: g.base, gosi_employee: g.employee, gosi_employer: g.employer, deductions, net: r2(gross - g.employee - deductions), payment_method: 'WPS Bank Transfer', status: 'paid', created_at: new Date(Date.parse(pEnd + 'T09:00:00Z')).toISOString() };
    });
    const totals = { employees: rows.length, gross: r2(rows.reduce((s, r) => s + r.gross, 0)), net: r2(rows.reduce((s, r) => s + r.net, 0)), gosi_employee: r2(rows.reduce((s, r) => s + r.gosi_employee, 0)), gosi_employer: r2(rows.reduce((s, r) => s + r.gosi_employer, 0)), overtime: r2(rows.reduce((s, r) => s + r.overtime, 0)), deductions: r2(rows.reduce((s, r) => s + r.deductions, 0)) };
    const { data: run, error } = await supabase.from('payroll_runs').insert({ period: p, status: 'paid', totals, created_at: new Date(Date.parse(pEnd + 'T06:00:00Z')).toISOString(), finalized_at: new Date(Date.parse(pEnd + 'T10:00:00Z')).toISOString() }).select().single();
    if (error) throw error;
    await insertChunks('payslips', rows.map((r) => ({ ...r, run_id: run.id })));
  }
  return { attendance: att.length, leaves: leaves.length, payroll_months: periods.length };
}

async function finance() {
  const company = await getCompany(true);
  const keys = await getZatcaKeys();
  const { data: vendors } = await supabase.from('vendors').select('*').eq('type', 'client').order('id');
  const emps = await fetchAll(() => supabase.from('employees').select('id,primary_client,department').order('id'));
  const ts = await fetchAll(() => supabase.from('timesheets').select('*').order('id'));
  const plan = [];
  for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) {
    for (const v of vendors) {
      let lines;
      if (m === '2026-10') {
        const by = new Map();
        for (const t of ts.filter((x) => x.vendor_id === v.id && x.status === 'Approved' && x.date.startsWith(m))) by.set(t.project, (by.get(t.project) || 0) + Number(t.regular_hours) + Number(t.overtime_hours));
        lines = [...by.entries()].map(([p, h]) => ({ description: `Consulting services – ${p} (${m})`, qty: h, unit_price: Number(v.billable_rate) }));
      } else {
        const n = emps.filter((e) => e.primary_client === v.name).length || 3;
        lines = [{ description: `Staff augmentation – ${n} consultants (${m})`, qty: n * between(148, 168), unit_price: Number(v.billable_rate) }];
        if (R() < 0.5) lines.push({ description: `Project management & reporting (${m})`, qty: 1, unit_price: between(8, 20) * 1000 });
      }
      if (!lines.length) continue;
      const nextMonth = addDays(lastDayOf(m), between(2, 5));
      const status = m === '2026-10' ? 'sent' : (m === '2026-09' && v.name === 'Apex Global Systems' ? 'sent' : 'paid');
      plan.push({ date: nextMonth, type: 'B2B', vendor: v, lines, status, design: pick(['classic', 'band', 'minimal']) });
    }
  }
  const b2c = [['2026-08-19', 'Abdullah Al-Qahtani', '+966551234567'], ['2026-09-24', 'Noura Al-Harbi', '+966559876543'], ['2026-10-28', 'Faisal Al-Dossary', '+966503456789']];
  for (const [d, name, phone] of b2c) plan.push({ date: d, type: 'B2C', buyer: { name, phone }, lines: [{ description: 'Saudi Labor Law & HR compliance workshop – seat', qty: 1, unit_price: 1450 }, { description: 'Course materials (bilingual)', qty: 1, unit_price: 150 }], status: 'paid', design: 'minimal' });
  plan.sort((a, b) => (a.date < b.date ? -1 : 1));
  let prev = INITIAL_PIH, icv = 0; const rows = [];
  for (const p of plan) {
    icv++;
    const { lines, subtotal, vat, total } = computeLines(p.lines);
    const buyer = p.type === 'B2B' ? { name: p.vendor.name, name_ar: p.vendor.name_ar, vat_number: p.vendor.vat_number, cr_number: p.vendor.cr_number, address: p.vendor.address, city: p.vendor.city, email: p.vendor.email, phone: p.vendor.phone } : p.buyer;
    const inv = { number: `INV-${p.date.slice(0, 4)}-${String(icv).padStart(5, '0')}`, uuid: crypto.randomUUID(), icv, prev_hash: prev, issue_date: p.date, issue_time: `${String(between(9, 15)).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}:00`, type: p.type, buyer, lines, subtotal, vat, total };
    const s = signInvoice({ company, inv, keys });
    rows.push({ ...inv, vendor_id: p.vendor?.id || null, due_date: addDays(p.date, 30), design: p.design, status: p.status, notes: p.type === 'B2B' ? 'Bank transfer to Al Rajhi Bank IBAN SA44 8000 0000 6080 1016 7519' : '', sent_via: p.status !== 'issued' && p.type === 'B2B' ? [{ channel: 'email', to: buyer.email, at: `${p.date}T10:00:00Z`, status: 'opened' }] : [], hash: s.hash, signature: s.signature, qr: s.qr, xml: s.xml, created_at: `${p.date}T10:00:00Z` });
    prev = s.hash;
  }
  await insertChunks('invoices', rows, 50);
  // expenses
  const { data: cats } = await supabase.from('expense_categories').select('*');
  const C = Object.fromEntries(cats.map((c) => [c.code, c]));
  const chainFor = (amt) => (amt <= 1000 ? ['Line Manager'] : amt <= 5000 ? ['Line Manager', 'Finance'] : ['Line Manager', 'Finance', 'CEO']);
  const exp = [];
  const mkx = (emp, code, amount, date, desc, status) => {
    const steps = chainFor(amount); const over = C[code].cap_per_claim && amount > Number(C[code].cap_per_claim); if (over && !steps.includes('CEO')) steps.push('CEO');
    let cur = 0; const chain = steps.map((s, i) => {
      if (status === 'approved') return { step: s, status: 'approved', by: 'Patricia Thomas', at: `${addDays(date, i + 1)}T11:00:00Z`, note: null };
      if (status === 'rejected') return i === 0 ? { step: s, status: 'rejected', by: 'Patricia Thomas', at: `${addDays(date, 1)}T11:00:00Z`, note: 'Outside policy — please resubmit with itemised receipt' } : { step: s, status: 'pending', by: null, at: null, note: null };
      if (i === 0 && steps.length > 1 && R() < 0.5) { cur = 1; return { step: s, status: 'approved', by: 'Patricia Thomas', at: `${addDays(date, 1)}T11:00:00Z`, note: null }; }
      return { step: s, status: 'pending', by: null, at: null, note: null };
    });
    exp.push({ employee_id: emp, category_id: C[code].id, amount, vat_amount: r2(amount * 0.15 / 1.15), expense_date: date, description: desc, receipt_path: null, status, approval_chain: chain, current_step: status === 'approved' ? steps.length - 1 : cur, over_cap: !!over, created_at: `${date}T15:00:00Z` });
  };
  mkx('EMP1003', 'TRAVEL', 2340, '2026-09-14', 'Flight RUH–JED for Gulf Cloud onsite workshop', 'approved');
  mkx('EMP1003', 'MEALS', 285, '2026-10-02', 'Client lunch – Gulf Cloud architecture review', 'approved');
  mkx('EMP1003', 'TRAINING', 6200, '2026-10-21', 'AWS Solutions Architect certification exam + course', 'pending');
  mkx('EMP1003', 'TRANSPORT', 145, '2026-11-03', 'Careem rides to client office', 'pending');
  const descs = { TRAVEL: ['Flight to Dammam client site', 'Train Riyadh–Qassim', 'Flight to Dubai partner meeting'], MEALS: ['Team lunch', 'Client dinner', 'Working lunch'], TRAINING: ['Online course subscription', 'PMP exam fee', 'Arabic business writing course'], OFFICE: ['Ergonomic keyboard', 'Printer toner', 'Notebooks & stationery'], TRANSPORT: ['Taxi to client office', 'Airport parking', 'Fuel for site visit'], TELECOM: ['Mobile data top-up', 'International roaming'], ACCOM: ['Hotel in Jeddah (2 nights)', 'Hotel in Khobar (1 night)'] };
  const ranges = { TRAVEL: [800, 6500], MEALS: [60, 650], TRAINING: [300, 8000], OFFICE: [40, 1800], TRANSPORT: [25, 900], TELECOM: [50, 450], ACCOM: [450, 3200] };
  for (let i = 0; i < 34; i++) {
    const e = pick(emps); const code = pick(Object.keys(ranges)); const amt = between(...ranges[code]);
    const date = addDays('2026-08-05', between(0, 92));
    const st = date > '2026-10-25' ? (R() < 0.8 ? 'pending' : 'approved') : (R() < 0.85 ? 'approved' : 'rejected');
    mkx(e.id, code, amt, date, pick(descs[code]), st);
  }
  await insertChunks('expenses', exp);
  // assets
  const A = [
    ['LAP', 'MacBook Pro 14" M3 Pro', 'Laptop', 9899, 4, 'Apple Store Riyadh'], ['LAP', 'Dell Latitude 7440', 'Laptop', 6499, 4, 'Jarir Bookstore'], ['LAP', 'Lenovo ThinkPad X1 Carbon', 'Laptop', 7299, 4, 'Extra Stores'],
    ['MON', 'Dell UltraSharp 27" U2723QE', 'Monitor', 2399, 5, 'Jarir Bookstore'], ['PHN', 'iPhone 15 Pro', 'Mobile', 4999, 3, 'STC Business'], ['PHN', 'Samsung Galaxy S24', 'Mobile', 3799, 3, 'Mobily Business'],
    ['VEH', 'Toyota Hilux 2024 (Fleet)', 'Vehicle', 118000, 5, 'Abdul Latif Jameel'], ['SRV', 'Dell PowerEdge R760 Server', 'IT Infrastructure', 64500, 5, 'Gulf Business Machines'], ['FUR', 'Herman Miller Aeron Chair', 'Furniture', 6800, 8, 'Al Mutlaq Furniture'],
    ['PRJ', 'Epson EB-L630U Projector', 'AV Equipment', 11900, 5, 'Extra Stores'], ['NET', 'Cisco Catalyst 9300 Switch', 'IT Infrastructure', 23800, 5, 'Gulf Business Machines'], ['TAB', 'iPad Pro 11"', 'Tablet', 4299, 3, 'Apple Store Riyadh'],
  ];
  const assets = []; let n = 1;
  const active = emps.filter((e) => e.department);
  for (let i = 0; i < 26; i++) {
    const a = i < A.length ? A[i] : pick(A.slice(0, 6));
    const purchase = addDays('2022-01-10', between(0, 1700));
    const warranty = addDays(purchase, a[3] > 20000 ? 1095 : 730 + between(0, 365));
    const roll = R();
    const status = a[2] === 'IT Infrastructure' ? 'In Stock' : roll < 0.68 ? 'Assigned' : roll < 0.78 ? 'In Stock' : roll < 0.86 ? 'In Repair' : roll < 0.95 ? 'Retired' : 'Procured';
    const assigned = status === 'Assigned' || status === 'In Repair' ? (i === 0 ? 'EMP1003' : i === 4 ? 'EMP1003' : pick(active).id) : null;
    const hist = [{ at: `${purchase}T08:00:00Z`, from: null, to: 'Procured', by: 'Procurement', note: `PO-${between(10000, 99999)}` }, { at: `${addDays(purchase, 3)}T08:00:00Z`, from: 'Procured', to: 'In Stock', by: 'IT Store', note: 'Tagged & registered' }];
    if (assigned) hist.push({ at: `${addDays(purchase, 7)}T08:00:00Z`, from: 'In Stock', to: 'Assigned', by: 'Patricia Thomas', note: 'Handover form signed', assigned_to: assigned });
    if (status === 'In Repair') hist.push({ at: `${addDays('2026-10-01', between(0, 30))}T08:00:00Z`, from: 'Assigned', to: 'In Repair', by: 'IT Helpdesk', note: 'Sent to authorised service centre', assigned_to: assigned });
    if (status === 'Retired') hist.push({ at: `${addDays(purchase, 1200)}T08:00:00Z`, from: 'In Stock', to: 'Retired', by: 'IT Store', note: 'End of useful life' });
    assets.push({ tag: `HRP-${a[0]}-${String(n++).padStart(4, '0')}`, name: a[1], category: a[2], serial_no: `${a[0]}${digits(9)}`, assigned_to: assigned, purchase_date: purchase, cost: a[3], salvage_value: r2(a[3] * 0.1), useful_life_years: a[4], dep_method: a[3] > 20000 ? 'declining' : 'straight_line', status, warranty_expiry: warranty, supplier: a[5], location: 'Riyadh HQ', history: hist });
  }
  await insertChunks('assets', assets);
  return { invoices: rows.length, expenses: exp.length, assets: assets.length };
}

async function social() {
  const profs = await fetchAll(() => supabase.from('profiles').select('id,email,role,employee_id,vendor_id,display_name').order('id'));
  const emps = await fetchAll(() => supabase.from('employees').select('id,department,full_name').order('id'));
  const admin = profs.find((p) => p.email === 'admin@hrplus.sa');
  const empDemo = profs.find((p) => p.email === 'employee@hrplus.sa');
  const venDemo = profs.find((p) => p.email === 'vendor@hrplus.sa');
  const { data: rules } = await supabase.from('rules').select('*');
  const acks = [];
  for (const e of emps) for (const r of rules) {
    if (e.id === 'EMP1003' && r.id > (rules[1]?.id ?? 2)) continue;
    if (e.id !== 'EMP1003' && R() < 0.22) continue;
    acks.push({ rule_id: r.id, employee_id: e.id, version: r.version, acked_at: `${addDays('2026-09-01', between(0, 60))}T09:30:00Z` });
  }
  await insertChunks('rule_acks', acks);
  const now = Date.now(); const ago = (h) => new Date(now - h * 3600e3).toISOString();
  await insertChunks('tickets', [
    { profile_id: empDemo.id, requester: empDemo.display_name, subject: 'Payslip shows wrong transport allowance', category: 'Payroll', priority: 'normal', status: 'in_progress', context: 'payroll', messages: [{ by: empDemo.display_name, role: 'employee', body: 'My October payslip shows SAR 666.67 transport allowance; my contract says 700. Could you check?', at: ago(50) }, { by: admin.display_name, role: 'admin', body: 'Thanks David — the allowance is 10% of basic per policy. I will share the contract annex with you today.', at: ago(30) }], updated_at: ago(30), created_at: ago(50) },
    { profile_id: venDemo.id, requester: venDemo.display_name, subject: 'Need XML copy of September invoice for our ERP', category: 'Invoicing', priority: 'high', status: 'open', context: 'invoices', messages: [{ by: venDemo.display_name, role: 'vendor', body: 'Our finance team needs the UBL XML for INV-2026 September to import into SAP. Can you confirm it is available in the portal?', at: ago(20) }], updated_at: ago(20), created_at: ago(20) },
    { profile_id: profs.find((p) => p.employee_id === 'EMP1020').id, requester: 'Olivia Williams', subject: 'Iqama renewal — documents checklist', category: 'Government Relations', priority: 'urgent', status: 'open', context: 'directory', messages: [{ by: 'Olivia Williams', role: 'employee', body: 'My Iqama expires on 28 Nov. Which documents do I need to submit for renewal through Muqeem?', at: ago(9) }], updated_at: ago(9), created_at: ago(9) },
    { profile_id: profs.find((p) => p.employee_id === 'EMP1033').id, requester: 'Olivia Smith', subject: 'Cannot check in from client site', category: 'Attendance', priority: 'normal', status: 'resolved', context: 'attendance', messages: [{ by: 'Olivia Smith', role: 'employee', body: 'The app says I am outside the geofence when working at the client office.', at: ago(140) }, { by: admin.display_name, role: 'admin', body: 'Client-site work should be logged as remote; I have updated your work location. Please try again.', at: ago(120) }], updated_at: ago(120), created_at: ago(140) },
  ]);
  const empProfiles = profs.filter((p) => p.role === 'employee' || p.role === 'admin');
  const hrIds = profs.filter((p) => emps.find((e) => e.id === p.employee_id)?.department === 'Human Resources').map((p) => p.id);
  const engIds = profs.filter((p) => emps.find((e) => e.id === p.employee_id)?.department === 'Engineering').map((p) => p.id);
  const convs = [
    { name: 'All Staff · جميع الموظفين', is_group: true, members: empProfiles.map((p) => p.id), created_by: admin.id },
    { name: 'HR Team', is_group: true, members: [...new Set([admin.id, ...hrIds])], created_by: admin.id },
    { name: 'Engineering', is_group: true, members: [...new Set([admin.id, ...engIds])], created_by: admin.id },
    { name: null, is_group: false, members: [admin.id, empDemo.id], created_by: admin.id },
    { name: null, is_group: false, members: [admin.id, venDemo.id], created_by: venDemo.id },
  ];
  const { data: cs, error } = await supabase.from('conversations').insert(convs.map((c) => ({ ...c, reads: {}, updated_at: ago(1) }))).select();
  if (error) throw error;
  const byName = (i) => cs[i];
  const msgs = [
    [0, admin, 'Good morning team! Reminder: National Day photos are now on the shared drive 🇸🇦', 70],
    [0, profs.find((p) => p.employee_id === 'EMP1029'), 'شكراً باتريشيا! كانت فعالية رائعة', 69],
    [0, admin, 'Please acknowledge the updated Attendance & Punctuality policy (v2) in Policies by Thursday.', 26],
    [0, empDemo, 'Done ✅ — acknowledged.', 25],
    [1, admin, 'Payroll for October has been paid via WPS. Mudad file uploaded.', 120],
    [1, profs.find((p) => p.employee_id === 'EMP1018'), 'Great. I will start the Iqama renewals for Nov/Dec expiries.', 118],
    [2, profs.find((p) => p.employee_id === 'EMP1025'), 'Sprint review moved to Wednesday 11:00.', 40],
    [2, empDemo, 'Noted. I will demo the failover test results.', 39],
    [3, admin, 'Hi David, your AWS certification claim is with Finance now.', 6],
    [3, empDemo, 'Thank you! Let me know if you need the course invoice.', 5],
    [3, admin, 'مرحباً ديفيد، تم استلام الفاتورة. شكراً لك', 4],
    [4, venDemo, 'Hello, could you confirm the October invoice amount before we process payment?', 30],
    [4, admin, 'Hi! INV for October is based on approved timesheets — you can view it under Invoicing with the ZATCA QR.', 28],
    [4, venDemo, 'Perfect, thanks. We will pay within terms.', 3],
  ];
  const rows = msgs.map(([ci, p, body, h]) => ({ conversation_id: byName(ci).id, sender_id: p.id, sender_name: p.display_name, body, created_at: ago(h) }));
  await insertChunks('messages', rows);
  for (let i = 0; i < cs.length; i++) {
    const last = rows.filter((r) => r.conversation_id === cs[i].id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    if (last) await supabase.from('conversations').update({ last_message: last.body.slice(0, 140), last_sender_id: last.sender_id, updated_at: last.created_at }).eq('id', cs[i].id);
  }
  const N = (p, t, ta, b, ba, link, level, h, read = false) => ({ profile_id: p.id, title: t, title_ar: ta, body: b, body_ar: ba, link, level, read, created_at: ago(h) });
  await insertChunks('notifications', [
    N(admin, 'Iqama expiring: Ethan Gonzalez', 'إقامة تنتهي قريباً: إيثان غونزاليس', 'Expires 20 Nov 2026 — start renewal on Muqeem', 'تنتهي 20 نوفمبر 2026 — ابدأ التجديد عبر مقيم', '/directory?tab=iqama', 'warning', 2),
    N(admin, 'Leave request: David Martinez', 'طلب إجازة: ديفيد مارتينيز', 'Annual Leave · 5 day(s) from 2026-12-20', 'إجازة سنوية · 5 أيام من 2026-12-20', '/leave?tab=approvals', 'action', 5),
    N(admin, 'Expense claim: SAR 6,200', 'مطالبة مصروفات: 6,200 ر.س', 'David Martinez · Training · exceeds cap', 'ديفيد مارتينيز · تدريب', '/expenses?tab=queue', 'action', 8),
    N(admin, 'Support ticket #3: Iqama renewal', 'تذكرة دعم #3: تجديد الإقامة', 'Olivia Williams · urgent', 'أوليفيا ويليامز · عاجل', '/support?tab=tickets', 'warning', 9),
    N(admin, 'October payroll paid', 'تم صرف رواتب أكتوبر', 'WPS file generated and submitted', 'تم إنشاء ملف حماية الأجور ورفعه', '/payroll', 'success', 140, true),
    N(empDemo, 'Payslip ready · 2026-10', 'قسيمة الراتب جاهزة · 2026-10', 'Your salary has been transferred via WPS.', 'تم تحويل راتبك عبر نظام حماية الأجور.', '/payroll', 'success', 140),
    N(empDemo, 'Policy update: Attendance & Punctuality v2', 'تحديث سياسة: الحضور والانضباط الإصدار 2', 'Please read and acknowledge.', 'يرجى القراءة والإقرار.', '/policies?tab=rules', 'action', 26),
    N(empDemo, 'Expense approved', 'تمت الموافقة على المصروف', 'SAR 285 · Client lunch', '285 ر.س · غداء عمل', '/expenses', 'success', 60, true),
    N(venDemo, 'New tax invoice issued', 'فاتورة ضريبية جديدة', 'October services invoice is available with ZATCA QR.', 'فاتورة خدمات أكتوبر متاحة مع رمز الاستجابة.', '/invoices', 'info', 72),
    N(venDemo, 'Timesheets awaiting your approval', 'سجلات ساعات بانتظار اعتمادك', 'Review consultant hours for November.', 'راجع ساعات المستشارين لشهر نوفمبر.', '/timesheets', 'action', 12),
  ]);
  const acts = [['payroll.paid', 'payroll_runs', '12', 140], ['payroll.wps_export', 'payroll_runs', '12', 139], ['invoice.create', 'invoices', '16', 72], ['leave.approved', 'leave_requests', '41', 50], ['employees.update', 'employees', 'EMP1020', 44], ['expense.approve', 'expenses', '3', 40], ['rule.publish', 'rules', '2', 27], ['asset.transition', 'assets', '5', 20], ['timesheet.approved', 'timesheets', 'TS1121', 15], ['company.update', 'company', '1', 12], ['backup.create', 'backups', 'hrplus-backup', 10], ['leave.request', 'leave_requests', '72', 5], ['expense.submit', 'expenses', '3', 8]];
  await insertChunks('audit_logs', acts.map(([a, r, id, h]) => ({ actor_profile_id: a === 'leave.request' || a === 'expense.submit' ? empDemo.id : admin.id, actor_email: a === 'leave.request' || a === 'expense.submit' ? empDemo.email : admin.email, actor_role: a === 'leave.request' || a === 'expense.submit' ? 'employee' : 'admin', action: a, resource: r, record_id: id, details: {}, ip: '10.0.0.' + between(2, 250), created_at: ago(h) })));
  return { acks: acks.length, conversations: cs.length, messages: rows.length };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const { data: tok } = await supabase.from('secrets').select('value').eq('key', 'seed_token').maybeSingle();
    const given = String(req.body?.token || '');
    if (!tok?.value || given.length !== tok.value.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(tok.value))) throw new HttpError(403, 'Forbidden');
    const step = req.body.step;
    let out;
    if (step === 'core') out = await core();
    else if (step === 'history') out = await history();
    else if (step === 'finance') out = await finance();
    else if (step === 'social') out = await social();
    else if (step === 'finish') { await supabase.from('secrets').delete().eq('key', 'seed_token'); out = { done: true }; }
    else throw new HttpError(400, 'Unknown step');
    res.status(200).json(out);
  } catch (e) { sendError(res, e); }
}
