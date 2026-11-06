// Runs dev/seed-test.mjs in a throwaway directory so it gets its own .data store
// and cannot touch the dev database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(os.tmpdir(), `hrplus-seed-${process.pid}`);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const out = spawnSync(process.execPath, ['--import', path.join(here, 'register.mjs'), path.join(here, 'seed-test.mjs')], { cwd: dir, encoding: 'utf8' });
process.stdout.write(out.stdout || '');
process.stderr.write(out.stderr || '');
fs.rmSync(dir, { recursive: true, force: true });
process.exit(out.status ?? 1);
