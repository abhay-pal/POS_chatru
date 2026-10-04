import { Router } from 'express';
import {
  get, all, run, tx, now, today, r2, audit, getSetting, nextBillNo,
  moveProductStock, creditEntry
} from '../db.js';
import { requirePerm, hasPerm } from '../perm.js';

const r = Router();

// ── totals engine (single source of truth, also used by analytics) ──────────
export function computeTotals(items, billDiscount = 0) {
  const gstOn = !!getSetting('gst_enabled', true);
  const roundOn = !!getSetting('round_off', true);
  let subtotal = 0, itemDisc = 0;
  for (const it of items) {
    it.gross = r2(it.qty * it.rate);
    subtotal = r2(subtotal + it.gross);
    itemDisc = r2(itemDisc + (it.discount || 0));
  }
  billDiscount = r2(billDiscount || 0);
  const netBase = Math.max(subtotal - itemDisc, 0.0001);
  let tax = 0;
  for (const it of items) {
    const itNet = Math.max(it.gross - (it.discount || 0), 0);
    const share = itNet - billDiscount * (itNet / netBase);
    it.amount = r2(itNet);
    it.tax = gstOn ? r2(share * (it.gst_rate || 0) / 100) : 0;
    tax = r2(tax + it.tax);
  }
  const raw = r2(subtotal - itemDisc - billDiscount + tax);
  const total = roundOn ? Math.round(raw) : raw;
  const round_off = r2(total - raw);
  return { subtotal, item_discount: itemDisc, discount: billDiscount, tax, round_off, total: r2(total) };
}

function hydrateItems(items) {
  return items.map(it => {
    const p = it.product_id ? get('SELECT * FROM products WHERE id = ?', it.product_id) : null;
    return {
      product_id: p ? p.id : null,
      name: it.name || (p ? p.name : 'Item'),
      unit: it.unit || (p ? p.unit : 'piece'),
      qty: Number(it.qty),
      rate: r2(it.rate ?? (p ? p.price : 0)),
      discount: r2(it.discount || 0),
      gst_rate: r2(it.gst_rate ?? (p ? p.gst_rate : 0)),
      cost: r2(p ? p.cost_price * Number(it.qty) : 0),
      notes: it.notes || null,
      track_stock: p ? p.track_stock : 0
    };
  });
}

function checkDiscountPerm(req, totals) {
  const limitPct = Number(getSetting('discount_limit_pct', 10));
  const discTotal = totals.discount + totals.item_discount;
  if (totals.subtotal > 0 && (discTotal / totals.subtotal) * 100 > limitPct && !hasPerm(req.user, 'large_discount')) {
    const pct = r2((discTotal / totals.subtotal) * 100);
    const err = new Error(`Discount ${pct}% exceeds limit of ${limitPct}%. Manager/Owner permission required.`);
    err.status = 403;
    throw err;
  }
}

