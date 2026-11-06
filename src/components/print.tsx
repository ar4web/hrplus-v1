// Print-safe documents rendered with inline styles so Print / PDF / Word / PNG exports look identical.
import { forwardRef, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { money, fmtDate, periodLabel } from '../lib/format';
import { natAr, natEn, deptAr } from '../lib/saudi';

const FONT = "'IBM Plex Sans Arabic','Readex Pro',Arial,sans-serif";
const INK = '#1d2127', MUTED = '#6b7079', LINE = '#e6e2da';

export function useQr(text?: string) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (!text) { setUrl(''); return; } QRCode.toDataURL(text, { margin: 1, width: 220, errorCorrectionLevel: 'M' }).then(setUrl).catch(() => setUrl('')); }, [text]);
  return url;
}

export function LetterheadTop({ c, compact = false }: any) {
  const brand = c?.primary_color || '#0e8a6a', accent = c?.secondary_color || '#e3a324';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: compact ? '0 0 10px' : '0 0 14px' }}>
        <div style={{ textAlign: 'left', direction: 'ltr', flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: brand }}>{c?.legal_name_en}</div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>CR {c?.cr_number} · VAT {c?.vat_number}</div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {c?.logo_url ? <img src={c.logo_url} alt="" crossOrigin="anonymous" style={{ height: 52, maxWidth: 140, objectFit: 'contain' }} /> : (
            <div style={{ width: 52, height: 52, background: brand, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 18 }}>{(c?.legal_name_en || 'HR').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</div>
          )}
        </div>
        <div style={{ textAlign: 'right', direction: 'rtl', flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: brand }}>{c?.legal_name_ar}</div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>س.ت {c?.cr_number} · الرقم الضريبي {c?.vat_number}</div>
        </div>
      </div>
      <div style={{ display: 'flex', height: 4 }}><div style={{ flex: 4, background: brand }} /><div style={{ flex: 1, background: accent }} /></div>
    </div>
  );
}
export function LetterheadFooter({ c }: any) {
  return (
    <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 9, color: MUTED }}>
      <div style={{ direction: 'ltr', textAlign: 'left' }}>{c?.address_en}<br />{c?.phone} · {c?.email} · {c?.website}</div>
      <div style={{ direction: 'rtl', textAlign: 'right' }}>{c?.address_ar}<br />{c?.branch_name}</div>
    </div>
  );
}

