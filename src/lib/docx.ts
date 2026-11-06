// Real .docx (OOXML) writer, dependency-free.
//
// The previous implementation wrapped the element's HTML in an
// `application/msword` blob and named it `.doc`. Word opens that but warns that
// the file format doesn't match the extension, and it isn't a Word document at
// all (it is HTML). Here we generate an actual OOXML package: a store-only ZIP
// containing [Content_Types].xml, _rels/.rels, word/document.xml,
// word/styles.xml and word/_rels/document.xml.rels.
//
// Kept separate from exporters.ts so the conversion can be unit-tested in Node
// (see dev/unit/docx-test.mjs) without a browser DOM.

export type Run = { text: string; bold?: boolean; italic?: boolean; br?: boolean };
export type Block =
  | { kind: 'p'; style?: string; runs: Run[] }
  | { kind: 'table'; rows: { cells: Run[][] }[] };

const esc = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* ------------------------------ DOM → blocks ------------------------------ */

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const BLOCK_STYLES: Record<string, string> = { h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', h4: 'Heading4', h5: 'Heading5', h6: 'Heading6' };

function inlineRuns(node: any, fmt: { bold?: boolean; italic?: boolean } = {}, out: Run[] = []): Run[] {
  if (!node) return out;
  if (node.nodeType === TEXT_NODE) {
    const text = String(node.nodeValue ?? '');
    if (text) out.push({ ...fmt, text });
    return out;
  }
  if (node.nodeType !== ELEMENT_NODE) return out;
  const tag = String(node.nodeName || '').toLowerCase();
  if (tag === 'br') { out.push({ text: '', br: true }); return out; }
  if (tag === 'script' || tag === 'style' || tag === 'svg' || tag === 'img') return out;
  const next = { bold: fmt.bold || tag === 'b' || tag === 'strong', italic: fmt.italic || tag === 'i' || tag === 'em' };
  for (const child of Array.from(node.childNodes || [])) inlineRuns(child, next, out);
  return out;
}

/** Convert a rendered element into the block list the OOXML writer consumes. */
export function domToBlocks(root: any): Block[] {
  const blocks: Block[] = [];
  const walk = (node: any, style?: string) => {
    if (!node) return;
    if (node.nodeType === TEXT_NODE) {
      const text = String(node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
      if (text) blocks.push({ kind: 'p', runs: [{ text }] });
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;
    const tag = String(node.nodeName || '').toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'svg') return;

    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll ? node.querySelectorAll('tr') : []) as any[];
      const body = rows.length ? rows : Array.from(node.childNodes || []).filter((n: any) => String(n.nodeName).toLowerCase() === 'tr');
      blocks.push({
        kind: 'table',
        rows: body.map((tr: any) => ({
          cells: Array.from((tr.childNodes || []) as any[])
            .filter((td: any) => ['td', 'th'].includes(String(td.nodeName || '').toLowerCase()))
            .map((td: any) => inlineRuns(td, { bold: String(td.nodeName).toLowerCase() === 'th' })),
        })),
      });
      return;
    }

    if (BLOCK_STYLES[tag]) {
      const runs = inlineRuns(node);
      if (runs.length) blocks.push({ kind: 'p', style: BLOCK_STYLES[tag], runs });
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from((node.childNodes || []) as any[]).filter((n: any) => String(n.nodeName || '').toLowerCase() === 'li');
      items.forEach((li, i) => {
        const runs = inlineRuns(li);
        if (!runs.length) return;
        blocks.push({ kind: 'p', runs: [{ text: tag === 'ol' ? `${i + 1}. ` : '• ' }, ...runs] });
      });
      return;
    }

    const isBlockContainer = ['p', 'div', 'section', 'article', 'header', 'footer', 'li', 'blockquote', 'td', 'th'].includes(tag);
    if (isBlockContainer) {
      const elementChildren = Array.from((node.childNodes || []) as any[]).filter((n: any) => n.nodeType === ELEMENT_NODE);
      const hasNestedBlocks = elementChildren.some((n: any) =>
        ['p', 'div', 'table', 'ul', 'ol', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(String(n.nodeName || '').toLowerCase()),
      );
      if (hasNestedBlocks) {
        for (const child of Array.from(node.childNodes || []) as any[]) {
          if (child.nodeType === TEXT_NODE) {
            const text = String(child.nodeValue ?? '').replace(/\s+/g, ' ').trim();
            if (text) blocks.push({ kind: 'p', runs: [{ text }] });
          } else walk(child, style);
        }
        return;
      }
      const runs = inlineRuns(node);
      if (runs.length) blocks.push({ kind: 'p', runs });
      return;
    }

    for (const child of Array.from(node.childNodes || []) as any[]) walk(child, style);
  };
  walk(root);
  return blocks;
}

/* ------------------------------ blocks → XML ------------------------------ */

function runXml(r: Run): string {
  if (r.br) return '<w:r><w:br/></w:r>';
  const props = r.bold || r.italic ? `<w:rPr>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}</w:rPr>` : '';
  // preserve leading/trailing spaces so Arabic/English spacing survives
  return `<w:r>${props}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
}

function cellXml(runs: Run[], header: boolean): string {
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${
    `<w:p><w:pPr>${header ? '<w:rPr><w:b/></w:rPr>' : ''}</w:pPr>${runs.length ? runs.map(runXml).join('') : ''}</w:p>`
  }</w:tc>`;
}

export function blocksToDocumentXml(blocks: Block[]): string {
  const body = blocks
    .map((b) => {
      if (b.kind === 'table') {
        const rows = b.rows
          .map((row, ri) => `<w:tr>${row.cells.map((c) => cellXml(c, ri === 0)).join('')}</w:tr>`)
          .join('');
        return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
          .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`)
          .join('')}</w:tblBorders></w:tblPr>${rows}</w:tbl><w:p/>`;
      }
      const style = b.style ? `<w:pStyle w:val="${b.style}"/>` : '';
      return `<w:p><w:pPr>${style}</w:pPr>${b.runs.map(runXml).join('')}</w:p>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body>
</w:document>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>
${[1, 2, 3, 4, 5, 6]
  .map(
    (n) =>
      `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="${360 - n * 40}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${36 - n * 2}"/><w:szCs w:val="${36 - n * 2}"/></w:rPr></w:style>`,
  )
  .join('')}
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>
</w:styles>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/* ------------------------------- ZIP writer ------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Build a store-only (uncompressed) ZIP — valid for OOXML, no dependencies. */
export function zip(files: { name: string; data: string | Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const data = typeof file.data === 'string' ? enc.encode(file.data) : file.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);          // version needed
    lv.setUint16(6, 0x0800, true);      // UTF-8 filenames
    lv.setUint16(8, 0, true);           // method: store
    lv.setUint16(10, 0, true);          // time
    lv.setUint16(12, 0x21, true);       // date (1996-01-01, fixed for reproducible output)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    locals.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);          // version made by
    cv.setUint16(6, 20, true);          // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);          // extra
    cv.setUint16(32, 0, true);          // comment
    cv.setUint16(34, 0, true);          // disk
    cv.setUint16(36, 0, true);          // internal attrs
    cv.setUint32(38, 0, true);          // external attrs
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

/** Assemble the .docx byte stream for the given blocks. */
export function buildDocxBytes(blocks: Block[]): Uint8Array {
  return zip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: blocksToDocumentXml(blocks) },
    { name: 'word/styles.xml', data: STYLES_XML },
    { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
  ]);
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
