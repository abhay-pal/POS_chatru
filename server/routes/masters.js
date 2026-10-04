import { Router } from 'express';
import { get, all, run, tx, now, r2, audit, setSetting, allSettings, moveProductStock } from '../db.js';
import { requirePerm, DEFAULT_PERMS, permsFor } from '../perm.js';

const r = Router();

// ── business profile + settings ──────────────────────────────────────────────
r.get('/business', (req, res) => {
  res.json(get('SELECT * FROM business WHERE id = 1') || {});
});
r.put('/business', requirePerm('*'), (req, res) => {
  const b = req.body;
  const old = get('SELECT * FROM business WHERE id = 1');
  run(`UPDATE business SET name=?, tagline=?, logo=?, address=?, phone=?, gstin=?, fssai=?, email=? WHERE id=1`,
    b.name, b.tagline ?? null, b.logo ?? null, b.address ?? null, b.phone ?? null, b.gstin ?? null, b.fssai ?? null, b.email ?? null);
  audit(req.user, 'business_updated', 'business', 1, old, b);
  res.json(get('SELECT * FROM business WHERE id = 1'));
});

r.get('/settings', (req, res) => res.json(allSettings()));
r.put('/settings', requirePerm('*'), (req, res) => {
  const old = allSettings();
  for (const [k, v] of Object.entries(req.body || {})) setSetting(k, v);
  audit(req.user, 'settings_updated', 'settings', null, old, req.body);
  res.json(allSettings());
});