function saveItems(saleId, items) {
  run('DELETE FROM sale_items WHERE sale_id = ?', saleId);
  for (const it of items) {
    run(`INSERT INTO sale_items(sale_id,product_id,name,unit,qty,rate,discount,gst_rate,cost,amount,notes)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      saleId, it.product_id, it.name, it.unit, it.qty, it.rate, it.discount, it.gst_rate, it.cost, it.amount, it.notes);
  }
}

function currentShiftId(userId) {
  const s = get("SELECT id FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY id DESC", userId);
  return s ? s.id : null;
}

export function saleFull(id) {
  const sale = get(`SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS cashier_name
                    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id
                    WHERE s.id = ?`, id);
  if (!sale) return null;
  sale.items = all('SELECT * FROM sale_items WHERE sale_id = ?', id);
  sale.payments = all('SELECT * FROM payments WHERE sale_id = ? ORDER BY id', id);
  sale.returns = all('SELECT * FROM returns WHERE sale_id = ?', id);
  return sale;
}

// ── HOLD / SAVE BILL ─────────────────────────────────────────────────────────
r.post('/sales/hold', requirePerm('pos'), (req, res) => {
  const { id, customer_id, items = [], discount = 0, notes } = req.body;
  if (!items.length) return res.status(400).json({ error: 'Add at least one item' });
  const hydrated = hydrateItems(items);
  const totals = computeTotals(hydrated, discount);
  const result = tx(() => {
    let saleId = id;
    if (saleId) {
      const old = get("SELECT * FROM sales WHERE id = ? AND status = 'held'", saleId);
      if (!old) throw new Error('Held bill not found or already finalized');
      run(`UPDATE sales SET customer_id=?, subtotal=?, discount=?, tax=?, round_off=?, total=?, notes=? WHERE id=?`,
        customer_id ?? null, totals.subtotal, r2(totals.discount + totals.item_discount), totals.tax, totals.round_off, totals.total, notes ?? null, saleId);
    } else {
      const out = run(`INSERT INTO sales(bill_no,status,customer_id,user_id,shift_id,subtotal,discount,tax,round_off,total,paid,udhaar_amount,notes,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,0,0,?,?)`,
        nextBillNo(), 'held', customer_id ?? null, req.user.id, currentShiftId(req.user.id),
        totals.subtotal, r2(totals.discount + totals.item_discount), totals.tax, totals.round_off, totals.total, notes ?? null, now());
      saleId = out.lastInsertRowid;
    }
    saveItems(saleId, hydrated);
    return saleFull(saleId);
  });
  res.json(result);
});

r.get('/sales/held', requirePerm('pos'), (req, res) => {
  const rows = all(`SELECT s.*, c.name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
                    WHERE s.status = 'held' ORDER BY s.created_at DESC`);
  for (const s of rows) s.items = all('SELECT * FROM sale_items WHERE sale_id = ?', s.id);
  res.json(rows);
});

r.delete('/sales/held/:id', requirePerm('pos'), (req, res) => {
  const old = get("SELECT * FROM sales WHERE id = ? AND status = 'held'", req.params.id);
  if (!old) return res.status(404).json({ error: 'Held bill not found' });
  tx(() => {
    run('DELETE FROM sale_items WHERE sale_id = ?', old.id);
    run('DELETE FROM sales WHERE id = ?', old.id);
  });
  audit(req.user, 'held_bill_discarded', 'sale', old.id, { bill_no: old.bill_no, total: old.total }, null);
  res.json({ ok: true });
});

// ── CHECKOUT / FINALIZE ──────────────────────────────────────────────────────
r.post('/sales/checkout', requirePerm('pos'), (req, res) => {
  const { id, customer_id, items = [], discount = 0, notes, payments = [] } = req.body;
  if (!items.length) return res.status(400).json({ error: 'Cart is empty' });

  const hydrated = hydrateItems(items);
  const totals = computeTotals(hydrated, discount);
  try { checkDiscountPerm(req, totals); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

  const paid = r2(payments.filter(p => p.method !== 'udhaar').reduce((a, p) => a + Number(p.amount || 0), 0));
  const udhaar = r2(totals.total - paid);
  if (udhaar < -0.01) return res.status(400).json({ error: 'Payment exceeds bill total' });
  if (udhaar > 0.01 && !customer_id) return res.status(400).json({ error: 'Udhaar sale requires a customer. Please select or add the customer.' });

  const result = tx(() => {
    let saleId = id, billNo;
    const ts = now();
    if (saleId) {
      const old = get("SELECT * FROM sales WHERE id = ? AND status = 'held'", saleId);
      if (!old) throw new Error('Held bill not found or already finalized');
      billNo = old.bill_no;
      run(`UPDATE sales SET status='completed', customer_id=?, subtotal=?, discount=?, tax=?, round_off=?, total=?, paid=?, udhaar_amount=?, notes=?, completed_at=?, shift_id=? WHERE id=?`,
        customer_id ?? null, totals.subtotal, r2(totals.discount + totals.item_discount), totals.tax, totals.round_off, totals.total,
        paid, Math.max(udhaar, 0), notes ?? null, ts, currentShiftId(req.user.id), saleId);
    } else {
      billNo = nextBillNo();
      const out = run(`INSERT INTO sales(bill_no,status,customer_id,user_id,shift_id,subtotal,discount,tax,round_off,total,paid,udhaar_amount,notes,created_at,completed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        billNo, 'completed', customer_id ?? null, req.user.id, currentShiftId(req.user.id),
        totals.subtotal, r2(totals.discount + totals.item_discount), totals.tax, totals.round_off, totals.total,
        paid, Math.max(udhaar, 0), notes ?? null, ts, ts);
      saleId = out.lastInsertRowid;
    }
    saveItems(saleId, hydrated);

    // inventory deduction
    for (const it of hydrated) {
      if (it.product_id && it.track_stock) {
        moveProductStock(it.product_id, 'sale', -it.qty, { refType: 'sale', refId: saleId, notes: billNo, userId: req.user.id, at: ts });
      }
    }
    // payment rows
    for (const p of payments.filter(p0 => p0.method !== 'udhaar' && Number(p0.amount) > 0)) {
      run(`INSERT INTO payments(kind,sale_id,customer_id,method,amount,received,change,reference,notes,user_id,shift_id,created_at)
           VALUES('sale',?,?,?,?,?,?,?,?,?,?,?)`,
        saleId, customer_id ?? null, p.method, r2(p.amount),
        p.received != null ? r2(p.received) : null,
        p.received != null ? r2(p.received - p.amount) : null,
        p.reference ?? null, p.notes ?? null, req.user.id, currentShiftId(req.user.id), ts);
    }
    // udhaar portion → customer ledger
    if (udhaar > 0.01) {
      creditEntry(customer_id, 'sale', udhaar, { saleId, notes: `Bill ${billNo}`, userId: req.user.id, at: ts });
    }
    return saleFull(saleId);
  });
  res.json(result);
});

