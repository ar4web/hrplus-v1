import { useMemo, useRef, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { fmtVal, xLabel } from '../lib/format';

export const PALETTE = ['var(--brand)', 'var(--c-sky)', 'var(--c-coral)', 'var(--c-violet)', 'var(--c-amber)', 'var(--c-mint)', 'var(--c-rose)', 'var(--c-indigo)', 'var(--brand-2)'];

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function Tip({ x, y, title, rows, W }: any) {
  const left = `${Math.min(Math.max((x / W) * 100, 12), 88)}%`;
  return (
    <div className="absolute z-10 pointer-events-none -translate-x-1/2 bg-ink text-bg dark:bg-sunken dark:text-ink text-xs px-2 py-1.5 shadow-lg min-w-[110px]" style={{ left, top: Math.max(0, y - 10) }}>
      <div className="font-semibold mb-0.5">{title}</div>
      {rows.map((r: any, i: number) => (<div key={i} className="flex items-center gap-1.5 num"><span className="w-2 h-2 inline-block" style={{ background: r.color }} />{r.name}: <b>{r.value}</b></div>))}
    </div>
  );
}

export function LineChart({ labels = [], series = [], fmt = 'num', xfmt = 'text', height = 210 }: any) {
  const { lang } = usePrefs();
  const W = 640, H = height, pl = 56, pr = 14, pt = 12, pb = 26;
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const vals = series.flatMap((s: any) => s.data).filter((v: any) => v != null && !isNaN(v));
  const rawMax = Math.max(1, ...vals);
  const rawMin = vals.length ? Math.min(...vals) : 0;
  const min = fmt === 'pct' ? Math.max(0, Math.floor((rawMin - 5) / 10) * 10) : 0;
  const max = fmt === 'pct' ? Math.min(100, Math.max(min + 10, Math.ceil(rawMax / 5) * 5)) : niceMax(rawMax);
  const n = labels.length;
  const x = (i: number) => pl + (n <= 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (n - 1));
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - min) / (max - min || 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  const step = Math.max(1, Math.ceil(n / 7));
  const paths = series.map((s: any) => {
    let d = ''; let pen = false;
    s.data.forEach((v: any, i: number) => { if (v == null || isNaN(v)) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true; });
    return d;
  });
  const area = paths[0] && series[0]?.data.every((v: any) => v != null) && n > 1 ? `${paths[0]} L${x(n - 1)},${H - pb} L${x(0)},${H - pb} Z` : '';
  const onMove = (e: any) => {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pl) / (W - pl - pr)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  if (!n) return <div className="h-40 grid place-items-center text-sm text-muted">{lang === 'ar' ? 'لا توجد بيانات لهذه الفترة' : 'No data for this period'}</div>;
  return (
    <div className="relative" dir="ltr">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={series.map((s: any) => s.label).join(', ')}>
        <defs><linearGradient id="lg-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--brand)" stopOpacity="0" /></linearGradient></defs>
        {ticks.map((t, i) => (<g key={i}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={i ? '3 4' : ''} /><text x={pl - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{fmtVal(t, fmt, lang, true)}</text></g>))}
        {labels.map((l: string, i: number) => (i % step === 0 || i === n - 1) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{xLabel(l, xfmt, lang)}</text>)}
        {area && <path d={area} fill="url(#lg-area)" />}
        {series.map((s: any, si: number) => <path key={si} d={paths[si]} fill="none" stroke={s.color || PALETTE[si]} strokeWidth={s.dashed ? 1.6 : 2.2} strokeDasharray={s.dashed ? '5 5' : ''} strokeLinejoin="round" strokeLinecap="round" opacity={s.dashed ? 0.75 : 1} />)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pt} y2={H - pb} stroke="var(--muted)" strokeOpacity="0.4" />}
        {hover != null && series.map((s: any, si: number) => s.data[hover] != null && <circle key={si} cx={x(hover)} cy={y(s.data[hover])} r="4" fill="var(--surface)" stroke={s.color || PALETTE[si]} strokeWidth="2" />)}
        {n <= 40 && series.filter((s: any) => !s.dashed).map((s: any, si: number) => s.data.map((v: any, i: number) => v != null && <circle key={`${si}-${i}`} cx={x(i)} cy={y(v)} r="2" fill={s.color || PALETTE[si]} />))}
      </svg>
      {hover != null && <Tip W={W} x={x(hover)} y={0} title={xLabel(labels[hover], xfmt, lang)} rows={series.map((s: any, si: number) => ({ name: s.label, color: s.color || PALETTE[si], value: fmtVal(s.data[hover], fmt, lang) }))} />}
    </div>
  );
}

export function BarChart({ labels = [], series = [], fmt = 'num', xfmt = 'text', height = 210 }: any) {
  const { lang } = usePrefs();
  const W = 640, H = height, pl = 56, pr = 10, pt = 12, pb = 30;
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const max = niceMax(Math.max(1, ...series.flatMap((s: any) => s.data).filter((v: any) => v != null)));
  const band = (W - pl - pr) / Math.max(1, n);
  const gap = Math.min(10, band * 0.25);
  const bw = Math.max(2, (band - gap) / Math.max(1, series.length));
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  const step = Math.max(1, Math.ceil(n / 8));
  if (!n) return <div className="h-40 grid place-items-center text-sm text-muted">{lang === 'ar' ? 'لا توجد بيانات' : 'No data for this period'}</div>;
  return (
    <div className="relative" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseLeave={() => setHover(null)} role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (<g key={i}><line x1={pl} x2={W - pr} y1={y(t * max)} y2={y(t * max)} stroke="var(--line)" strokeDasharray={i ? '3 4' : ''} /><text x={pl - 6} y={y(t * max) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{fmtVal(t * max, fmt, lang, true)}</text></g>))}
        {labels.map((l: string, i: number) => (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <rect x={pl + i * band} y={pt} width={band} height={H - pt - pb} fill={hover === i ? 'var(--brand)' : 'transparent'} opacity="0.05" />
            {series.map((s: any, si: number) => { const v = s.data[i] || 0; const color = s.color || (series.length === 1 && n <= 9 ? PALETTE[i % PALETTE.length] : PALETTE[si]); return <rect key={si} x={pl + i * band + gap / 2 + si * bw} y={y(v)} width={Math.max(1, bw - 1)} height={Math.max(0, H - pb - y(v))} fill={color} opacity={si > 0 && s.dashed !== false && series.length > 1 && si === series.length - 1 && /prev|السابق/i.test(s.label || '') ? 0.45 : 1} />; })}
            {(i % step === 0) && <text x={pl + i * band + band / 2} y={H - 10} textAnchor="middle" fontSize="10" fill="var(--muted)">{String(xLabel(l, xfmt, lang)).slice(0, 16)}</text>}
          </g>
        ))}
      </svg>
      {hover != null && <Tip W={W} x={pl + hover * band + band / 2} y={0} title={xLabel(labels[hover], xfmt, lang)} rows={series.map((s: any, si: number) => ({ name: s.label, color: s.color || (series.length === 1 && n <= 9 ? PALETTE[hover % PALETTE.length] : PALETTE[si]), value: fmtVal(s.data[hover], fmt, lang) }))} />}
    </div>
  );
}