const page: any = { width: 794, minHeight: 1123, background: '#fff', color: INK, fontFamily: FONT, padding: '40px 48px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontSize: 12, lineHeight: 1.6 };

export const DocPaper = forwardRef<HTMLDivElement, any>(function DocPaper({ c, doc, lang, refNo, date }, ref) {
  const brand = c?.primary_color || '#0e8a6a';
  const enBlock = (
    <div style={{ direction: 'ltr', textAlign: 'left', flex: 1 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: brand, marginBottom: 10 }}>{doc.titleEn}</div>
      {doc.en.map((p: string, i: number) => <p key={i} style={{ margin: '0 0 9px', whiteSpace: 'pre-wrap' }}>{p}</p>)}
      {doc.tableEn && <SimpleTable rows={doc.tableEn} />}
    </div>
  );
  const arBlock = (
    <div style={{ direction: 'rtl', textAlign: 'right', flex: 1 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: brand, marginBottom: 10 }}>{doc.titleAr}</div>
      {doc.ar.map((p: string, i: number) => <p key={i} style={{ margin: '0 0 9px', whiteSpace: 'pre-wrap' }}>{p}</p>)}
      {doc.tableAr && <SimpleTable rows={doc.tableAr} rtl />}
    </div>
  );
  return (
    <div ref={ref} style={page}>
      <LetterheadTop c={c} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: MUTED, margin: '16px 0 18px' }}>
        <span style={{ direction: 'ltr' }}>Ref: {refNo} · Date: {fmtDate(date, 'en')}</span>
        <span style={{ direction: 'rtl' }}>المرجع: {refNo} · التاريخ: {fmtDate(date, 'ar')}</span>
      </div>
      {lang === 'both' ? (
        <div style={{ display: 'flex', gap: 28 }}>{enBlock}<div style={{ width: 1, background: LINE }} />{arBlock}</div>
      ) : lang === 'ar' ? arBlock : enBlock}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 36, gap: 16 }}>
        {lang !== 'ar' && <Sign label="Human Resources Manager" name={doc.signatory} />}
        <div style={{ width: 92, height: 92, border: `2px dashed ${brand}66`, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 9, color: `${brand}`, textAlign: 'center', opacity: 0.8 }}>Company<br />Stamp<br />ختم الشركة</div>
        {lang !== 'en' && <Sign label="مدير الموارد البشرية" name={doc.signatoryAr || doc.signatory} rtl />}
      </div>
      <LetterheadFooter c={c} />
    </div>
  );
});
function Sign({ label, name, rtl }: any) {
  return <div style={{ direction: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left', minWidth: 180 }}><div style={{ borderBottom: `1px solid ${INK}`, height: 34, marginBottom: 4 }} /><div style={{ fontWeight: 600 }}>{name}</div><div style={{ fontSize: 10, color: MUTED }}>{label}</div></div>;
}
function SimpleTable({ rows, rtl }: any) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '6px 0 12px', direction: rtl ? 'rtl' : 'ltr', fontSize: 11 }}>
      <tbody>{rows.map((r: any, i: number) => <tr key={i} style={{ background: i % 2 ? '#faf8f5' : '#fff', fontWeight: r[2] ? 700 : 400 }}><td style={{ padding: '5px 8px', border: `1px solid ${LINE}` }}>{r[0]}</td><td style={{ padding: '5px 8px', border: `1px solid ${LINE}`, textAlign: rtl ? 'left' : 'right', fontVariantNumeric: 'tabular-nums' }}>{r[1]}</td></tr>)}</tbody>
    </table>
  );
}

