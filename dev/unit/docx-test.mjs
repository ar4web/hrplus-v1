// Verifies that the Word export produces a real, openable .docx (OOXML zip).
// Uses a tiny fake DOM so it runs in Node without a browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { domToBlocks, blocksToDocumentXml, buildDocxBytes, DOCX_MIME } from '../../.tmp/docx.mjs';

const el = (name, children = [], text = null) => ({
  nodeType: 1,
  nodeName: name.toUpperCase(),
  childNodes: children,
  nodeValue: null,
  querySelectorAll: (sel) => {
    if (sel !== 'tr') return [];
    const found = [];
    const walk = (n) => { for (const c of n.childNodes || []) { if (String(c.nodeName).toLowerCase() === 'tr') found.push(c); walk(c); } };
    walk({ childNodes: children });
    return found;
  },
  get textContent() { return text ?? children.map((c) => c.textContent || '').join(''); },
});
const text = (v) => ({ nodeType: 3, nodeName: '#text', nodeValue: v, childNodes: [] });
const row = (cells) => el('tr', cells.map((c) => el('td', [text(c)])));

const doc = el('div', [
  el('h1', [text('Employment Letter')]),
  el('p', [text('Dear '), el('strong', [text('David Martinez')]), text(', your salary is '), el('em', [text('SAR 9,000')]), text('.')]),
  el('table', [row(['Item', 'Amount']), row(['Basic', '5,750.00']), row(['Housing', '1,150.00'])]),
  el('ul', [el('li', [text('Annual leave 30 days')]), el('li', [text('إجازة سنوية ٣٠ يوماً')])]),
  el('p', [text('Line one'), el('br'), text('Line two')]),
  el('script', [text('alert(1)')]),
]);

const blocks = domToBlocks(doc);
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log(`FAIL ${name} — ${e.message}`); } };

t('headings, paragraphs, table, list and break are captured', () => {
  const kinds = blocks.map((b) => b.kind);
  assert.equal(kinds.filter((k) => k === 'table').length, 1);
  assert.ok(blocks.length >= 5, `expected >=5 blocks, got ${blocks.length}`);
  assert.ok(blocks.some((b) => b.style === 'Heading1'));
});
t('bold/italic formatting is preserved as runs', () => {
  const p = blocks.find((b) => b.kind === 'p' && b.runs.some((r) => r.bold));
  assert.ok(p, 'no bold run found');
  assert.ok(p.runs.some((r) => r.text === 'David Martinez' && r.bold));
  assert.ok(blocks.some((b) => b.kind === 'p' && b.runs.some((r) => r.italic && /SAR 9,000/.test(r.text))));
});
t('table rows and cells survive', () => {
  const tbl = blocks.find((b) => b.kind === 'table');
  assert.equal(tbl.rows.length, 3);
  assert.equal(tbl.rows[1].cells[1][0].text, '5,750.00');
});
t('script tags are dropped', () => {
  assert.ok(!blocksToDocumentXml(blocks).includes('alert(1)'));
});
t('Arabic text is emitted verbatim', () => {
  assert.ok(blocksToDocumentXml(blocks).includes('إجازة سنوية'));
});
t('xml escapes reserved characters', () => {
  const xml = blocksToDocumentXml([{ kind: 'p', runs: [{ text: 'a < b & c > d' }] }]);
  assert.ok(xml.includes('a &lt; b &amp; c &gt; d'));
});

// --- the real deliverable: a zip that a word processor can open ---
const bytes = buildDocxBytes(blocks);
t('docx mime type is the OOXML one', () => assert.ok(DOCX_MIME.endsWith('wordprocessingml.document')));
fs.writeFileSync('/tmp/export.docx', Buffer.from(bytes));
t('file starts with a ZIP signature', () => {
  const buf = fs.readFileSync('/tmp/export.docx');
  assert.equal(buf.slice(0, 2).toString('ascii'), 'PK');
});
t('zip integrity passes (python zipfile)', () => {
  const out = execFileSync('python3', ['-c', `
import zipfile, sys
z = zipfile.ZipFile('/tmp/export.docx')
bad = z.testzip()
print('BAD' if bad else 'OK')
print(','.join(sorted(z.namelist())))
`], { encoding: 'utf8' }).trim().split('\n');
  assert.equal(out[0], 'OK', 'zip integrity check failed');
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels']) {
    assert.ok(out[1].split(',').includes(part), `missing part ${part}`);
  }
});
t('every XML part is well-formed', () => {
  const res = execFileSync('python3', ['-c', `
import zipfile, xml.dom.minidom
z = zipfile.ZipFile('/tmp/export.docx')
for n in z.namelist():
    xml.dom.minidom.parseString(z.read(n))
print('OK')
`], { encoding: 'utf8' }).trim();
  assert.equal(res, 'OK');
});

console.log(`${pass}/${pass + fail} docx assertions passed${fail ? ` — ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