export function HBar({ labels = [], values = [], fmt = 'num', max: maxIn }: any) {
  const { lang } = usePrefs();
  const rows = labels.map((l: string, i: number) => ({ l, v: Number(values[i]) || 0, c: PALETTE[i % PALETTE.length] })).sort((a: any, b: any) => b.v - a.v);
  const max = maxIn || Math.max(1, ...rows.map((r: any) => r.v));
  if (!rows.length) return <div className="h-32 grid place-items-center text-sm text-muted">{lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</div>;
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r: any, i: number) => (
        <li key={i} className="grid grid-cols-[minmax(80px,38%)_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-muted" title={r.l}>{r.l}</span>
          <span className="h-4 bg-ink/6 relative"><span className="absolute inset-y-0 start-0 transition-all duration-700" style={{ width: `${(r.v / max) * 100}%`, background: r.c }} /></span>
          <span className="num font-semibold w-16 text-end">{fmtVal(r.v, fmt, lang, true)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Donut({ labels = [], values = [], fmt = 'num', size = 150, center }: any) {
  const { lang } = usePrefs();
  const total = values.reduce((s: number, v: any) => s + (Number(v) || 0), 0);
  const [hover, setHover] = useState<number | null>(null);
  const R = 52, C = 2 * Math.PI * R;
  const segs = useMemo(() => { const lens = values.map((v: any) => (total ? ((Number(v) || 0) / total) * C : 0)); return lens.map((len: number, i: number) => ({ len, off: lens.slice(0, i).reduce((a: number, b: number) => a + b, 0), color: PALETTE[i % PALETTE.length] })); }, [values, total, C]);
  if (!total) return <div className="h-32 grid place-items-center text-sm text-muted">{lang === 'ar' ? 'لا توجد بيانات' : 'No data for this period'}</div>;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 140 140" width={size} height={size} className="shrink-0 -rotate-90" role="img">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--sunken)" strokeWidth="18" />
        {segs.map((s: any, i: number) => <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth={hover === i ? 22 : 18} strokeDasharray={`${Math.max(0, s.len - 1.5)} ${C}`} strokeDashoffset={-s.off} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ transition: 'stroke-width .15s' }} />)}
        <g className="rotate-90" style={{ transformOrigin: '70px 70px' }}>
          <text x="70" y="66" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--ink)" className="num">{hover != null ? fmtVal(values[hover], fmt, lang, true) : center ?? fmtVal(total, fmt, lang, true)}</text>
          <text x="70" y="84" textAnchor="middle" fontSize="9" fill="var(--muted)">{hover != null ? `${((values[hover] / total) * 100).toFixed(0)}%` : lang === 'ar' ? 'الإجمالي' : 'Total'}</text>
        </g>
      </svg>
      <ul className="flex-1 min-w-[140px] flex flex-col gap-1 text-xs">
        {labels.map((l: string, i: number) => (
          <li key={i} className={`flex items-center gap-2 px-1 ${hover === i ? 'bg-ink/5' : ''}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="w-2.5 h-2.5 shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="truncate flex-1">{l}</span>
            <span className="num font-semibold">{fmtVal(values[i], fmt, lang, true)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Ring({ value, max, color = 'var(--brand)', size = 54, label }: any) {
  const R = 22, C = 2 * Math.PI * R; const pct = max ? Math.min(1, value / max) : 0;
  return (
    <svg viewBox="0 0 54 54" width={size} height={size} role="img" aria-label={label}>
      <circle cx="27" cy="27" r={R} fill="none" stroke="var(--sunken)" strokeWidth="6" />
      <circle cx="27" cy="27" r={R} fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${pct * C} ${C}`} transform="rotate(-90 27 27)" style={{ transition: 'stroke-dasharray .8s' }} />
      <text x="27" y="31" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--ink)">{value ?? '—'}</text>
    </svg>
  );
}
