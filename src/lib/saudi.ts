import { addDays, dow, r2 } from './format';

export const GOSI = { saudi_employee: 0.0975, saudi_employer: 0.1175, expat_employee: 0, expat_employer: 0.02, cap: 45000, floor: 1500 };
export function gosiCalc(e: any, cfg: any = {}) {
  const c = { ...GOSI, ...(cfg || {}) };
  const raw = (Number(e.basic_salary) || 0) + (Number(e.housing_allowance) || 0);
  const base = Math.min(Math.max(raw, c.floor), c.cap);
  return e.is_saudi
    ? { base, raw, capped: raw > c.cap, employee: r2(base * c.saudi_employee), employer: r2(base * c.saudi_employer), rates: [c.saudi_employee, c.saudi_employer] }
    : { base, raw, capped: raw > c.cap, employee: r2(base * c.expat_employee), employer: r2(base * c.expat_employer), rates: [c.expat_employee, c.expat_employer] };
}
export const monthlyGross = (e: any) => ['basic_salary', 'housing_allowance', 'transport_allowance', 'other_allowance'].reduce((s, k) => s + (Number(e?.[k]) || 0), 0);
export const eosbWage = (e: any) => (Number(e?.basic_salary) || 0) + (Number(e?.housing_allowance) || 0) + (Number(e?.transport_allowance) || 0);

// Saudi Labor Law Art. 84 (termination / contract end) & Art. 85 (resignation)
export function eosb(wage: number, years: number, reason: 'termination' | 'resignation' | 'force_majeure') {
  const first = Math.min(years, 5), rest = Math.max(years - 5, 0);
  const full = wage * 0.5 * first + wage * rest;
  let factor = 1;
  if (reason === 'resignation') factor = years < 2 ? 0 : years < 5 ? 1 / 3 : years < 10 ? 2 / 3 : 1;
  return { full: r2(full), factor, payable: r2(full * factor), first: r2(wage * 0.5 * first), rest: r2(wage * rest) };
}
export const yearsBetween = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5));

export function iqamaStatus(e: any, today: string) {
  if (e.is_saudi) return { key: 'citizen', days: null, tone: 'slate', en: 'Saudi national', ar: 'مواطن سعودي' };
  if (!e.iqama_expiry) return { key: 'unknown', days: null, tone: 'slate', en: 'Unknown', ar: 'غير معروف' };
  const days = Math.round((Date.parse(e.iqama_expiry) - Date.parse(today)) / 864e5);
  if (days < 0) return { key: 'expired', days, tone: 'rose', en: 'Expired', ar: 'منتهية' };
  if (days <= 30) return { key: 'critical', days, tone: 'coral', en: 'Critical (<30d)', ar: 'حرجة (<30 يوم)' };
  if (days <= 60) return { key: 'warning', days, tone: 'amber', en: 'Warning (30–60d)', ar: 'تحذير (30–60 يوم)' };
  return { key: 'valid', days, tone: 'mint', en: 'Valid', ar: 'سارية' };
}
export const IQAMA_FEES = { gov: 650, work_permit: 9600, insurance: 1200 };

export function workingDays(start: string, end: string, holidays: Set<string>, workDays = [0, 1, 2, 3, 4]) {
  if (!start || !end || end < start) return 0;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (workDays.includes(dow(d)) && !holidays.has(d)) n++;
  return n;
}

export function depreciation(a: any, asOf: string) {
  const cost = Number(a.cost) || 0, salvage = Number(a.salvage_value) || 0, life = Math.max(1, Number(a.useful_life_years) || 1);
  const method = a.dep_method === 'declining' ? 'declining' : 'straight_line';
  const rows: { year: number; open: number; dep: number; close: number }[] = [];
  let bv = cost;
  for (let y = 1; y <= life; y++) {
    let dep = method === 'straight_line' ? (cost - salvage) / life : Math.min(bv * (2 / life), bv - salvage);
    if (y === life) dep = bv - salvage;
    dep = Math.max(0, dep);
    rows.push({ year: y, open: r2(bv), dep: r2(dep), close: r2(bv - dep) });
    bv -= dep;
  }
  const yrs = a.purchase_date ? Math.max(0, (Date.parse(asOf) - Date.parse(a.purchase_date)) / (365.25 * 864e5)) : 0;
  const full = Math.floor(yrs), part = yrs - full;
  let book = cost;
  if (full >= life) book = salvage;
  else { book = full > 0 ? rows[full - 1].close : cost; book -= (rows[full]?.dep || 0) * part; }
  return { rows, book: r2(Math.max(salvage, book)), age: yrs, method, accumulated: r2(cost - Math.max(salvage, book)) };
}

export const NAT_AR: Record<string, string> = { 'Saudi Citizen': 'سعودي', Egyptian: 'مصري', Indian: 'هندي', Filipino: 'فلبيني', US: 'أمريكي', Jordanian: 'أردني', Sudanese: 'سوداني', Canadian: 'كندي', UK: 'بريطاني', Pakistani: 'باكستاني', Syrian: 'سوري' };
export const natAr = (n = '') => NAT_AR[n] || NAT_AR[n.replace('Expat - ', '')] || n;
export const natEn = (n = '') => (n === 'Saudi Citizen' ? 'Saudi' : n.replace('Expat - ', ''));
export const DEPT_AR: Record<string, string> = { Engineering: 'الهندسة', Sales: 'المبيعات', Marketing: 'التسويق', Finance: 'المالية', 'Human Resources': 'الموارد البشرية', Operations: 'العمليات', 'Customer Support': 'دعم العملاء', Product: 'المنتج' };
export const deptAr = (d = '') => DEPT_AR[d] || d;
