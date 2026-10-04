// ─── Engine-agnostic database core ──────────────────────────────────────────
// Shared by server/db.js (node:sqlite) and client demo mode (sql.js WASM).
// `engine` contract: { prepare(sql) -> {get(...p), all(...p), run(...p)}, exec(sql) }

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS business (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL, tagline TEXT, logo TEXT, address TEXT, phone TEXT,
  gstin TEXT, fssai TEXT, email TEXT
);
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT );

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier',
  phone TEXT, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, name_hi TEXT, icon TEXT, sort_order INTEGER DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT, name TEXT NOT NULL, name_hi TEXT,
  category_id INTEGER REFERENCES categories(id),
  unit TEXT NOT NULL DEFAULT 'kg',
  price REAL NOT NULL DEFAULT 0,
  cost_price REAL NOT NULL DEFAULT 0,
  gst_rate REAL NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  barcode TEXT, image TEXT, emoji TEXT,
  track_stock INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, phone TEXT, address TEXT, notes TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_no TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'held',
  customer_id INTEGER REFERENCES customers(id),
  user_id INTEGER REFERENCES users(id),
  shift_id INTEGER,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  round_off REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  udhaar_amount REAL NOT NULL DEFAULT 0,
  notes TEXT, cancel_reason TEXT,
  created_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL, unit TEXT NOT NULL,
  qty REAL NOT NULL,
  rate REAL NOT NULL, discount REAL NOT NULL DEFAULT 0,
  gst_rate REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL, notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'sale',
  sale_id INTEGER REFERENCES sales(id),
  customer_id INTEGER REFERENCES customers(id),
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  received REAL, change REAL, reference TEXT, notes TEXT,
  user_id INTEGER REFERENCES users(id), shift_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL,
  sale_id INTEGER REFERENCES sales(id),
  payment_id INTEGER REFERENCES payments(id),
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  method TEXT, reference TEXT, notes TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_cust ON credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_created ON credit_transactions(created_at);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  type TEXT NOT NULL,
  qty REAL NOT NULL,
  stock_after REAL NOT NULL,
  ref_type TEXT, ref_id INTEGER, notes TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invtx_product ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_invtx_created ON inventory_transactions(created_at);

CREATE TABLE IF NOT EXISTS raw_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, name_hi TEXT, unit TEXT NOT NULL DEFAULT 'kg',
  stock REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0,
  avg_rate REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS raw_material_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id),
  type TEXT NOT NULL,
  qty REAL NOT NULL, stock_after REAL NOT NULL, rate REAL,
  ref_type TEXT, ref_id INTEGER, notes TEXT,
  user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rmtx_rm ON raw_material_transactions(raw_material_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, phone TEXT, address TEXT, gstin TEXT, notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT, supplier_id INTEGER REFERENCES suppliers(id),
  date TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0, paid REAL NOT NULL DEFAULT 0,
  payment_method TEXT, notes TEXT,
  user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id),
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  name TEXT NOT NULL, unit TEXT, qty REAL NOT NULL, rate REAL NOT NULL,
  amount REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS supplier_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  purchase_id INTEGER REFERENCES purchases(id),
  amount REAL NOT NULL, method TEXT, reference TEXT, notes TEXT, date TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, category_id INTEGER REFERENCES expense_categories(id),
  description TEXT, amount REAL NOT NULL, payment_method TEXT DEFAULT 'cash',
  user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

CREATE TABLE IF NOT EXISTS wastage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL, name TEXT NOT NULL,
  qty REAL NOT NULL, unit TEXT, cost REAL NOT NULL DEFAULT 0,
  reason TEXT, staff TEXT, notes TEXT,
  user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wastage_date ON wastage(date);

CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  bill_no TEXT, date TEXT NOT NULL,
  total_refund REAL NOT NULL, method TEXT NOT NULL, reason TEXT, restock INTEGER DEFAULT 1,
  user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES returns(id),
  sale_item_id INTEGER REFERENCES sale_items(id),
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL, qty REAL NOT NULL, rate REAL NOT NULL, amount REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TEXT NOT NULL, closed_at TEXT,
  opening_cash REAL NOT NULL DEFAULT 0,
  expected_cash REAL, actual_cash REAL, difference REAL, notes TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id), user_name TEXT,
  action TEXT, entity TEXT, entity_id INTEGER,
  old_value TEXT, new_value TEXT, created_at TEXT NOT NULL
);
`;

// ── timestamp helpers (IST business timezone) ──
export function now() {
  const d = new Date();
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}
export function today() { return now().slice(0, 10); }
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ── build all data helpers on top of an engine ──
export function createHelpers(engine) {
  const get = (sql, ...p) => engine.prepare(sql).get(...p);
  const all = (sql, ...p) => engine.prepare(sql).all(...p);
  const run = (sql, ...p) => engine.prepare(sql).run(...p);
  function tx(fn) {
    engine.exec('BEGIN');
    try { const out = fn(); engine.exec('COMMIT'); return out; }
    catch (e) { engine.exec('ROLLBACK'); throw e; }
  }

  function getSetting(key, fallback = null) {
    const row = get('SELECT value FROM settings WHERE key = ?', key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return row.value; }
  }
  function setSetting(key, value) {
    run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      key, JSON.stringify(value));
  }
  function allSettings() {
    const out = {};
    for (const r of all('SELECT key,value FROM settings')) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
    return out;
  }

  function audit(user, action, entity, entityId, oldVal, newVal) {
    run('INSERT INTO audit_logs(user_id,user_name,action,entity,entity_id,old_value,new_value,created_at) VALUES(?,?,?,?,?,?,?,?)',
      user?.id ?? null, user?.name ?? 'system', action, entity ?? null, entityId ?? null,
      oldVal == null ? null : JSON.stringify(oldVal), newVal == null ? null : JSON.stringify(newVal), now());
  }

  function nextBillNo() {
    const prefix = getSetting('invoice_prefix', 'CH');
    const seq = (getSetting('bill_seq', 0) || 0) + 1;
    setSetting('bill_seq', seq);
    return `${prefix}-${String(seq).padStart(5, '0')}`;
  }

  function moveProductStock(productId, type, qty, { refType = null, refId = null, notes = null, userId = null, at = null } = {}) {
    const p = get('SELECT id, stock, track_stock FROM products WHERE id = ?', productId);
    if (!p) throw new Error('Product not found: ' + productId);
    const newStock = r2((p.stock || 0) + qty);
    run('UPDATE products SET stock = ? WHERE id = ?', newStock, productId);
    run(`INSERT INTO inventory_transactions(product_id,type,qty,stock_after,ref_type,ref_id,notes,user_id,created_at)
         VALUES(?,?,?,?,?,?,?,?,?)`, productId, type, r2(qty), newStock, refType, refId, notes, userId, at || now());
    return newStock;
  }
  function moveRawStock(rmId, type, qty, { rate = null, refType = null, refId = null, notes = null, userId = null, at = null } = {}) {
    const m = get('SELECT id, stock, avg_rate FROM raw_materials WHERE id = ?', rmId);
    if (!m) throw new Error('Raw material not found: ' + rmId);
    const newStock = r2((m.stock || 0) + qty);
    let avg = m.avg_rate || 0;
    if (type === 'purchase' && qty > 0 && rate) {
      const prevVal = (m.stock > 0 ? m.stock : 0) * avg;
      avg = r2((prevVal + qty * rate) / Math.max((m.stock > 0 ? m.stock : 0) + qty, qty));
    }
    run('UPDATE raw_materials SET stock = ?, avg_rate = ? WHERE id = ?', newStock, avg, rmId);
    run(`INSERT INTO raw_material_transactions(raw_material_id,type,qty,stock_after,rate,ref_type,ref_id,notes,user_id,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`, rmId, type, r2(qty), newStock, rate, refType, refId, notes, userId, at || now());
    return newStock;
  }

  function creditEntry(customerId, type, amount, { saleId = null, paymentId = null, method = null, reference = null, notes = null, userId = null, at = null } = {}) {
    const c = get('SELECT id, balance FROM customers WHERE id = ?', customerId);
    if (!c) throw new Error('Customer not found');
    const bal = r2((c.balance || 0) + amount);
    run('UPDATE customers SET balance = ? WHERE id = ?', bal, customerId);
    run(`INSERT INTO credit_transactions(customer_id,type,sale_id,payment_id,amount,balance_after,method,reference,notes,user_id,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`, customerId, type, saleId, paymentId, r2(amount), bal, method, reference, notes, userId, at || now());
    return bal;
  }

  return { get, all, run, tx, getSetting, setSetting, allSettings, audit, nextBillNo, moveProductStock, moveRawStock, creditEntry };
}
