// ─── Sweet Shop POS · Database layer (Node / node:sqlite) ───────────────────
// Schema + helpers live in dbcore.js so the demo build can run the same
// engine in the browser via sql.js (WASM).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA, now, today, r2, createHelpers } from './dbcore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'pos.db');
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(SCHEMA);

const h = createHelpers({
  prepare: (sql) => db.prepare(sql),
  exec: (sql) => db.exec(sql)
});

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

export default db;