/* ---------------- Payslip ---------------- */
export const PayslipDoc = forwardRef<HTMLDivElement, any>(function PayslipDoc({ c, s }, ref) {
  const e = s.employees || {};
  const brand = c?.primary_color || '#0e8a6a';
  const earn = [['Basic salary', 'الراتب الأساسي', s.basic], ['Housing allowance', 'بدل السكن', s.housing], ['Transport allowance', 'بدل النقل', s.transport], ['Other allowances', 'بدلات أخرى', s.other_allowance], ['Overtime (×1.5)', 'العمل الإضافي (×1.5)', s.overtime], ['Bonus', 'مكافأة', s.bonus]].filter((r) => Number(r[2]));
  const ded = [[`GOSI (employee ${e.is_saudi ? '9.75%' : '0%'})`, 'التأمينات الاجتماعية', s.gosi_employee], ['Other deductions (unpaid leave)', 'خصومات أخرى', s.deductions]];
  const cell: any = { padding: '6px 10px', borderBottom: `1px solid ${LINE}` };
  const info = [['Employee', 'الموظف', `${e.full_name} · ${s.employee_id}`], ['Job title', 'المسمى الوظيفي', `${e.job_title} · ${e.department}`], [e.is_saudi ? 'National ID' : 'Iqama no.', e.is_saudi ? 'الهوية الوطنية' : 'رقم الإقامة', e.iqama_number], ['Nationality', 'الجنسية', `${natEn(e.nationality)} / ${natAr(e.nationality)}`], ['Bank / IBAN', 'البنك / الآيبان', `${e.bank_code || ''} · ${e.iban || ''}`], ['Payment', 'طريقة الدفع', s.payment_method]];
  return (
    <div ref={ref} style={page}>
      <LetterheadTop c={c} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 14px' }}>
        <div><div style={{ fontSize: 20, fontWeight: 700 }}>Payslip</div><div style={{ color: MUTED }}>{periodLabel(s.period, 'en')}</div></div>
        <div style={{ background: `${brand}14`, color: brand, padding: '6px 12px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{s.status}</div>
        <div style={{ direction: 'rtl', textAlign: 'right' }}><div style={{ fontSize: 20, fontWeight: 700 }}>قسيمة الراتب</div><div style={{ color: MUTED }}>{periodLabel(s.period, 'ar')}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, background: '#faf8f5', padding: 10, marginBottom: 16 }}>
        {info.map((r, i) => <div key={i} style={{ padding: '4px 6px' }}><div style={{ fontSize: 9.5, color: MUTED }}>{r[0]} · {r[1]}</div><div style={{ fontWeight: 600 }}>{r[2] || '—'}</div></div>)}
      </div>
      <div style={{ display: 'flex', gap: 18 }}>
        {[['Earnings', 'الاستحقاقات', earn, s.gross, '#0fa89a'], ['Deductions', 'الاستقطاعات', ded, Number(s.gosi_employee) + Number(s.deductions), '#ec5f4f']].map(([t, ta, rows, tot, col]: any, k) => (
          <table key={k} style={{ flex: 1, borderCollapse: 'collapse', alignSelf: 'flex-start' }}>
            <thead><tr style={{ background: col, color: '#fff' }}><th style={{ ...cell, textAlign: 'left' }}>{t}</th><th style={{ ...cell, textAlign: 'right', direction: 'rtl' }}>{ta}</th></tr></thead>
            <tbody>
              {rows.map((r: any, i: number) => <tr key={i}><td style={cell}>{r[0]}<div style={{ fontSize: 9.5, color: MUTED, direction: 'rtl', textAlign: 'left' }}>{r[1]}</div></td><td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r[2])}</td></tr>)}
              <tr style={{ fontWeight: 700 }}><td style={cell}>Total · المجموع</td><td style={{ ...cell, textAlign: 'right' }}>{money(tot)}</td></tr>
            </tbody>
          </table>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: brand, color: '#fff', padding: '14px 18px', marginTop: 18 }}>
        <div>Net pay · صافي الراتب</div><div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>SAR {money(s.net)}</div>
      </div>
      <div style={{ fontSize: 10, color: MUTED, marginTop: 14 }}>
        Employer GOSI contribution (not deducted): SAR {money(s.gosi_employer)} · contribution base SAR {money(s.gosi_base)} (basic + housing, capped at SAR 45,000).<br />
        <span style={{ direction: 'rtl', display: 'block', textAlign: 'right' }}>حصة صاحب العمل في التأمينات: {money(s.gosi_employer)} ر.س — الراتب الخاضع {money(s.gosi_base)} ر.س (الحد الأعلى 45,000 ر.س). تم الدفع عبر نظام حماية الأجور.</span>
      </div>
      <LetterheadFooter c={c} />
    </div>
  );
});

