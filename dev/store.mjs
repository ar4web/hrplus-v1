// Tiny JSON-file backed row store used by the local Supabase emulator.
// Tables are schemaless: a table is created on first use.
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function empty() {
  return { tables: {}, buckets: {}, seq: {}, meta: {} };
}

function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}

export const store = load();

// Tables whose real schema has an updated_at column (kept with the store so the
// query shim and the fixtures agree on where to apply the column default).
export const UPDATED_AT_TABLES = new Set(['company', 'tickets', 'conversations', 'webhooks']);

// Set while bulk-seeding so we don't rewrite the whole JSON file per insert.
export const state = { paused: false };

let timer = null;
function scheduleFlush() {
  if (state.paused) return;
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush(); }, 120);
}
export function flush() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(store));
  } catch (e) {
    console.error('[store] could not persist:', e.message);
  }
}

export function table(name) {
  if (!store.tables[name]) store.tables[name] = [];
  return store.tables[name];
}

export function nextId(name) {
  store.seq[name] = (store.seq[name] || 0) + 1;
  scheduleFlush();
  return store.seq[name];
}

export function touch() { scheduleFlush(); }

export function reset() {
  store.tables = {}; store.buckets = {}; store.seq = {}; store.meta = {};
  flush();
}

export const DB_PATH = DB_FILE;
