import crypto from 'node:crypto';
import { supabase, cors, authenticate, sendError, HttpError, audit } from './_lib.js';

const MB = 1024 * 1024;
const RULES = {
  receipts: { roles: ['admin', 'employee'], types: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'], max: 3 * MB, isPublic: false },
  branding: { roles: ['admin'], types: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'], max: 2 * MB, isPublic: true },
};

/* ---------------------------------------------------------------- sniffing */
// The declared Content-Type comes from the client, so it is a hint, not a fact.
// Verify the actual bytes; otherwise a `.png` that is really HTML (or an SVG with
// a <script> in the public branding bucket) would be accepted and served back.
function sniff(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  const head = buffer.subarray(0, 2048).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('<') && /<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

// SVG is executable in a browser: strip the constructs that make it dangerous
// before it lands in a public bucket.
function svgIsSafe(buffer) {
  const text = buffer.toString('utf8');
  const bad = [
    /<script[\s>]/i,
    /<foreignObject[\s>]/i,
    /\son[a-z]+\s*=/i,          // onload=, onerror=, onclick= …
    /javascript:/i,
    /<iframe[\s>]/i,
    /<!ENTITY/i,                // XXE / billion laughs
    /xlink:href\s*=\s*["']\s*(?!#|data:image\/)/i, // external references
    /href\s*=\s*["']\s*(?:https?:|\/\/)/i,
  ];
  return !bad.some((re) => re.test(text));
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const ctx = await authenticate(req);
    const { bucket, fileName, fileBase64, contentType } = req.body || {};
    const rule = RULES[bucket];
    if (!rule) throw new HttpError(400, 'Unknown bucket');
    if (!rule.roles.includes(ctx.profile.role) || ctx.profile.status === 'pending') throw new HttpError(403, 'Forbidden');
    if (!rule.types.includes(contentType)) throw new HttpError(400, 'File type not allowed');

    const b64 = String(fileBase64 || '');
    // Reject on the encoded length first: decoding a 100 MB string to then
    // discover it is too large has already cost the memory.
    if (b64.length > Math.ceil((rule.max * 4) / 3) + 256) throw new HttpError(413, `File too large (max ${Math.round(rule.max / MB)}MB)`);
    const buffer = Buffer.from(b64, 'base64');
    if (!buffer.length) throw new HttpError(400, 'Empty file');
    if (buffer.length > rule.max) throw new HttpError(413, `File too large (max ${Math.round(rule.max / MB)}MB)`);

    const actual = sniff(buffer);
    if (!actual) throw new HttpError(400, 'The file content does not look like an image or PDF');
    if (actual !== contentType) throw new HttpError(400, `File content is ${actual}, but it was uploaded as ${contentType}`);
    if (actual === 'image/svg+xml' && !svgIsSafe(buffer)) {
      throw new HttpError(400, 'This SVG contains scripts or external references and cannot be uploaded as a logo');
    }

    const safe = String(fileName || 'file').toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^[-.]+/, '').slice(-60) || 'file';
    const path = `${ctx.profile.id}/${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage.from(bucket).upload(path, buffer, { contentType: actual, upsert: false });
    if (error) throw error;
    let url;
    if (rule.isPublic) url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    else url = (await supabase.storage.from(bucket).createSignedUrl(path, 3600)).data?.signedUrl;
    await audit(ctx, 'file.upload', bucket, path, { size: buffer.length, contentType: actual });
    res.status(200).json({ path, url });
  } catch (e) { sendError(res, e); }
}
