import { Router } from 'express';
import {
  get, all, run, tx, now, today, r2, audit,
  moveProductStock, moveRawStock
} from '../db.js';
import { requirePerm } from '../perm.js';

const r = Router();

// ── PURCHASES ────────────────────────────────────────────────────────────────
r.get('/purchases', requirePerm('purchases'), (req, res) => {
  const { from, to, supplier_id } = req.query;
  let sql = `SELECT p.*, s.name AS supplier_name, u.name AS user_name FROM purchases p
             LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.user_id WHERE 1=1`;
  const params = [];
  if (from) { sql += ' AND p.date >= ?'; params.push(from); }
  if (to) { sql += ' AND p.date <= ?'; params.push(to); }
  if (supplier_id) { sql += ' AND p.supplier_id = ?'; params.push(supplier_id); }
  sql += ' ORDER BY p.date DESC, p.id DESC LIMIT 300';
  const rows = all(sql, ...params);
  for (const row of rows) row.items = all('SELECT * FROM purchase_items WHERE purchase_id = ?', row.id);
  res.json(rows);
});

r.post('/purchases', requirePerm('purchases'), (req, res) => {
  const { supplier_id, invoice_no, date, items = [], tax = 0, paid = 0, payment_method, notes } = req.body;
  if (!items.length) return res.status(400).json({ error: 'Add at least one item' });
  const result = tx(() => {
    const subtotal = r2(items.reduce((a, it) => a + Number(it.qty) * Number(it.rate), 0));
    const total = r2(subtotal + Number(tax || 0));
    const out = run(`INSERT INTO purchases(invoice_no,supplier_id,date,subtotal,tax,total,paid,payment_method,notes,user_id,created_at)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      invoice_no ?? null, supplier_id ?? null, date || today(), subtotal, r2(tax || 0), total,
      r2(paid || 0), payment_method ?? null, notes ?? null, req.user.id, now());
    const pid = out.lastInsertRowid;
    for (const it of items) {
      const amount = r2(Number(it.qty) * Number(it.rate));
      run('INSERT INTO purchase_items(purchase_id,item_type,item_id,name,unit,qty,rate,amount) VALUES(?,?,?,?,?,?,?,?)',
        pid, it.item_type, it.item_id, it.name, it.unit ?? null, Number(it.qty), r2(it.rate), amount);
      if (it.item_type === 'raw_material') {
        moveRawStock(it.item_id, 'purchase', Number(it.qty), { rate: r2(it.rate), refType: 'purchase', refId: pid, notes: invoice_no, userId: req.user.id });
      } else {
        moveProductStock(it.item_id, 'purchase', Number(it.qty), { refType: 'purchase', refId: pid, notes: invoice_no, userId: req.user.id });
      }
    }
    return get('SELECT * FROM purchases WHERE id = ?', pid);
  });
  audit(req.user, 'purchase_created', 'purchase', result.id, null, { invoice_no, total: result.total });
  res.json(result);
});

// ── EXPENSES ─────────────────────────────────────────────────────────────────
r.get('/expenses', requirePerm('expenses'), (req, res) => {
  const { from, to, category_id } = req.query;
  let sql = `SELECT e.*, ec.name AS category_name, u.name AS user_name FROM expenses e
             LEFT JOIN expense_categories ec ON ec.id = e.category_id LEFT JOIN users u ON u.id = e.user_id WHERE 1=1`;
  const params = [];
  if (from) { sql += ' AND e.date >= ?'; params.push(from); }
  if (to) { sql += ' AND e.date <= ?'; params.push(to); }
  if (category_id) { sql += ' AND e.category_id = ?'; params.push(category_id); }
  sql += ' ORDER BY e.date DESC, e.id DESC LIMIT 500';
  res.json(all(sql, ...params));
});
r.post('/expenses', requirePerm('expenses'), (req, res) => {
  const b = req.body;
  const out = run('INSERT INTO expenses(date,category_id,description,amount,payment_method,user_id,created_at) VALUES(?,?,?,?,?,?,?)',
    b.date || today(), b.category_id ?? null, b.description ?? null, r2(b.amount), b.payment_method || 'cash', req.user.id, now());
  res.json(get('SELECT * FROM expenses WHERE id = ?', out.lastInsertRowid));
});
r.put('/expenses/:id', requirePerm('expenses'), (req, res) => {
  const old = get('SELECT * FROM expenses WHERE id = ?', req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  run('UPDATE expenses SET date=?, category_id=?, description=?, amount=?, payment_method=? WHERE id=?',
    b.date || old.date, b.category_id ?? old.category_id, b.description ?? old.description, r2(b.amount ?? old.amount), b.payment_method || old.payment_method, req.params.id);
  audit(req.user, 'expense_changed', 'expense', old.id, { amount: old.amount, description: old.description }, { amount: b.amount, description: b.description });
  res.json(get('SELECT * FROM expenses WHERE id = ?', req.params.id));
});
r.delete('/expenses/:id', requirePerm('expenses'), (req, res) => {
  const old = get('SELECT * FROM expenses WHERE id = ?', req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  run('DELETE FROM expenses WHERE id = ?', req.params.id);
  audit(req.user, 'expense_deleted', 'expense', old.id, old, null);
  res.json({ ok: true });
});

// ── WASTAGE ──────────────────────────────────────────────────────────────────
r.get('/wastage', requirePerm('wastage'), (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT w.*, u.name AS user_name FROM wastage w LEFT JOIN users u ON u.id = w.user_id WHERE 1=1`;
  const params = [];
  if (from) { sql += ' AND w.date >= ?'; params.push(from); }
  if (to) { sql += ' AND w.date <= ?'; params.push(to); }
  sql += ' ORDER BY w.date DESC, w.id DESC LIMIT 500';
  res.json(all(sql, ...params));
});
r.post('/wastage', requirePerm('wastage'), (req, res) => {
  const b = req.body;
  const result = tx(() => {
    let name = b.name, unit = b.unit, cost = b.cost;
    if (b.item_type === 'product') {
      const p = get('SELECT * FROM products WHERE id = ?', b.item_id);
      if (!p) throw new Error('Product not found');
      name = p.name; unit = p.unit;
      if (cost == null) cost = r2(Number(b.qty) * p.cost_price);
      if (p.track_stock) moveProductStock(p.id, 'wastage', -Number(b.qty), { refType: 'wastage', notes: b.reason, userId: req.user.id });
    } else {
      const m = get('SELECT * FROM raw_materials WHERE id = ?', b.item_id);
      if (!m) throw new Error('Raw material not found');
      name = m.name; unit = m.unit;
      if (cost == null) cost = r2(Number(b.qty) * m.avg_rate);
      moveRawStock(m.id, 'wastage', -Number(b.qty), { refType: 'wastage', notes: b.reason, userId: req.user.id });
    }
    const out = run(`INSERT INTO wastage(date,item_type,item_id,name,qty,unit,cost,reason,staff,notes,user_id,created_at)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      b.date || today(), b.item_type, b.item_id, name, Number(b.qty), unit, r2(cost || 0),
      b.reason ?? null, b.staff ?? null, b.notes ?? null, req.user.id, now());
    return get('SELECT * FROM wastage WHERE id = ?', out.lastInsertRowid);
  });
  res.json(result);
});

// ── INVENTORY (finished products) ────────────────────────────────────────────
r.get('/inventory/transactions', requirePerm('inventory'), (req, res) => {
  const { product_id, from, to, type } = req.query;
  let sql = `SELECT t.*, p.name AS product_name, p.unit, u.name AS user_name
             FROM inventory_transactions t JOIN products p ON p.id = t.product_id
             LEFT JOIN users u ON u.id = t.user_id WHERE 1=1`;
  const params = [];
  if (product_id) { sql += ' AND t.product_id = ?'; params.push(product_id); }
  if (type) { sql += ' AND t.type = ?'; params.push(type); }
  if (from) { sql += ' AND substr(t.created_at,1,10) >= ?'; params.push(from); }
  if (to) { sql += ' AND substr(t.created_at,1,10) <= ?'; params.push(to); }
  sql += ' ORDER BY t.id DESC LIMIT 300';
  res.json(all(sql, ...params));
});

// stock movement summary per product for a period (opening / in / out / closing)
r.get('/inventory/summary', requirePerm('inventory'), (req, res) => {
  const { from = today(), to = today() } = req.query;
  const rows = all(`
    SELECT p.id, p.name, p.name_hi, p.unit, p.stock, p.min_stock, p.cost_price, p.price, p.track_stock, c.name AS category_name,
      COALESCE((SELECT SUM(qty) FROM inventory_transactions t WHERE t.product_id = p.id AND substr(t.created_at,1,10) < ?), 0) AS opening_calc,
      COALESCE((SELECT SUM(qty) FROM inventory_transactions t WHERE t.product_id = p.id AND substr(t.created_at,1,10) BETWEEN ? AND ? AND t.qty > 0 AND t.type IN ('production','purchase','opening')), 0) AS added,
      COALESCE((SELECT -SUM(qty) FROM inventory_transactions t WHERE t.product_id = p.id AND substr(t.created_at,1,10) BETWEEN ? AND ? AND t.type = 'sale'), 0) AS sold,
      COALESCE((SELECT SUM(qty) FROM inventory_transactions t WHERE t.product_id = p.id AND substr(t.created_at,1,10) BETWEEN ? AND ? AND t.type = 'return'), 0) AS returned,
      COALESCE((SELECT -SUM(qty) FROM inventory_transactions t WHERE t.product_id = p.id AND substr(t.created_at,1,10) BETWEEN ? AND ? AND t.type = 'wastage'), 0) AS wasted,
      COALESCE((SELECT SUM(qty) FROM inventory_transactions t WHERE t.product_id = p.id AND substr(t.created_at,1,10) BETWEEN ? AND ? AND t.type = 'adjustment'), 0) AS adjusted
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.active = 1 AND p.track_stock = 1 ORDER BY p.name`,
    from, from, to, from, to, from, to, from, to, from, to);
  res.json(rows);
});

r.post('/inventory/adjust', requirePerm('stock_adjust'), (req, res) => {
  const { product_id, new_stock, notes } = req.body;
  const p = get('SELECT * FROM products WHERE id = ?', product_id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const diff = r2(Number(new_stock) - p.stock);
  if (Math.abs(diff) < 0.0001) return res.json({ ok: true, stock: p.stock });
  const stock = moveProductStock(product_id, 'adjustment', diff, { notes: notes || 'Manual adjustment', userId: req.user.id });
  audit(req.user, 'stock_adjustment', 'product', p.id, { stock: p.stock }, { stock, notes });
  res.json({ ok: true, stock });
});

// production: add finished goods, optionally consume raw materials
r.post('/inventory/production', requirePerm('inventory'), (req, res) => {
  const { product_id, qty, consume = [], notes } = req.body;
  const p = get('SELECT * FROM products WHERE id = ?', product_id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const result = tx(() => {
    const stock = moveProductStock(product_id, 'production', Number(qty), { notes: notes || 'Production', userId: req.user.id });
    for (const c of consume) {
      if (c.raw_material_id && Number(c.qty) > 0) {
        moveRawStock(c.raw_material_id, 'consumption', -Number(c.qty), { refType: 'production', notes: `For ${p.name}`, userId: req.user.id });
      }
    }
    return stock;
  });
  res.json({ ok: true, stock: result });
});

// raw material transactions + adjust
r.get('/raw-materials/transactions', requirePerm('raw_materials'), (req, res) => {
  const { raw_material_id, from, to } = req.query;
  let sql = `SELECT t.*, m.name AS material_name, m.unit FROM raw_material_transactions t
             JOIN raw_materials m ON m.id = t.raw_material_id WHERE 1=1`;
  const params = [];
  if (raw_material_id) { sql += ' AND t.raw_material_id = ?'; params.push(raw_material_id); }
  if (from) { sql += ' AND substr(t.created_at,1,10) >= ?'; params.push(from); }
  if (to) { sql += ' AND substr(t.created_at,1,10) <= ?'; params.push(to); }
  sql += ' ORDER BY t.id DESC LIMIT 300';
  res.json(all(sql, ...params));
});
r.post('/raw-materials/adjust', requirePerm('stock_adjust'), (req, res) => {
  const { raw_material_id, new_stock, notes } = req.body;
  const m = get('SELECT * FROM raw_materials WHERE id = ?', raw_material_id);
  if (!m) return res.status(404).json({ error: 'Raw material not found' });
  const diff = r2(Number(new_stock) - m.stock);
  const stock = moveRawStock(raw_material_id, 'adjustment', diff, { notes: notes || 'Manual adjustment', userId: req.user.id });
  audit(req.user, 'stock_adjustment', 'raw_material', m.id, { stock: m.stock }, { stock, notes });
  res.json({ ok: true, stock });
});
r.post('/raw-materials/consume', requirePerm('raw_materials'), (req, res) => {
  const { raw_material_id, qty, notes } = req.body;
  const stock = moveRawStock(raw_material_id, 'consumption', -Math.abs(Number(qty)), { notes: notes || 'Kitchen consumption', userId: req.user.id });
  res.json({ ok: true, stock });
});

// ── SHIFTS ───────────────────────────────────────────────────────────────────
function shiftComputation(shift) {
  const end = shift.closed_at || now();
  const win = [shift.user_id, shift.opened_at, end];
  const cashSales = get(`SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE kind='sale' AND method='cash' AND user_id=? AND created_at BETWEEN ? AND ?`, ...win).v;
  const cashUdhaar = get(`SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE kind='udhaar_receipt' AND method='cash' AND user_id=? AND created_at BETWEEN ? AND ?`, ...win).v;
  const cashRefunds = get(`SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE kind='refund' AND method='cash' AND user_id=? AND created_at BETWEEN ? AND ?`, ...win).v;
  const cashExpenses = get(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE payment_method='cash' AND user_id=? AND created_at BETWEEN ? AND ?`, ...win).v;
  const upiSales = get(`SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE kind='sale' AND method='upi' AND user_id=? AND created_at BETWEEN ? AND ?`, ...win).v;
  const cardSales = get(`SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE kind='sale' AND method='card' AND user_id=? AND created_at BETWEEN ? AND ?`, ...win).v;
  const bills = get(`SELECT COUNT(*) AS v FROM sales WHERE user_id=? AND status != 'held' AND created_at BETWEEN ? AND ?`, ...win).v;
  const expected = r2(shift.opening_cash + cashSales + cashUdhaar - cashRefunds - cashExpenses);
  return { cashSales: r2(cashSales), cashUdhaar: r2(cashUdhaar), cashRefunds: r2(cashRefunds), cashExpenses: r2(cashExpenses), upiSales: r2(upiSales), cardSales: r2(cardSales), bills, expected };
}

r.get('/shifts/current', requirePerm('shift'), (req, res) => {
  const shift = get("SELECT * FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY id DESC", req.user.id);
  if (!shift) return res.json(null);
  res.json({ ...shift, computation: shiftComputation(shift) });
});
r.post('/shifts/open', requirePerm('shift'), (req, res) => {
  const existing = get("SELECT * FROM shifts WHERE user_id = ? AND status = 'open'", req.user.id);
  if (existing) return res.status(400).json({ error: 'A shift is already open. Close it first.' });
  const out = run('INSERT INTO shifts(user_id,status,opened_at,opening_cash) VALUES(?,?,?,?)',
    req.user.id, 'open', now(), r2(req.body.opening_cash || 0));
  res.json(get('SELECT * FROM shifts WHERE id = ?', out.lastInsertRowid));
});
r.post('/shifts/close', requirePerm('shift'), (req, res) => {
  const shift = get("SELECT * FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY id DESC", req.user.id);
  if (!shift) return res.status(400).json({ error: 'No open shift' });
  const comp = shiftComputation(shift);
  const actual = r2(req.body.actual_cash ?? comp.expected);
  const diff = r2(actual - comp.expected);
  run("UPDATE shifts SET status='closed', closed_at=?, expected_cash=?, actual_cash=?, difference=?, notes=? WHERE id=?",
    now(), comp.expected, actual, diff, req.body.notes ?? null, shift.id);
  audit(req.user, 'shift_closed', 'shift', shift.id, null, { expected: comp.expected, actual, difference: diff });
  res.json({ ...get('SELECT * FROM shifts WHERE id = ?', shift.id), computation: comp });
});
r.get('/shifts', requirePerm('shift'), (req, res) => {
  const rows = all(`SELECT s.*, u.name AS user_name FROM shifts s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT 100`);
  res.json(rows);
});

// ── AUDIT LOG ────────────────────────────────────────────────────────────────
r.get('/audit', requirePerm('*'), (req, res) => {
  res.json(all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500'));
});

export default r;
