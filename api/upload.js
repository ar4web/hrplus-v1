import crypto from 'node:crypto';
import { supabase, cors, authenticate, sendError, HttpError, audit } from './_lib.js';

const RULES = {
  receipts: { roles: ['admin', 'employee'], types: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'], max: 3 * 1024 * 1024, isPublic: false },
  branding: { roles: ['admin'], types: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'], max: 2 * 1024 * 1024, isPublic: true },
};

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
    const buffer = Buffer.from(String(fileBase64 || ''), 'base64');
    if (!buffer.length) throw new HttpError(400, 'Empty file');
    if (buffer.length > rule.max) throw new HttpError(413, `File too large (max ${Math.round(rule.max / 1048576)}MB)`);
    const safe = String(fileName || 'file').toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(-60);
    const path = `${ctx.profile.id}/${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage.from(bucket).upload(path, buffer, { contentType, upsert: false });
    if (error) throw error;
    let url;
    if (rule.isPublic) url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    else url = (await supabase.storage.from(bucket).createSignedUrl(path, 3600)).data?.signedUrl;
    await audit(ctx, 'file.upload', bucket, path, { size: buffer.length, contentType });
    res.status(200).json({ path, url });
  } catch (e) { sendError(res, e); }
}
