import { defineConfig, loadEnv } from 'vite'
import type { PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins: PluginOption[] = [react(), tailwindcss()];
  try {
    // Optional build-time source annotations (not present in the public repo).
    // @ts-expect-error - untyped optional local plugin
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch { /* plugin not installed — fine */ }

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  const demo = String(env.VITE_DEMO_MODE ?? '') === '1';
  const apiTarget = env.VITE_DEMO_API_URL || 'http://127.0.0.1:8787';

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
    build: {
      // Long-lived vendor chunks: the app chunk changes on every deploy, the
      // framework does not, so users keep the cached copy across releases.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return 'react';
            if (id.includes('framer-motion')) return 'motion';
            if (id.includes('lucide-react')) return 'icons';
            // Everything else is left alone on purpose: a catch-all `vendor`
            // chunk would drag lazily-imported libraries (docx, html2canvas,
            // jspdf) into the initial download and make the app slower.
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      // any host is allowed so sandbox/preview domains work
      allowedHosts: true as const,
      // In demo mode the local API server (dev/server.mjs) stands in for /api
      proxy: demo
        ? {
            '/api': { target: apiTarget, changeOrigin: true },
          }
        : undefined,
    },
  };
})
