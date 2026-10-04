// ─── Demo-mode database: sql.js (SQLite compiled to WASM) ──────────────────
// Implements the exact same exports as server/db.js, so all server route
// files run unchanged inside the browser. Persisted to IndexedDB; reseeded
// daily so "Today" dashboards always have data.
import initSqlJs from 'sql.js';
import { sqlJsOptions } from './sqljs-env.js';
import { SCHEMA, now, today, r2, createHelpers } from '../../../server/dbcore.js';

const SQL = await initSqlJs(sqlJsOptions);

// ── IndexedDB persistence (best-effort) ──
const IDB_NAME = 'sweetshop-pos-demo', STORE = 'db';
function idb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}
async function idbGet(key) {
  const d = await idb(); if (!d) return null;
  return new Promise((resolve) => {
    const tx0 = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    tx0.onsuccess = () => resolve(tx0.result || null);
    tx0.onerror = () => resolve(null);
  });
}
async function idbSet(key, val) {
  const d = await idb(); if (!d) return;
  return new Promise((resolve) => {
    const tx0 = d.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
    tx0.onsuccess = () => resolve(); tx0.onerror = () => resolve();
  });
}

let _db;
const saved = await idbGet('snapshot');
if (saved && saved.day === today() && saved.bytes) {
  try { _db = new SQL.Database(new Uint8Array(saved.bytes)); } catch { _db = null; }
}
if (!_db) {
  _db = new SQL.Database();
  _db.run('PRAGMA foreign_keys = ON');
  _db.run(SCHEMA);
}

// ── engine adapter: mimic node:sqlite's prepare().get/all/run ──
const lastId = () => {
  const st = _db.prepare('SELECT last_insert_rowid() AS id');
  st.step(); const v = st.getAsObject().id; st.free(); return v;
};
const engine = {
  prepare(sql) {
    return {
      get: (...p) => { const st = _db.prepare(sql); try { st.bind(p); return st.step() ? st.getAsObject() : undefined; } finally { st.free(); } },
      all: (...p) => { const st = _db.prepare(sql); try { st.bind(p); const out = []; while (st.step()) out.push(st.getAsObject()); return out; } finally { st.free(); } },
      run: (...p) => { _db.run(sql, p); return { lastInsertRowid: lastId(), changes: _db.getRowsModified() }; }
    };
  },
  exec(sql) { _db.run(sql); }
};

const h = createHelpers(engine);

export { now, today, r2 };
export const get = h.get;
export const all = h.all;
export const run = h.run;
export const tx = h.tx;
export const getSetting = h.getSetting;
export const setSetting = h.setSetting;
export const allSettings = h.allSettings;
export const audit = h.audit;
export const nextBillNo = h.nextBillNo;
export const moveProductStock = h.moveProductStock;
export const moveRawStock = h.moveRawStock;
export const creditEntry = h.creditEntry;

// seed.js and routes expect a `db` object with .exec() / .prepare()
export const db = { exec: (s) => _db.run(s), prepare: (s) => engine.prepare(s) };
export const DB_PATH = ':memory: (demo)';
export default db;

// debounced persistence — called by the dispatcher after mutations
let saveTimer = null;
export function persistSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await idbSet('snapshot', { day: today(), bytes: _db.export().buffer }); } catch { /* ignore */ }
  }, 800);
}
