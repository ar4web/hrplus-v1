import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Readex+Pro:wght@400;500;600;700&display=swap';

async function snapshot(el: HTMLElement) {
  return toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true, skipFonts: false }).catch(() => toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true }));
}
function trigger(url: string, name: string) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

export async function exportPng(el: HTMLElement, name: string) { trigger(await snapshot(el), `${name}.png`); }

export async function exportPdf(el: HTMLElement, name: string) {
  const url = await snapshot(el);
  const img = new Image(); img.src = url; await img.decode();
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pw = 210, ph = 297;
  const h = (img.height * pw) / img.width;
  if (h <= ph + 1) pdf.addImage(url, 'PNG', 0, 0, pw, h);
  else {
    // paginate tall content
    const pagePx = Math.floor((img.width * ph) / pw);
    const canvas = document.createElement('canvas'); canvas.width = img.width; const ctx = canvas.getContext('2d')!;
    for (let y = 0, i = 0; y < img.height; y += pagePx, i++) {
      const slice = Math.min(pagePx, img.height - y); canvas.height = slice;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, slice); ctx.drawImage(img, 0, y, img.width, slice, 0, 0, img.width, slice);
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pw, (slice * pw) / img.width);
    }
  }
  pdf.save(`${name}.pdf`);
}

export function exportWord(el: HTMLElement, name: string) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${name}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]--><style>@page{size:A4;margin:1.5cm}body{font-family:'Arial',sans-serif}table{border-collapse:collapse}</style></head><body>${el.outerHTML}</body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob); trigger(url, `${name}.doc`); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function printEl(el: HTMLElement, title = 'HRplus') {
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="${FONT_LINK}"><style>@page{size:A4;margin:0}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${el.outerHTML}</body></html>`);
  doc.close();
  const go = () => { iframe.contentWindow!.focus(); iframe.contentWindow!.print(); setTimeout(() => iframe.remove(), 1500); };
  setTimeout(go, 700);
}