// ── categories ───────────────────────────────────────────────────────────────
r.get('/categories', (req, res) => {
  res.json(all(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS product_count
                FROM categories c ORDER BY c.sort_order, c.name`));
});
r.post('/categories', requirePerm('categories'), (req, res) => {
  const { name, name_hi, icon, sort_order } = req.body;
  const out = run('INSERT INTO categories(name,name_hi,icon,sort_order,active) VALUES(?,?,?,?,1)',
    name, name_hi ?? null, icon ?? null, sort_order ?? 0);
  res.json(get('SELECT * FROM categories WHERE id = ?', out.lastInsertRowid));
});
r.put('/categories/:id', requirePerm('categories'), (req, res) => {
  const { name, name_hi, icon, sort_order, active } = req.body;
  run('UPDATE categories SET name=?, name_hi=?, icon=?, sort_order=?, active=? WHERE id=?',
    name, name_hi ?? null, icon ?? null, sort_order ?? 0, active ? 1 : 0, req.params.id);
  res.json(get('SELECT * FROM categories WHERE id = ?', req.params.id));
});

// ── products ─────────────────────────────────────────────────────────────────
r.get('/products', (req, res) => {
  const { q, category_id, active, low_stock } = req.query;
  let sql = `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE 1=1`;
  const params = [];
  if (q) { sql += ' AND (p.name LIKE ? OR p.name_hi LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  if (category_id) { sql += ' AND p.category_id = ?'; params.push(category_id); }
  if (active !== undefined) { sql += ' AND p.active = ?'; params.push(active === 'false' ? 0 : 1); }
  if (low_stock === '1') sql += ' AND p.track_stock = 1 AND p.stock <= p.min_stock';
  sql += ' ORDER BY p.name';
  res.json(all(sql, ...params));
});

const PROD_FIELDS = ['sku', 'name', 'name_hi', 'category_id', 'unit', 'price', 'cost_price', 'gst_rate', 'min_stock', 'barcode', 'image', 'emoji', 'track_stock', 'active'];
r.post('/products', requirePerm('products'), (req, res) => {
  const b = req.body;
  const out = run(`INSERT INTO products(sku,name,name_hi,category_id,unit,price,cost_price,gst_rate,stock,min_stock,barcode,image,emoji,track_stock,active,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    b.sku ?? null, b.name, b.name_hi ?? null, b.category_id ?? null, b.unit || 'kg',
    r2(b.price || 0), r2(b.cost_price || 0), r2(b.gst_rate || 0), 0, r2(b.min_stock || 0),
    b.barcode ?? null, b.image ?? null, b.emoji ?? null, b.track_stock === false ? 0 : 1, 1, now());
  const id = out.lastInsertRowid;
  if (Number(b.opening_stock) > 0) {
    moveProductStock(id, 'opening', Number(b.opening_stock), { notes: 'Opening stock', userId: req.user.id });
  }
  audit(req.user, 'product_created', 'product', id, null, b);
  res.json(get('SELECT * FROM products WHERE id = ?', id));
});

r.put('/products/:id', requirePerm('products'), (req, res) => {
  const old = get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  if (r2(b.price) !== r2(old.price) || r2(b.cost_price) !== r2(old.cost_price)) {
    audit(req.user, 'price_changed', 'product', old.id,
      { price: old.price, cost_price: old.cost_price }, { price: b.price, cost_price: b.cost_price });
  }
  run(`UPDATE products SET sku=?, name=?, name_hi=?, category_id=?, unit=?, price=?, cost_price=?, gst_rate=?, min_stock=?, barcode=?, image=?, emoji=?, track_stock=?, active=? WHERE id=?`,
    b.sku ?? null, b.name, b.name_hi ?? null, b.category_id ?? null, b.unit || old.unit,
    r2(b.price ?? old.price), r2(b.cost_price ?? old.cost_price), r2(b.gst_rate ?? old.gst_rate),
    r2(b.min_stock ?? old.min_stock), b.barcode ?? null, b.image ?? null, b.emoji ?? old.emoji,
    b.track_stock === false ? 0 : 1, b.active === false ? 0 : 1, req.params.id);
  res.json(get('SELECT * FROM products WHERE id = ?', req.params.id));
});

r.get('/products/export', (req, res) => {
  const rows = all(`SELECT p.id, p.sku, p.name, p.name_hi, c.name AS category, p.unit, p.price, p.cost_price, p.gst_rate, p.stock, p.min_stock, p.active
                    FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.name`);
  const cols = Object.keys(rows[0] || { id: 1 });
  const csv = [cols.join(','), ...rows.map(r0 => cols.map(c => JSON.stringify(r0[c] ?? '')).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=products.csv');
  res.send(csv);
});

r.post('/products/import', requirePerm('products'), (req, res) => {
  const rows = req.body.rows || [];
  let created = 0, updated = 0;
  tx(() => {
    for (const row of rows) {
      if (!row.name) continue;
      let catId = null;
      if (row.category) {
        const c = get('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)', String(row.category).trim());
        catId = c ? c.id : run('INSERT INTO categories(name,active) VALUES(?,1)', String(row.category).trim()).lastInsertRowid;
      }
      const existing = get('SELECT id FROM products WHERE LOWER(name) = LOWER(?)', String(row.name).trim());
      if (existing) {
        run('UPDATE products SET price=?, cost_price=?, gst_rate=?, unit=?, min_stock=?, category_id=COALESCE(?,category_id) WHERE id=?',
          r2(row.price || 0), r2(row.cost_price || 0), r2(row.gst_rate || 0), row.unit || 'kg', r2(row.min_stock || 0), catId, existing.id);
        updated++;
      } else {
        run(`INSERT INTO products(sku,name,name_hi,category_id,unit,price,cost_price,gst_rate,stock,min_stock,track_stock,active,created_at)
             VALUES(?,?,?,?,?,?,?,?,0,?,1,1,?)`,
          row.sku ?? null, String(row.name).trim(), row.name_hi ?? null, catId, row.unit || 'kg',
          r2(row.price || 0), r2(row.cost_price || 0), r2(row.gst_rate || 0), r2(row.min_stock || 0), now());
        created++;
      }
    }
  });
  audit(req.user, 'products_imported', 'product', null, null, { created, updated });
  res.json({ created, updated });
});

// ── customers ────────────────────────────────────────────────────────────────
r.get('/customers', (req, res) => {
  const { q, with_balance, limit } = req.query;
  let sql = `SELECT * FROM customers WHERE 1=1`;
  const params = [];
  if (q) { sql += ' AND (name LIKE ? OR phone LIKE ? OR CAST(id AS TEXT) = ?)'; params.push(`%${q}%`, `%${q}%`, q); }
  if (with_balance === '1') sql += ' AND balance > 0';
  sql += with_balance === '1' ? ' ORDER BY balance DESC' : ' ORDER BY name';
  if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }
  res.json(all(sql, ...params));
});
r.post('/customers', requirePerm('customers'), (req, res) => {
  const b = req.body;
  const opening = r2(b.opening_balance || 0);
  const result = tx(() => {
    const out = run('INSERT INTO customers(name,phone,address,notes,opening_balance,balance,created_at) VALUES(?,?,?,?,?,?,?)',
      b.name, b.phone ?? null, b.address ?? null, b.notes ?? null, opening, 0, now());
    const id = out.lastInsertRowid;
    if (opening !== 0) {
      run(`INSERT INTO credit_transactions(customer_id,type,amount,balance_after,notes,user_id,created_at)
           VALUES(?,?,?,?,?,?,?)`, id, 'opening', opening, opening, 'Opening balance', req.user.id, now());
      run('UPDATE customers SET balance = ? WHERE id = ?', opening, id);
    }
    return get('SELECT * FROM customers WHERE id = ?', id);
  });
  audit(req.user, 'customer_created', 'customer', result.id, null, b);
  res.json(result);
});
r.put('/customers/:id', requirePerm('customers'), (req, res) => {
  const b = req.body;
  run('UPDATE customers SET name=?, phone=?, address=?, notes=? WHERE id=?',
    b.name, b.phone ?? null, b.address ?? null, b.notes ?? null, req.params.id);
  res.json(get('SELECT * FROM customers WHERE id = ?', req.params.id));
});

// ── suppliers ────────────────────────────────────────────────────────────────
r.get('/suppliers', (req, res) => {
  res.json(all(`
    SELECT s.*,
      COALESCE((SELECT SUM(total) FROM purchases WHERE supplier_id = s.id),0) AS total_purchase,
      COALESCE((SELECT SUM(paid) FROM purchases WHERE supplier_id = s.id),0)
        + COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id),0) AS total_paid,
      (SELECT MAX(date) FROM purchases WHERE supplier_id = s.id) AS last_purchase
    FROM suppliers s ORDER BY s.name`));
});
r.post('/suppliers', requirePerm('purchases'), (req, res) => {
  const b = req.body;
  const out = run('INSERT INTO suppliers(name,phone,address,gstin,notes,created_at) VALUES(?,?,?,?,?,?)',
    b.name, b.phone ?? null, b.address ?? null, b.gstin ?? null, b.notes ?? null, now());
  res.json(get('SELECT * FROM suppliers WHERE id = ?', out.lastInsertRowid));
});
r.put('/suppliers/:id', requirePerm('purchases'), (req, res) => {
  const b = req.body;
  run('UPDATE suppliers SET name=?, phone=?, address=?, gstin=?, notes=? WHERE id=?',
    b.name, b.phone ?? null, b.address ?? null, b.gstin ?? null, b.notes ?? null, req.params.id);
  res.json(get('SELECT * FROM suppliers WHERE id = ?', req.params.id));
});
r.get('/suppliers/:id/ledger', (req, res) => {
  const supplier = get('SELECT * FROM suppliers WHERE id = ?', req.params.id);
  const purchases = all('SELECT * FROM purchases WHERE supplier_id = ? ORDER BY date, id', req.params.id);
  const pays = all('SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY date, id', req.params.id);
  const entries = [
    ...purchases.map(p => ({ date: p.date, type: 'purchase', ref: p.invoice_no || `PUR-${p.id}`, debit: p.total, credit: p.paid, notes: p.notes })),
    ...pays.map(p => ({ date: p.date, type: 'payment', ref: p.reference || `PAY-${p.id}`, debit: 0, credit: p.amount, notes: p.notes }))
  ].sort((a, b) => a.date < b.date ? -1 : 1);
  let bal = 0;
  for (const e of entries) { bal = r2(bal + e.debit - e.credit); e.balance = bal; }
  res.json({ supplier, entries, outstanding: bal });
});
r.post('/suppliers/:id/pay', requirePerm('purchases'), (req, res) => {
  const b = req.body;
  const out = run('INSERT INTO supplier_payments(supplier_id,purchase_id,amount,method,reference,notes,date,user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    req.params.id, b.purchase_id ?? null, r2(b.amount), b.method || 'cash', b.reference ?? null, b.notes ?? null, b.date || now().slice(0, 10), req.user.id, now());
  audit(req.user, 'supplier_payment', 'supplier', Number(req.params.id), null, b);
  res.json({ id: out.lastInsertRowid });
});

// ── raw materials ────────────────────────────────────────────────────────────
r.get('/raw-materials', (req, res) => {
  res.json(all('SELECT * FROM raw_materials WHERE active = 1 ORDER BY name'));
});
r.post('/raw-materials', requirePerm('raw_materials'), (req, res) => {
  const b = req.body;
  const out = run('INSERT INTO raw_materials(name,name_hi,unit,stock,min_stock,avg_rate,active,created_at) VALUES(?,?,?,0,?,?,1,?)',
    b.name, b.name_hi ?? null, b.unit || 'kg', r2(b.min_stock || 0), r2(b.avg_rate || 0), now());
  res.json(get('SELECT * FROM raw_materials WHERE id = ?', out.lastInsertRowid));
});
r.put('/raw-materials/:id', requirePerm('raw_materials'), (req, res) => {
  const b = req.body;
  run('UPDATE raw_materials SET name=?, name_hi=?, unit=?, min_stock=?, avg_rate=?, active=? WHERE id=?',
    b.name, b.name_hi ?? null, b.unit || 'kg', r2(b.min_stock || 0), r2(b.avg_rate || 0), b.active === false ? 0 : 1, req.params.id);
  res.json(get('SELECT * FROM raw_materials WHERE id = ?', req.params.id));
});

// ── expense categories ───────────────────────────────────────────────────────
r.get('/expense-categories', (req, res) => res.json(all('SELECT * FROM expense_categories ORDER BY name')));
r.post('/expense-categories', requirePerm('expenses'), (req, res) => {
  const out = run('INSERT OR IGNORE INTO expense_categories(name) VALUES(?)', req.body.name);
  res.json(get('SELECT * FROM expense_categories WHERE name = ?', req.body.name));
});

// ── staff ────────────────────────────────────────────────────────────────────
r.get('/staff', requirePerm('*'), (req, res) => {
  res.json(all('SELECT id, name, username, role, phone, active, created_at FROM users ORDER BY id'));
});
r.post('/staff', requirePerm('*'), (req, res) => {
  const b = req.body;
  const out = run('INSERT INTO users(name,username,password,role,phone,active,created_at) VALUES(?,?,?,?,?,1,?)',
    b.name, String(b.username).toLowerCase(), b.password, b.role || 'cashier', b.phone ?? null, now());
  audit(req.user, 'staff_created', 'user', out.lastInsertRowid, null, { name: b.name, role: b.role });
  res.json(get('SELECT id, name, username, role, phone, active FROM users WHERE id = ?', out.lastInsertRowid));
});
r.put('/staff/:id', requirePerm('*'), (req, res) => {
  const b = req.body;
  const old = get('SELECT id, name, role, active FROM users WHERE id = ?', req.params.id);
  if (b.password) {
    run('UPDATE users SET name=?, role=?, phone=?, active=?, password=? WHERE id=?',
      b.name, b.role, b.phone ?? null, b.active === false ? 0 : 1, b.password, req.params.id);
  } else {
    run('UPDATE users SET name=?, role=?, phone=?, active=? WHERE id=?',
      b.name, b.role, b.phone ?? null, b.active === false ? 0 : 1, req.params.id);
  }
  audit(req.user, 'staff_updated', 'user', Number(req.params.id), old, { name: b.name, role: b.role, active: b.active });
  res.json(get('SELECT id, name, username, role, phone, active FROM users WHERE id = ?', req.params.id));
});
r.get('/role-permissions', requirePerm('*'), (req, res) => {
  res.json({ defaults: DEFAULT_PERMS, current: { owner: permsFor('owner'), manager: permsFor('manager'), cashier: permsFor('cashier') } });
});
r.put('/role-permissions', requirePerm('*'), (req, res) => {
  setSetting('role_permissions', req.body);
  audit(req.user, 'permissions_updated', 'settings', null, null, req.body);
  res.json({ ok: true });
});

export default r;
