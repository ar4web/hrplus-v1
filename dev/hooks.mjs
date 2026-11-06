const SHIM = new URL('./supabase-local.mjs', import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === '@supabase/supabase-js') return { url: SHIM, shortCircuit: true, format: 'module' };
  return next(specifier, context);
}
