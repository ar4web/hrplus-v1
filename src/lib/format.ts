export const r2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
export const num = (n: any, d = 0) => (n == null || isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const money = (n: any) => num(n, 2);
export function compactNum(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return num(n, a < 10 && a % 1 ? 1 : 0);
}
export function sar(n: any, lang = 'en', compact = false) {
  if (n == null || isNaN(Number(n))) return '—';
  const v = compact ? compactNum(Number(n)) : money(n);
  return lang === 'ar' ? `${v} ر.س` : `SAR ${v}`;
}
export function fmtVal(v: any, fmt: string, lang = 'en', compact = false) {
  if (v == null || v === '' || isNaN(Number(v))) return '—';
  const n = Number(v);
  switch (fmt) {
    case 'sar': return sar(n, lang, compact);
    case 'pct': return `${num(n, 1)}%`;
    case 'hrs': return `${num(n, 1)}${lang === 'ar' ? ' س' : 'h'}`;
    case 'days': return `${num(n, n % 1 ? 1 : 0)} ${lang === 'ar' ? 'يوم' : 'd'}`;
    default: return compact ? compactNum(n) : num(n, n % 1 ? 1 : 0);
  }
}
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const monthName = (m: number, lang = 'en', long = false) => (lang === 'ar' ? MONTHS_AR[m] : long ? new Date(2020, m, 1).toLocaleString('en-US', { month: 'long' }) : MONTHS_EN[m]);
export function xLabel(l: string, xfmt: string, lang = 'en') {
  if (!l) return '';
  if (xfmt === 'month' && /^\d{4}-\d{2}$/.test(l)) { const [y, m] = l.split('-').map(Number); return `${monthName(m - 1, lang)} ${String(y).slice(2)}`; }
  if (xfmt === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(l)) { const [, m, d] = l.split('-').map(Number); return `${d} ${monthName(m - 1, lang)}`; }
  return l;
}
export function fmtDate(iso: any, lang = 'en', opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  const d = typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00Z') : new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh', ...opts });
}
export const fmtTime = (iso: any) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }) : '—');
export const fmtDateTime = (iso: any, lang = 'en') => (iso ? `${fmtDate(iso, lang)} · ${fmtTime(iso)}` : '—');
export const riyadhToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
// Calendar helpers deliberately work in UTC on the bare YYYY-MM-DD part: mixing
// local-midnight parsing with UTC arithmetic is what produces off-by-one days in
// Riyadh (UTC+3) and across DST switches elsewhere.
const dateOnly = (iso: string) => String(iso || '').slice(0, 10);
export const addDays = (iso: string, n: number) => { const d = new Date(`${dateOnly(iso)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dow = (iso: string) => new Date(`${dateOnly(iso)}T00:00:00Z`).getUTCDay();
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${dateOnly(b)}T00:00:00Z`) - Date.parse(`${dateOnly(a)}T00:00:00Z`)) / 864e5);
export function timeAgo(iso: string, lang = 'en') {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
  const u: [number, string, string][] = [[86400 * 30, 'mo', 'شهر'], [86400, 'd', 'يوم'], [3600, 'h', 'ساعة'], [60, 'm', 'دقيقة'], [1, 's', 'ثانية']];
  for (const [sec, en, ar] of u) if (s >= sec) { const v = Math.floor(s / sec); return lang === 'ar' ? `منذ ${v} ${ar}` : `${v}${en} ago`; }
  return '';
}
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const TONES = ['brand', 'coral', 'sky', 'violet', 'mint', 'amber', 'rose', 'indigo'];
export const toneFor = (s = '') => TONES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
export function download(filename: string, content: BlobPart, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const periodLabel = (p: string, lang = 'en') => { if (!p) return '—'; const [y, m] = p.split('-').map(Number); return `${monthName(m - 1, lang, true)} ${y}`; };
