// Bundles the browser modules the unit tests import, into .tmp/ (gitignored).
// The Google-auth bundle resolves './supabase' to a stub so the test can observe
// whether setSession/signInWithIdToken are called without a real client.
import * as esbuild from 'esbuild';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const out = (f) => path.join(root, '.tmp', f);
const stub = path.join(root, 'dev/unit/supabase-stub.mjs');

const stubSupabase = {
  name: 'stub-supabase',
  setup(build) {
    build.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: stub }));
  },
};

await esbuild.build({ entryPoints: [path.join(root, 'src/lib/format.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out('format.mjs'), logLevel: 'error' });
await esbuild.build({ entryPoints: [path.join(root, 'src/lib/docx.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out('docx.mjs'), logLevel: 'error' });
await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/googleAuth.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: out('googleauth.mjs'), logLevel: 'error',
  plugins: [stubSupabase],
  define: {
    'import.meta.env.VITE_GOOGLE_CLIENT_ID': '"test-client"',
    'import.meta.env.VITE_GOOGLE_AUTH_PROXY': '"https://auth.hrplus.sa/callback"',
    'import.meta.env.VITE_SUPABASE_URL': '"https://test.supabase.co"',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
  },
});
console.log('unit fixtures bundled into .tmp/');