// ── SALES HISTORY ────────────────────────────────────────────────────────────
r.get('/sales', requirePerm('sales_history'), (req, res) => {
  const { q, status, from, to, customer_id, limit = 100, offset = 0 } = req.query;
  let sql = `SELECT s.*, c.name AS customer_name, u.name AS cashier_name,
             (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
             FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id WHERE 1=1`;
  const params = [];
  if (q) { sql += ' AND (s.bill_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (status) { sql += ' AND s.status = ?'; params.push(status); }
  if (customer_id) { sql += ' AND s.customer_id = ?'; params.push(customer_id); }
  if (from) { sql += ' AND substr(s.created_at,1,10) >= ?'; params.push(from); }
  if (to) { sql += ' AND substr(s.created_at,1,10) <= ?'; params.push(to); }
  sql += ' ORDER BY s.id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  res.json(all(sql, ...params));
});

r.get('/sales/:id', requirePerm('sales_history'), (req, res) => {
  const s = saleFull(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

// receipt payload (sale + business + settings) for printing / reprinting
r.get('/sales/:id/receipt', (req, res) => {
  const s = saleFull(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json({
    sale: s,
    business: get('SELECT * FROM business WHERE id = 1'),
    settings: {
      receipt_size: getSetting('receipt_size', '80'),
      receipt_footer: getSetting('receipt_footer', 'Thank You! Visit Again'),
      gst_enabled: getSetting('gst_enabled', true)
    }
  });
});

// ── CANCEL ───────────────────────────────────────────────────────────────────
r.post('/sales/:id/cancel', requirePerm('cancel_bill'), (req, res) => {
  const sale = saleFull(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Not found' });
  if (sale.status !== 'completed') return res.status(400).json({ error: 'Only completed bills can be cancelled' });
  const reason = req.body.reason || 'Cancelled';
  tx(() => {
    const ts = now();
    // restock items
    for (const it of sale.items) {
      if (it.product_id) {
        const p = get('SELECT track_stock FROM products WHERE id = ?', it.product_id);
        if (p && p.track_stock) moveProductStock(it.product_id, 'return', it.qty, { refType: 'cancel', refId: sale.id, notes: `Cancel ${sale.bill_no}`, userId: req.user.id, at: ts });
      }
    }
    // refund received money
    for (const p of sale.payments.filter(x => x.kind === 'sale')) {
      run(`INSERT INTO payments(kind,sale_id,customer_id,method,amount,notes,user_id,shift_id,created_at)
           VALUES('refund',?,?,?,?,?,?,?,?)`,
        sale.id, sale.customer_id, p.method, r2(p.amount), `Cancel ${sale.bill_no}`, req.user.id, currentShiftId(req.user.id), ts);
    }
    // reverse udhaar
    if (sale.udhaar_amount > 0 && sale.customer_id) {
      creditEntry(sale.customer_id, 'adjustment', -sale.udhaar_amount, { saleId: sale.id, notes: `Bill ${sale.bill_no} cancelled`, userId: req.user.id, at: ts });
    }
    run("UPDATE sales SET status='cancelled', cancel_reason=? WHERE id=?", reason, sale.id);
  });
  audit(req.user, 'bill_cancelled', 'sale', sale.id, { bill_no: sale.bill_no, total: sale.total, status: 'completed' }, { status: 'cancelled', reason });
  res.json(saleFull(sale.id));
});

// ── RETURNS / REFUND ─────────────────────────────────────────────────────────
r.post('/sales/:id/refund', requirePerm('refund'), (req, res) => {
  const sale = saleFull(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Not found' });
  if (!['completed', 'partial_refund'].includes(sale.status)) return res.status(400).json({ error: 'This bill cannot be refunded' });
  const { items = [], method = 'cash', reason, restock = true } = req.body;
  if (!items.length) return res.status(400).json({ error: 'Select at least one item to return' });

  const result = tx(() => {
    const ts = now();
    let totalRefund = 0;
    const lines = [];
    for (const it of items) {
      const si = sale.items.find(x => x.id === it.sale_item_id);
      if (!si) throw new Error('Invalid sale item');
      const prevReturned = get(`SELECT COALESCE(SUM(ri.qty),0) AS q FROM return_items ri JOIN returns rt ON rt.id = ri.return_id WHERE ri.sale_item_id = ?`, si.id).q;
      const qty = Number(it.qty);
      if (qty <= 0 || qty > si.qty - prevReturned + 0.0001) throw new Error(`Invalid return qty for ${si.name}`);
      const amount = r2(qty * si.rate * (si.amount / Math.max(si.qty * si.rate, 0.0001))); // respect item discount proportionally
      totalRefund = r2(totalRefund + amount);
      lines.push({ si, qty, amount });
    }
    const out = run(`INSERT INTO returns(sale_id,bill_no,date,total_refund,method,reason,restock,user_id,created_at)
                     VALUES(?,?,?,?,?,?,?,?,?)`,
      sale.id, sale.bill_no, ts.slice(0, 10), totalRefund, method, reason ?? null, restock ? 1 : 0, req.user.id, ts);
    const retId = out.lastInsertRowid;
    for (const l of lines) {
      run('INSERT INTO return_items(return_id,sale_item_id,product_id,name,qty,rate,amount) VALUES(?,?,?,?,?,?,?)',
        retId, l.si.id, l.si.product_id, l.si.name, l.qty, l.si.rate, l.amount);
      if (restock && l.si.product_id) {
        const p = get('SELECT track_stock FROM products WHERE id = ?', l.si.product_id);
        if (p && p.track_stock) moveProductStock(l.si.product_id, 'return', l.qty, { refType: 'return', refId: retId, notes: `Return ${sale.bill_no}`, userId: req.user.id, at: ts });
      }
    }
    if (method === 'udhaar') {
      if (!sale.customer_id) throw new Error('No customer on this bill for udhaar adjustment');
      creditEntry(sale.customer_id, 'refund', -totalRefund, { saleId: sale.id, notes: `Return against ${sale.bill_no}`, userId: req.user.id, at: ts });
    } else {
      run(`INSERT INTO payments(kind,sale_id,customer_id,method,amount,notes,user_id,shift_id,created_at)
           VALUES('refund',?,?,?,?,?,?,?,?)`,
        sale.id, sale.customer_id, method, totalRefund, `Return against ${sale.bill_no}`, req.user.id, currentShiftId(req.user.id), ts);
    }
    const refundedSoFar = get('SELECT COALESCE(SUM(total_refund),0) AS t FROM returns WHERE sale_id = ?', sale.id).t;
    run('UPDATE sales SET status = ? WHERE id = ?', refundedSoFar >= sale.total - 0.01 ? 'refunded' : 'partial_refund', sale.id);
    return { return_id: retId, total_refund: totalRefund };
  });
  audit(req.user, 'refund', 'sale', sale.id, { bill_no: sale.bill_no }, { ...result, method, reason });
  res.json({ ...result, sale: saleFull(sale.id) });
});

r.get('/returns', requirePerm('sales_history'), (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT rt.*, u.name AS user_name FROM returns rt LEFT JOIN users u ON u.id = rt.user_id WHERE 1=1`;
  const params = [];
  if (from) { sql += ' AND rt.date >= ?'; params.push(from); }
  if (to) { sql += ' AND rt.date <= ?'; params.push(to); }
  sql += ' ORDER BY rt.id DESC LIMIT 200';
  const rows = all(sql, ...params);
  for (const row of rows) row.items = all('SELECT * FROM return_items WHERE return_id = ?', row.id);
  res.json(rows);
});

// ── UDHAAR ───────────────────────────────────────────────────────────────────
r.get('/udhaar/summary', requirePerm('udhaar'), (req, res) => {
  const customers = all(`SELECT c.*, (SELECT MAX(created_at) FROM credit_transactions ct WHERE ct.customer_id = c.id) AS last_activity
                         FROM customers c WHERE c.balance > 0.009 ORDER BY c.balance DESC`);
  const totals = get(`SELECT
    COALESCE((SELECT SUM(balance) FROM customers WHERE balance > 0),0) AS total_outstanding,
    COALESCE((SELECT SUM(amount) FROM credit_transactions WHERE type IN ('sale','opening')),0) AS total_udhaar_given,
    COALESCE((SELECT -SUM(amount) FROM credit_transactions WHERE type = 'payment'),0) AS total_received`);
  const todayRow = get(`SELECT
    COALESCE((SELECT SUM(amount) FROM credit_transactions WHERE type='sale' AND substr(created_at,1,10)=?),0) AS today_udhaar,
    COALESCE((SELECT -SUM(amount) FROM credit_transactions WHERE type='payment' AND substr(created_at,1,10)=?),0) AS today_received`,
    today(), today());
  res.json({ customers, ...totals, ...todayRow });
});

r.post('/udhaar/receive', requirePerm('receive_udhaar'), (req, res) => {
  const { customer_id, amount, method = 'cash', date, reference, notes } = req.body;
  const amt = r2(Number(amount));
  if (!customer_id || !(amt > 0)) return res.status(400).json({ error: 'Customer and a positive amount are required' });
  const cust = get('SELECT * FROM customers WHERE id = ?', customer_id);
  if (!cust) return res.status(404).json({ error: 'Customer not found' });
  const result = tx(() => {
    const ts = date ? `${date} ${now().slice(11)}` : now();
    const pay = run(`INSERT INTO payments(kind,customer_id,method,amount,reference,notes,user_id,shift_id,created_at)
                     VALUES('udhaar_receipt',?,?,?,?,?,?,?,?)`,
      customer_id, method, amt, reference ?? null, notes ?? null, req.user.id, currentShiftId(req.user.id), ts);
    const bal = creditEntry(customer_id, 'payment', -amt, { paymentId: pay.lastInsertRowid, method, reference, notes, userId: req.user.id, at: ts });
    return { payment_id: pay.lastInsertRowid, balance: bal };
  });
  audit(req.user, 'udhaar_payment_received', 'customer', customer_id, { balance: cust.balance }, { received: amt, balance: result.balance, method });
  res.json(result);
});

// customer ledger (date-wise entries + running balance)
r.get('/customers/:id/ledger', requirePerm('udhaar'), (req, res) => {
  const { from, to } = req.query;
  const customer = get('SELECT * FROM customers WHERE id = ?', req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  let opening = 0;
  if (from) {
    const row = get('SELECT COALESCE(SUM(amount),0) AS s FROM credit_transactions WHERE customer_id = ? AND substr(created_at,1,10) < ?', req.params.id, from);
    opening = r2(row.s);
  }
  let sql = 'SELECT * FROM credit_transactions WHERE customer_id = ?';
  const params = [req.params.id];
  if (from) { sql += ' AND substr(created_at,1,10) >= ?'; params.push(from); }
  if (to) { sql += ' AND substr(created_at,1,10) <= ?'; params.push(to); }
  sql += ' ORDER BY created_at, id';
  const entries = all(sql, ...params);
  let bal = opening;
  for (const e of entries) {
    bal = r2(bal + e.amount);
    e.running_balance = bal;
    if (e.sale_id && e.type === 'sale') {
      e.bill = get('SELECT bill_no FROM sales WHERE id = ?', e.sale_id)?.bill_no;
      e.items = all('SELECT name, qty, unit, rate, amount FROM sale_items WHERE sale_id = ?', e.sale_id);
      const sal = get('SELECT total, paid FROM sales WHERE id = ?', e.sale_id);
      e.bill_total = sal?.total; e.paid_at_sale = sal?.paid;
    }
  }
  const totals = {
    opening,
    total_debits: r2(entries.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0)),
    total_credits: r2(-entries.filter(e => e.amount < 0).reduce((a, e) => a + e.amount, 0)),
    closing: bal,
    current_balance: customer.balance
  };
  res.json({ customer, entries, totals, business: get('SELECT * FROM business WHERE id = 1') });
});

export default r;
