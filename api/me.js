import { supabase, cors, authenticate, sendError, getCompany, publicCompany } from './_lib.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.query.public) {
      const c = await getCompany();
      return res.status(200).json({ company: c ? { legal_name_en: c.legal_name_en, legal_name_ar: c.legal_name_ar, logo_url: c.logo_url, primary_color: c.primary_color, secondary_color: c.secondary_color, phone: c.phone, email: c.email, website: c.website } : null });
    }
    const ctx = await authenticate(req);
    const p = ctx.profile;
    let employee = null, vendor = null;
    if (p.employee_id) ({ data: employee } = await supabase.from('employees').select('*').eq('id', p.employee_id).maybeSingle());
    if (p.vendor_id) ({ data: vendor } = await supabase.from('vendors').select('*').eq('id', p.vendor_id).maybeSingle());
    const { session_id, ...profile } = p;
    const { data: factors } = await supabase.auth.admin.mfa.listFactors({ userId: ctx.user.id }).catch(() => ({ data: null }));
    res.status(200).json({
      profile, employee, vendor,
      company: publicCompany(ctx.company, p.role === 'admin'),
      user: { id: ctx.user.id, email: ctx.user.email, provider: ctx.user.app_metadata?.provider, last_sign_in_at: ctx.user.last_sign_in_at },
      session: { aal: ctx.claims.aal, expires_at: ctx.claims.exp, factors: (factors?.factors || []).filter((f) => f.status === 'verified').length },
    });
  } catch (e) { sendError(res, e); }
}
