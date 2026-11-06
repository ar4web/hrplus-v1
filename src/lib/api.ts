import supabase from './supabase';

export async function api(path: string, opts: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const TIMEOUT_MS = 30000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers as any || {}) }, signal: opts.signal ?? ctrl.signal });
  } catch (err: any) {
    const e: any = err?.name === 'AbortError'
      ? new Error('Request timed out — please check your connection and retry')
      : new Error('Network error — you appear to be offline');
    e.network = true;
    throw e;
  } finally { clearTimeout(timer); }
  let body: any = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const msg = body?.error || `Request failed (${res.status})`;
    if (res.status === 440 || msg === 'session_expired') window.dispatchEvent(new CustomEvent('hrplus:expired'));
    if (msg === 'mfa_required') window.dispatchEvent(new CustomEvent('hrplus:mfa'));
    const e: any = new Error(msg); e.status = res.status; throw e;
  }
  return body;
}

export function getRes(resource: string, params: Record<string, any> = {}) {
  const qs = new URLSearchParams({ resource });
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    qs.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return api(`/api/data?${qs.toString()}`);
}
export const createRes = (resource: string, values: any) => api('/api/data', { method: 'POST', body: JSON.stringify({ resource, values }) });
export const updateRes = (resource: string, id: any, values: any) => api('/api/data', { method: 'PUT', body: JSON.stringify({ resource, id, values }) });
export const deleteRes = (resource: string, id: any) => api('/api/data', { method: 'DELETE', body: JSON.stringify({ resource, id }) });
export const act = (action: string, payload: any = {}) => api('/api/actions', { method: 'POST', body: JSON.stringify({ action, ...payload }) });

export async function uploadFile(bucket: 'receipts' | 'branding', file: File): Promise<{ path: string; url: string }> {
  const base64: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
  return api('/api/upload', { method: 'POST', body: JSON.stringify({ bucket, fileName: file.name, fileBase64: base64, contentType: file.type }) });
}