/* ---------------- ZATCA invoice (3 designs) ---------------- */
export const InvoiceDoc = forwardRef<HTMLDivElement, any>(function InvoiceDoc({ c, inv, design = 'classic' }, ref) {
  const qr = useQr(inv?.qr);
  const brand = c?.primary_color || '#0e8a6a', accent = c?.secondary_color || '#e3a324';
  const b = inv.buyer || {};
  const b2b = inv.type === 'B2B';
  const title = b2b ? ['Tax Invoice', 'فاتورة ضريبية'] : ['Simplified Tax Invoice', 'فاتورة ضريبية مبسطة'];
  const minimal = design === 'minimal', band = design === 'band';
  const th: any = { padding: '7px 8px', fontSize: 9.5, textAlign: 'left', fontWeight: 600, background: band ? brand : minimal ? 'transparent' : '#f4f2ee', color: band ? '#fff' : INK, borderBottom: minimal ? `1.5px solid ${INK}` : 'none' };
  const td: any = { padding: '7px 8px', borderBottom: `1px solid ${LINE}`, fontVariantNumeric: 'tabular-nums' };
  const party = (label: string[], p: any, seller = false) => (
    <div style={{ flex: 1, background: minimal ? 'transparent' : band ? `${brand}0d` : '#faf8f5', padding: minimal ? 0 : 12, borderTop: band ? `3px solid ${seller ? brand : accent}` : 'none' }}>
      <div style={{ fontSize: 9.5, color: band ? (seller ? brand : '#a86f00') : MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', justifyContent: 'space-between' }}><span>{label[0]}</span><span>{label[1]}</span></div>
      <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{p.name}</div>
      {p.name_ar && <div style={{ direction: 'rtl', textAlign: 'right', fontWeight: 600 }}>{p.name_ar}</div>}
      {p.vat_number && <div style={{ fontSize: 10.5 }}>VAT · الرقم الضريبي: <b>{p.vat_number}</b></div>}
      {p.cr_number && <div style={{ fontSize: 10.5 }}>CR · السجل التجاري: {p.cr_number}</div>}
      {(p.address || p.city) && <div style={{ fontSize: 10.5, color: MUTED }}>{[p.address, p.city].filter(Boolean).join(', ')}</div>}
      {p.phone && <div style={{ fontSize: 10.5, color: MUTED }}>{p.phone}{p.email ? ` · ${p.email}` : ''}</div>}
    </div>
  );
  const seller = { name: c?.legal_name_en, name_ar: c?.legal_name_ar, vat_number: c?.vat_number, cr_number: c?.cr_number, address: c?.address_en, phone: c?.phone, email: c?.email };
  return (
    <div ref={ref} style={{ ...page, padding: band ? 0 : '40px 48px' }}>
      {band ? (
        <div style={{ background: brand, color: '#fff', padding: '28px 48px 22px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {c?.logo_url ? <img src={c.logo_url} alt="" crossOrigin="anonymous" style={{ height: 46, background: '#fff', padding: 4 }} /> : <div style={{ width: 46, height: 46, background: accent, color: '#2a1d00', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{(c?.legal_name_en || 'HR').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</div>}
              <div><div style={{ fontWeight: 700, fontSize: 15 }}>{c?.legal_name_en}</div><div style={{ direction: 'rtl', fontSize: 13, opacity: 0.9 }}>{c?.legal_name_ar}</div></div>
            </div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 22, fontWeight: 800 }}>{title[0]}</div><div style={{ fontSize: 18, fontWeight: 700, direction: 'rtl' }}>{title[1]}</div></div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: -6, height: 6, background: accent }} />
        </div>
      ) : minimal ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${brand}`, paddingBottom: 14 }}>
          <div><div style={{ fontSize: 26, fontWeight: 300, letterSpacing: -0.5 }}>{title[0]}</div><div style={{ fontSize: 18, fontWeight: 500, direction: 'rtl', textAlign: 'left' }}>{title[1]}</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 700 }}>{c?.legal_name_en}</div><div style={{ direction: 'rtl' }}>{c?.legal_name_ar}</div><div style={{ fontSize: 10, color: MUTED }}>VAT {c?.vat_number}</div></div>
        </div>
      ) : (
        <>
          <LetterheadTop c={c} compact />
          <div style={{ textAlign: 'center', margin: '16px 0 4px' }}><span style={{ display: 'inline-block', border: `2px solid ${brand}`, color: brand, padding: '6px 22px', fontWeight: 700, fontSize: 15 }}>{title[0]} · {title[1]}</span></div>
        </>
      )}
      <div style={{ padding: band ? '26px 48px 40px' : 0, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, margin: '14px 0', fontSize: 10.5 }}>
          {[['Invoice no.', 'رقم الفاتورة', inv.number], ['Issue date', 'تاريخ الإصدار', `${inv.issue_date} ${String(inv.issue_time || '').slice(0, 5)}`], ['Supply date', 'تاريخ التوريد', inv.issue_date], ['Due date', 'تاريخ الاستحقاق', inv.due_date]].map((r, i) => (
            <div key={i} style={{ background: minimal ? 'transparent' : '#faf8f5', padding: minimal ? '0' : '6px 8px' }}><div style={{ color: MUTED, fontSize: 9 }}>{r[0]} · {r[1]}</div><div style={{ fontWeight: 700 }}>{r[2]}</div></div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
          {party(['Seller', 'البائع'], seller, true)}
          {party(['Buyer', 'المشتري'], b)}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr>
            {[['#', ''], ['Description', 'الوصف'], ['Qty', 'الكمية'], ['Unit price', 'سعر الوحدة'], ['Taxable', 'المبلغ الخاضع'], ['VAT 15%', 'الضريبة'], ['Total', 'الإجمالي']].map((h, i) => <th key={i} style={{ ...th, textAlign: i > 1 ? 'right' : 'left' }}>{h[0]}<div style={{ fontWeight: 500, opacity: 0.85 }}>{h[1]}</div></th>)}
          </tr></thead>
          <tbody>
            {(inv.lines || []).map((l: any, i: number) => (
              <tr key={i}><td style={td}>{i + 1}</td><td style={{ ...td, fontVariantNumeric: 'normal' }}>{l.description}</td><td style={{ ...td, textAlign: 'right' }}>{money(l.qty).replace(/\.00$/, '')}</td><td style={{ ...td, textAlign: 'right' }}>{money(l.unit_price)}</td><td style={{ ...td, textAlign: 'right' }}>{money(l.line_total)}</td><td style={{ ...td, textAlign: 'right' }}>{money(l.vat_amount)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{money(Number(l.line_total) + Number(l.vat_amount))}</td></tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 18, gap: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {qr ? <img src={qr} alt="ZATCA QR" style={{ width: 128, height: 128 }} /> : <div style={{ width: 128, height: 128, background: '#f4f2ee' }} />}
            <div style={{ fontSize: 9, color: MUTED, maxWidth: 230, wordBreak: 'break-all' }}>
              <div style={{ fontWeight: 700, color: INK, fontSize: 10 }}>ZATCA e-invoice · الفاتورة الإلكترونية</div>
              UUID: {inv.uuid}<br />ICV: {inv.icv} · {b2b ? 'Standard (0100000)' : 'Simplified (0200000)'}<br />Hash: {String(inv.hash || '').slice(0, 44)}<br />PIH: {String(inv.prev_hash || '').slice(0, 24)}…
            </div>
          </div>
          <table style={{ borderCollapse: 'collapse', minWidth: 260, fontSize: 11.5 }}>
            <tbody>
              <tr><td style={td}>Total excl. VAT · الإجمالي غير شامل الضريبة</td><td style={{ ...td, textAlign: 'right' }}>{money(inv.subtotal)}</td></tr>
              <tr><td style={td}>VAT 15% · ضريبة القيمة المضافة</td><td style={{ ...td, textAlign: 'right' }}>{money(inv.vat)}</td></tr>
              <tr style={{ background: minimal ? 'transparent' : brand, color: minimal ? INK : '#fff', fontWeight: 700, fontSize: 13 }}><td style={{ ...td, borderBottom: minimal ? `2px solid ${INK}` : 'none' }}>Total · الإجمالي (SAR)</td><td style={{ ...td, textAlign: 'right', borderBottom: minimal ? `2px solid ${INK}` : 'none' }}>{money(inv.total)}</td></tr>
            </tbody>
          </table>
        </div>
        {inv.notes && <div style={{ marginTop: 16, fontSize: 10.5, color: MUTED }}><b style={{ color: INK }}>Notes · ملاحظات:</b> {inv.notes}</div>}
        {inv.status === 'void' && <div style={{ marginTop: 16, color: '#ec5f4f', fontWeight: 800, fontSize: 18 }}>VOID · ملغاة</div>}
        <LetterheadFooter c={c} />
      </div>
    </div>
  );
});

export { deptAr };
