// Starts the local API emulator and the Vite dev server together.
//
// Ports are treated as strict: if 8787 or 5173 is already taken we stop with an
// actionable message instead of letting Vite silently drift to 5174 (which
// leaves a stale server holding the port the preview actually uses).
import { spawn } from 'node:child_process';
import net from 'node:net';

const API_PORT = Number(process.env.DEV_API_PORT || 8787);
const WEB_PORT = Number(process.env.DEV_WEB_PORT || 5173);

function isFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (e) => resolve(e.code === 'EADDRINUSE' ? false : true));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '0.0.0.0');
  });
}

async function preflight() {
  const checks = await Promise.all([[API_PORT, 'API'], [WEB_PORT, 'web']].map(async ([p, label]) => [p, label, await isFree(p)]));
  const taken = checks.filter(([, , free]) => !free);
  if (!taken.length) return;
  for (const [port, label] of taken) {
    console.error(`[dev] port ${port} (${label}) is already in use — refusing to start a duplicate.`);
  }
  console.error('[dev] Free it first, e.g.:  pkill -f "vite" ; pkill -f "dev/server.mjs"');
  process.exit(1);
}

await preflight();

const procs = [];
function start(name, cmd, args) {
  const p = spawn(cmd, args, { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  p.on('exit', (code) => {
    if (code && code !== 0) console.error(`[${name}] exited with code ${code}`);
    shutdown();
  });
  procs.push(p);
  return p;
}
function shutdown() {
  for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* ignore */ } }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start('api', process.execPath, ['--import', './dev/register.mjs', 'dev/server.mjs']);
setTimeout(() => start('web', 'npx', ['vite', '--host', '0.0.0.0', '--port', String(WEB_PORT), '--strictPort']), 1500);
