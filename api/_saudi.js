// Saudi-specific calculation helpers shared by API routes
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const OFF = 3 * 3600 * 1000; // Asia/Riyadh is UTC+3, no DST
export const riyadhDate = (d = new Date()) => new Date(d.getTime() + OFF).toISOString().slice(0, 10);
export const riyadhTime = (d = new Date()) => new Date(d.getTime() + OFF).toISOString().slice(11, 19);
export const riyadhMinutes = (d = new Date()) => { const r = new Date(d.getTime() + OFF); return r.getUTCHours() * 60 + r.getUTCMinutes(); };
export const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
export const DEFAULT_WORKDAYS = [0, 1, 2, 3, 4]; // Sun-Thu
export function workingDays(start, end, holidays = new Set(), workDays = DEFAULT_WORKDAYS) {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (workDays.includes(dow(d)) && !holidays.has(d)) n++;
  return n;
}
export const calendarDays = (s, e) => Math.round((Date.parse(e) - Date.parse(s)) / 864e5) + 1;
export function overlapDays(s1, e1, s2, e2) { const s = s1 > s2 ? s1 : s2; const e = e1 < e2 ? e1 : e2; return s <= e ? calendarDays(s, e) : 0; }
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export const GOSI_DEFAULT = { saudi_employee: 0.0975, saudi_employer: 0.1175, expat_employee: 0, expat_employer: 0.02, cap: 45000, floor: 1500 };
// GOSI: contribution base = basic + housing, floored at 1,500 and capped at 45,000 SAR
export function gosi(emp, cfg = {}) {
  const c = { ...GOSI_DEFAULT, ...(cfg || {}) };
  const raw = (Number(emp.basic_salary) || 0) + (Number(emp.housing_allowance) || 0);
  const base = Math.min(Math.max(raw, c.floor), c.cap);
  if (emp.is_saudi) return { base, capped: raw > c.cap, employee: r2(base * c.saudi_employee), employer: r2(base * c.saudi_employer) };
  return { base, capped: raw > c.cap, employee: r2(base * c.expat_employee), employer: r2(base * c.expat_employer) };
}
export const yearsOfService = (hire, at) => Math.max(0, (Date.parse(at) - Date.parse(hire)) / (365.25 * 864e5));
export const toMin = (hhmm) => { const [h, m] = String(hhmm || '08:00').split(':').map(Number); return h * 60 + (m || 0); };
export function monthsBack(endPeriod, n) {
  const [y, m] = endPeriod.split('-').map(Number); const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return out;
}
export const lastDayOf = (period) => { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
