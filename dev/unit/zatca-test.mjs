// ZATCA Phase-2 QR checks: every issued invoice must carry a well-formed TLV
// payload, and an oversized field must fail loudly instead of being truncated.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { signInvoice, generateKeys } from '../../api/_zatca.js';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log(`FAIL ${name} — ${e.message}`); } };

const decode = (b64) => {
  const buf = Buffer.from(b64, 'base64');
  const tags = [];
  let i = 0;
  while (i < buf.length) {
    const tag = buf[i];
    const len = buf[i + 1];
    tags.push({ tag, len, value: buf.subarray(i + 2, i + 2 + len) });
    i += 2 + len;
  }
  return { tags, consumed: i, total: buf.length };
};

const db = JSON.parse(fs.readFileSync('.data/db.json', 'utf8'));
const invoices = (db.tables.invoices || []).filter((i) => i.qr);

t('there is at least one invoice to check', () => assert.ok(invoices.length > 0));

let checked = 0;
t('every stored QR parses into ordered TLV tags', () => {
  for (const inv of invoices) {
    const { tags, consumed, total } = decode(inv.qr);
    assert.equal(consumed, total, `invoice ${inv.number}: TLV walk did not consume the payload (${consumed}/${total}) — a length byte lies`);
    const seq = tags.map((x) => x.tag);
    assert.deepEqual(seq, [...seq].sort((a, b) => a - b), `invoice ${inv.number}: tags out of order ${seq}`);
    assert.equal(seq[0], 1, `invoice ${inv.number}: first tag must be the seller name`);
    for (const x of tags) assert.equal(x.value.length, x.len, `invoice ${inv.number}: tag ${x.tag} length mismatch`);
    checked++;
  }
});
t('seller name, VAT number and total are valid UTF-8 strings', () => {
  for (const inv of invoices.slice(0, 5)) {
    const { tags } = decode(inv.qr);
    const seller = tags.find((x) => x.tag === 1).value.toString('utf8');
    const vat = tags.find((x) => x.tag === 2).value.toString('utf8');
    const total = Number(tags.find((x) => x.tag === 4).value.toString('utf8'));
    assert.ok(seller.trim().length > 0);
    assert.match(vat, /^3\d{13}3$/, `VAT number ${vat} is not ZATCA-shaped`);
    assert.ok(total > 0);
  }
});
t('tag 8 (public key) is binary DER, not truncated text', () => {
  const { tags } = decode(invoices[0].qr);
  const key = tags.find((x) => x.tag === 8);
  assert.ok(key, 'tag 8 missing');
  assert.ok(key.len > 32, `tag 8 is only ${key.len} bytes`);
  assert.equal(key.value.subarray(0, 1)[0] & 0xff, 0x30, 'DER SEQUENCE tag (0x30) expected');
});

// An oversized field cannot be represented in a 1-byte length; it must throw.
const company = JSON.parse(JSON.stringify(db.tables.company[0]));
const keys = generateKeys();
const inv = {
  number: 'INV-TEST-00001', uuid: '00000000-0000-4000-8000-000000000000', icv: 1,
  prev_hash: 'x', issue_date: '2026-11-06', issue_time: '10:00:00', type: 'B2B',
  buyer: { name: 'Buyer', vat_number: '311111111111113' },
  lines: [{ description: 'Consulting', quantity: 1, unit_price: 100, vat_rate: 0.15 }],
  subtotal: 100, vat: 15, total: 115,
};
t('a normal invoice signs successfully', () => {
  const out = signInvoice({ company, inv, keys });
  assert.ok(out.hash && out.qr && out.xml && out.signature);
});
t('an over-long seller name throws instead of being truncated', () => {
  const long = { ...company, legal_name_en: 'ا'.repeat(300) };
  assert.throws(() => signInvoice({ company: long, inv, keys }), /at most 255/);
});
t('a 255-byte value still fits', () => {
  const exact = { ...company, legal_name_en: 'A'.repeat(255) };
  const out = signInvoice({ company: exact, inv, keys });
  const { tags } = decode(out.qr);
  assert.equal(tags.find((x) => x.tag === 1).len, 255);
});

console.log(`${pass}/${pass + fail} ZATCA QR assertions passed over ${checked} invoices${fail ? ` — ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
