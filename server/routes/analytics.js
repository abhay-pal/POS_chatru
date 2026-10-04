import { Router } from 'express';
import { get, all, today, r2 } from '../db.js';
import { requirePerm } from '../perm.js';

const r = Router();

// Completed-business statuses. Cancelled bills NEVER count in sales.
const LIVE = `('completed','partial_refund','refunded')`;
const D = `substr(s.created_at,1,10)`;

function range(req) {
  const from = req.query.from || today();
  const to = req.query.to || today();
  return { from, to };
}

function kpis(from, to) {
  const sale = get(`SELECT COALESCE(SUM(total),0) AS gross, COUNT(*) AS bills,
      COALESCE(SUM(tax),0) AS tax, COALESCE(SUM(discount),0) AS discount,
      COALESCE(SUM(udhaar_amount),0) AS udhaar_sales
    FROM sales s WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ?`, from, to);
  const returns = get(`SELECT COALESCE(SUM(total_refund),0) AS v FROM returns WHERE date BETWEEN ? AND ?`, from, to).v;
  const pay = (method) => get(`SELECT COALESCE(SUM(amount),0) AS v FROM payments p
      WHERE p.kind='sale' AND p.method=? AND substr(p.created_at,1,10) BETWEEN ? AND ?`, method, from, to).v;
  const udhaarReceived = get(`SELECT COALESCE(SUM(amount),0) AS v FROM payments
      WHERE kind='udhaar_receipt' AND substr(created_at,1,10) BETWEEN ? AND ?`, from, to).v;
  const refunds = get(`SELECT COALESCE(SUM(amount),0) AS v FROM payments
      WHERE kind='refund' AND substr(created_at,1,10) BETWEEN ? AND ?`, from, to).v;
  const expenses = get(`SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE date BETWEEN ? AND ?`, from, to).v;
  const wastage = get(`SELECT COALESCE(SUM(cost),0) AS v FROM wastage WHERE date BETWEEN ? AND ?`, from, to).v;
  const cogs = get(`SELECT COALESCE(SUM(si.cost),0) AS v FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ?`, from, to).v;
  const purchases = get(`SELECT COALESCE(SUM(total),0) AS v FROM purchases WHERE date BETWEEN ? AND ?`, from, to).v;
  const pendingUdhaar = get(`SELECT COALESCE(SUM(balance),0) AS v FROM customers WHERE balance > 0`).v;
  const lowStock = get(`SELECT COUNT(*) AS v FROM products WHERE active=1 AND track_stock=1 AND stock <= min_stock`).v;

  const net_sales = r2(sale.gross - returns);
  const gross_profit = r2(net_sales - sale.tax - cogs);
  const net_profit = r2(gross_profit - expenses - wastage);
  return {
    gross_sales: r2(sale.gross), bills: sale.bills,
    avg_bill: sale.bills ? r2(sale.gross / sale.bills) : 0,
    tax: r2(sale.tax), discount: r2(sale.discount),
    returns: r2(returns), net_sales,
    cash_sales: r2(pay('cash')), upi_sales: r2(pay('upi')), card_sales: r2(pay('card')),
    udhaar_sales: r2(sale.udhaar_sales), udhaar_received: r2(udhaarReceived),
    pending_udhaar: r2(pendingUdhaar), refunds: r2(refunds),
    expenses: r2(expenses), wastage: r2(wastage), purchases: r2(purchases),
    cogs: r2(cogs), gross_profit, net_profit, low_stock: lowStock
  };
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────
r.get('/dashboard', requirePerm('dashboard'), (req, res) => {
  const { from, to } = range(req);
  const k = kpis(from, to);

  const salesTrend = all(`SELECT ${D} AS day, COALESCE(SUM(total),0) AS sales, COUNT(*) AS bills
    FROM sales s WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ? GROUP BY day ORDER BY day`, from, to);
  const hourly = all(`SELECT substr(s.created_at,12,2) AS hour, COALESCE(SUM(total),0) AS sales, COUNT(*) AS bills
    FROM sales s WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ? GROUP BY hour ORDER BY hour`, from, to);
  const categorySales = all(`SELECT COALESCE(c.name,'Other') AS name, r2 AS value FROM (
      SELECT p.category_id AS cid, ROUND(SUM(si.amount),2) AS r2 FROM sale_items si
      JOIN sales s ON s.id = si.sale_id LEFT JOIN products p ON p.id = si.product_id
      WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ? GROUP BY p.category_id) x
    LEFT JOIN categories c ON c.id = x.cid ORDER BY value DESC`, from, to);
  const topItems = all(`SELECT si.name, ROUND(SUM(si.amount),2) AS amount, ROUND(SUM(si.qty),2) AS qty, si.unit
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ?
    GROUP BY si.name, si.unit ORDER BY amount DESC LIMIT 10`, from, to);
  const paymentModes = [
    { name: 'Cash', value: k.cash_sales }, { name: 'UPI', value: k.upi_sales },
    { name: 'Card', value: k.card_sales }, { name: 'Udhaar', value: k.udhaar_sales }
  ].filter(x => x.value > 0);
  const expensesTrend = all(`SELECT date AS day, ROUND(SUM(amount),2) AS expenses FROM expenses
    WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date`, from, to);
  const profitTrend = all(`SELECT ${D} AS day,
      ROUND(SUM(s.total - s.tax - (SELECT COALESCE(SUM(si.cost),0) FROM sale_items si WHERE si.sale_id = s.id)),2) AS profit
    FROM sales s WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ? GROUP BY day ORDER BY day`, from, to);
  const udhaarTrend = all(`SELECT day, ROUND(SUM(given),2) AS given, ROUND(SUM(received),2) AS received FROM (
      SELECT substr(created_at,1,10) AS day, amount AS given, 0 AS received FROM credit_transactions WHERE type='sale'
      UNION ALL
      SELECT substr(created_at,1,10) AS day, 0, -amount FROM credit_transactions WHERE type='payment'
    ) WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day`, from, to);

  const recentBills = all(`SELECT s.id, s.bill_no, s.total, s.status, s.created_at, c.name AS customer_name, u.name AS cashier_name
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id
    WHERE s.status != 'held' ORDER BY s.id DESC LIMIT 8`);
  const lowStockItems = all(`SELECT id, name, unit, stock, min_stock FROM products
    WHERE active=1 AND track_stock=1 AND stock <= min_stock ORDER BY (stock - min_stock) LIMIT 10`);
  const pendingCustomers = all(`SELECT id, name, phone, balance FROM customers WHERE balance > 0 ORDER BY balance DESC LIMIT 8`);
  const topCustomers = all(`SELECT c.id, c.name, c.phone, ROUND(SUM(s.total),2) AS total, COUNT(*) AS bills
    FROM sales s JOIN customers c ON c.id = s.customer_id
    WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ? GROUP BY c.id ORDER BY total DESC LIMIT 8`, from, to);
  const wastageToday = get(`SELECT COALESCE(SUM(cost),0) AS v FROM wastage WHERE date BETWEEN ? AND ?`, from, to).v;

  res.json({
    range: { from, to }, kpis: { ...k, wastage_cost: r2(wastageToday) },
    charts: { salesTrend, hourly, categorySales, topItems, paymentModes, expensesTrend, profitTrend, udhaarTrend },
    lists: { recentBills, lowStockItems, pendingCustomers, topCustomers }
  });
});

// ── FINANCE & ANALYSIS ───────────────────────────────────────────────────────
r.get('/finance', requirePerm('finance'), (req, res) => {
  const { from, to } = range(req);
  const k = kpis(from, to);
  const inventoryValue = get(`SELECT COALESCE(SUM(stock * cost_price),0) AS v FROM products WHERE active=1 AND track_stock=1 AND stock > 0`).v;
  const rawValue = get(`SELECT COALESCE(SUM(stock * avg_rate),0) AS v FROM raw_materials WHERE active=1 AND stock > 0`).v;
  const supplierOutstanding = get(`SELECT
      COALESCE((SELECT SUM(total) FROM purchases),0)
      - COALESCE((SELECT SUM(paid) FROM purchases),0)
      - COALESCE((SELECT SUM(amount) FROM supplier_payments),0) AS v`).v;
  const receivables = k.pending_udhaar;
  const expensesByCat = all(`SELECT COALESCE(ec.name,'Other') AS name, ROUND(SUM(e.amount),2) AS value
    FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
    WHERE e.date BETWEEN ? AND ? GROUP BY ec.name ORDER BY value DESC`, from, to);
  const monthly = all(`SELECT substr(s.created_at,1,7) AS month, ROUND(SUM(total),2) AS sales,
      ROUND(SUM(udhaar_amount),2) AS udhaar FROM sales s WHERE s.status IN ${LIVE}
      GROUP BY month ORDER BY month DESC LIMIT 12`);
  res.json({
    range: { from, to },
    ...k,
    inventory_value: r2(inventoryValue), raw_material_value: r2(rawValue),
    total_inventory_value: r2(inventoryValue + rawValue),
    supplier_outstanding: r2(Math.max(supplierOutstanding, 0)),
    customer_receivables: r2(receivables),
    expenses_by_category: expensesByCat,
    monthly
  });
});

// ── REPORTS ──────────────────────────────────────────────────────────────────
const money = (k, label) => ({ key: k, label, align: 'right', money: true });
const num = (k, label) => ({ key: k, label, align: 'right' });
const col = (k, label) => ({ key: k, label });

const REPORTS = {
  daily_sales: (from, to) => ({
    title: 'Daily Sales Report',
    columns: [col('day', 'Date'), num('bills', 'Bills'), money('gross', 'Gross'), money('discount', 'Discount'), money('tax', 'GST'), money('total', 'Net Total'), money('udhaar', 'Udhaar'), money('cash', 'Cash'), money('upi', 'UPI'), money('card', 'Card')],
    rows: all(`SELECT ${D} AS day, COUNT(*) AS bills, ROUND(SUM(subtotal),2) AS gross, ROUND(SUM(discount),2) AS discount,
      ROUND(SUM(tax),2) AS tax, ROUND(SUM(total),2) AS total, ROUND(SUM(udhaar_amount),2) AS udhaar,
      ROUND(COALESCE((SELECT SUM(amount) FROM payments p WHERE p.kind='sale' AND p.method='cash' AND substr(p.created_at,1,10)=${D}),0),2) AS cash,
      ROUND(COALESCE((SELECT SUM(amount) FROM payments p WHERE p.kind='sale' AND p.method='upi' AND substr(p.created_at,1,10)=${D}),0),2) AS upi,
      ROUND(COALESCE((SELECT SUM(amount) FROM payments p WHERE p.kind='sale' AND p.method='card' AND substr(p.created_at,1,10)=${D}),0),2) AS card
      FROM sales s WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ? GROUP BY day ORDER BY day DESC`, from, to)
  }),
  monthly_sales: () => ({
    title: 'Monthly Sales Report',
    columns: [col('month', 'Month'), num('bills', 'Bills'), money('total', 'Sales'), money('udhaar', 'Udhaar Sales'), money('tax', 'GST'), money('discount', 'Discount')],
    rows: all(`SELECT substr(s.created_at,1,7) AS month, COUNT(*) AS bills, ROUND(SUM(total),2) AS total,
      ROUND(SUM(udhaar_amount),2) AS udhaar, ROUND(SUM(tax),2) AS tax, ROUND(SUM(discount),2) AS discount
      FROM sales s WHERE s.status IN ${LIVE} GROUP BY month ORDER BY month DESC`)
  }),
  product_sales: (from, to) => ({
    title: 'Product Sales Report',
    columns: [col('name', 'Product'), col('unit', 'Unit'), num('qty', 'Qty Sold'), money('amount', 'Sales'), money('cost', 'COGS'), money('profit', 'Profit')],
    rows: all(`SELECT si.name, si.unit, ROUND(SUM(si.qty),3) AS qty, ROUND(SUM(si.amount),2) AS amount,
      ROUND(SUM(si.cost),2) AS cost, ROUND(SUM(si.amount) - SUM(si.cost),2) AS profit
      FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ?
      GROUP BY si.name, si.unit ORDER BY amount DESC`, from, to)
  }),
  category_sales: (from, to) => ({
    title: 'Category Sales Report',
    columns: [col('category', 'Category'), num('qty', 'Items Sold'), money('amount', 'Sales')],
    rows: all(`SELECT COALESCE(c.name,'Other') AS category, COUNT(si.id) AS qty, ROUND(SUM(si.amount),2) AS amount
      FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN products p ON p.id = si.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ? GROUP BY c.name ORDER BY amount DESC`, from, to)
  }),
  hourly_sales: (from, to) => ({
    title: 'Hourly Sales Report',
    columns: [col('hour', 'Hour'), num('bills', 'Bills'), money('total', 'Sales')],
    rows: all(`SELECT substr(s.created_at,12,2) || ':00' AS hour, COUNT(*) AS bills, ROUND(SUM(total),2) AS total
      FROM sales s WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ? GROUP BY hour ORDER BY hour`, from, to)
  }),
  payments: (from, to) => ({
    title: 'Payment Report',
    columns: [col('day', 'Date'), col('method', 'Method'), col('kind', 'Type'), num('count', 'Txns'), money('amount', 'Amount')],
    rows: all(`SELECT substr(created_at,1,10) AS day, method, kind, COUNT(*) AS count, ROUND(SUM(amount),2) AS amount
      FROM payments WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY day, method, kind ORDER BY day DESC, method`, from, to)
  }),
  cash: (from, to) => ({
    title: 'Cash Report',
    columns: [col('day', 'Date'), money('sales', 'Cash Sales'), money('udhaar_recv', 'Udhaar Received (Cash)'), money('refunds', 'Cash Refunds'), money('expenses', 'Cash Expenses'), money('net', 'Net Cash')],
    rows: all(`SELECT day, sales, udhaar_recv, refunds, expenses, ROUND(sales + udhaar_recv - refunds - expenses,2) AS net FROM (
      SELECT substr(p.created_at,1,10) AS day,
        ROUND(SUM(CASE WHEN p.kind='sale' THEN p.amount ELSE 0 END),2) AS sales,
        ROUND(SUM(CASE WHEN p.kind='udhaar_receipt' THEN p.amount ELSE 0 END),2) AS udhaar_recv,
        ROUND(SUM(CASE WHEN p.kind='refund' THEN p.amount ELSE 0 END),2) AS refunds,
        ROUND(COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.payment_method='cash' AND e.date = substr(p.created_at,1,10)),0),2) AS expenses
      FROM payments p WHERE p.method='cash' AND substr(p.created_at,1,10) BETWEEN ? AND ? GROUP BY day) ORDER BY day DESC`, from, to)
  }),
  upi: (from, to) => ({
    title: 'UPI Report',
    columns: [col('day', 'Date'), num('count', 'Txns'), money('sales', 'UPI Sales'), money('udhaar_recv', 'Udhaar Received (UPI)')],
    rows: all(`SELECT substr(created_at,1,10) AS day, COUNT(*) AS count,
      ROUND(SUM(CASE WHEN kind='sale' THEN amount ELSE 0 END),2) AS sales,
      ROUND(SUM(CASE WHEN kind='udhaar_receipt' THEN amount ELSE 0 END),2) AS udhaar_recv
      FROM payments WHERE method='upi' AND substr(created_at,1,10) BETWEEN ? AND ? GROUP BY day ORDER BY day DESC`, from, to)
  }),
  udhaar: (from, to) => ({
    title: 'Udhaar Report',
    columns: [col('day', 'Date'), col('customer', 'Customer'), col('type', 'Type'), col('ref', 'Reference'), money('debit', 'Udhaar Given'), money('credit', 'Received'), money('balance_after', 'Balance After')],
    rows: all(`SELECT substr(ct.created_at,1,10) AS day, c.name AS customer, ct.type,
      COALESCE((SELECT bill_no FROM sales WHERE id = ct.sale_id), ct.reference, '') AS ref,
      CASE WHEN ct.amount > 0 THEN ROUND(ct.amount,2) ELSE 0 END AS debit,
      CASE WHEN ct.amount < 0 THEN ROUND(-ct.amount,2) ELSE 0 END AS credit,
      ROUND(ct.balance_after,2) AS balance_after
      FROM credit_transactions ct JOIN customers c ON c.id = ct.customer_id
      WHERE substr(ct.created_at,1,10) BETWEEN ? AND ? ORDER BY ct.created_at DESC`, from, to)
  }),
  products: () => ({
    title: 'Product Report',
    columns: [col('name', 'Product'), col('category', 'Category'), col('unit', 'Unit'), money('price', 'Price'), money('cost_price', 'Cost'), num('gst_rate', 'GST %'), num('stock', 'Stock'), num('min_stock', 'Min')],
    rows: all(`SELECT p.name, COALESCE(c.name,'') AS category, p.unit, p.price, p.cost_price, p.gst_rate, ROUND(p.stock,3) AS stock, p.min_stock
      FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active=1 ORDER BY p.name`)
  }),
  inventory: () => ({
    title: 'Inventory Report (Finished Products)',
    columns: [col('name', 'Product'), col('unit', 'Unit'), num('stock', 'Current Stock'), num('min_stock', 'Min Stock'), money('cost_price', 'Cost/Unit'), money('value', 'Stock Value'), col('status', 'Status')],
    rows: all(`SELECT name, unit, ROUND(stock,3) AS stock, min_stock, cost_price, ROUND(stock*cost_price,2) AS value,
      CASE WHEN stock <= 0 THEN 'OUT OF STOCK' WHEN stock <= min_stock THEN 'LOW' ELSE 'OK' END AS status
      FROM products WHERE active=1 AND track_stock=1 ORDER BY stock*cost_price DESC`)
  }),
  raw_materials: () => ({
    title: 'Raw Material Report',
    columns: [col('name', 'Material'), col('unit', 'Unit'), num('stock', 'Stock'), num('min_stock', 'Min'), money('avg_rate', 'Avg Rate'), money('value', 'Value'), col('status', 'Status')],
    rows: all(`SELECT name, unit, ROUND(stock,3) AS stock, min_stock, avg_rate, ROUND(stock*avg_rate,2) AS value,
      CASE WHEN stock <= 0 THEN 'OUT' WHEN stock <= min_stock THEN 'LOW' ELSE 'OK' END AS status
      FROM raw_materials WHERE active=1 ORDER BY name`)
  }),
  purchases: (from, to) => ({
    title: 'Purchase Report',
    columns: [col('date', 'Date'), col('invoice_no', 'Invoice'), col('supplier', 'Supplier'), money('total', 'Total'), money('paid', 'Paid'), money('pending', 'Pending')],
    rows: all(`SELECT p.date, COALESCE(p.invoice_no,'') AS invoice_no, COALESCE(sp.name,'') AS supplier,
      p.total, p.paid, ROUND(p.total - p.paid,2) AS pending
      FROM purchases p LEFT JOIN suppliers sp ON sp.id = p.supplier_id
      WHERE p.date BETWEEN ? AND ? ORDER BY p.date DESC`, from, to)
  }),
  suppliers: () => ({
    title: 'Supplier Report',
    columns: [col('name', 'Supplier'), col('phone', 'Phone'), money('total_purchase', 'Total Purchase'), money('paid', 'Paid'), money('outstanding', 'Outstanding'), col('last_purchase', 'Last Purchase')],
    rows: all(`SELECT s.name, COALESCE(s.phone,'') AS phone,
      ROUND(COALESCE((SELECT SUM(total) FROM purchases WHERE supplier_id=s.id),0),2) AS total_purchase,
      ROUND(COALESCE((SELECT SUM(paid) FROM purchases WHERE supplier_id=s.id),0) + COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id=s.id),0),2) AS paid,
      ROUND(COALESCE((SELECT SUM(total) FROM purchases WHERE supplier_id=s.id),0) - COALESCE((SELECT SUM(paid) FROM purchases WHERE supplier_id=s.id),0) - COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id=s.id),0),2) AS outstanding,
      COALESCE((SELECT MAX(date) FROM purchases WHERE supplier_id=s.id),'') AS last_purchase
      FROM suppliers s ORDER BY outstanding DESC`)
  }),
  expenses: (from, to) => ({
    title: 'Expense Report',
    columns: [col('date', 'Date'), col('category', 'Category'), col('description', 'Description'), col('method', 'Mode'), col('entered_by', 'Entered By'), money('amount', 'Amount')],
    rows: all(`SELECT e.date, COALESCE(ec.name,'Other') AS category, COALESCE(e.description,'') AS description,
      e.payment_method AS method, COALESCE(u.name,'') AS entered_by, e.amount
      FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id LEFT JOIN users u ON u.id = e.user_id
      WHERE e.date BETWEEN ? AND ? ORDER BY e.date DESC`, from, to)
  }),
  wastage: (from, to) => ({
    title: 'Wastage Report',
    columns: [col('date', 'Date'), col('name', 'Item'), col('item_type', 'Type'), num('qty', 'Qty'), col('unit', 'Unit'), money('cost', 'Cost'), col('reason', 'Reason'), col('staff', 'Staff')],
    rows: all(`SELECT date, name, item_type, qty, unit, cost, COALESCE(reason,'') AS reason, COALESCE(staff,'') AS staff
      FROM wastage WHERE date BETWEEN ? AND ? ORDER BY date DESC`, from, to)
  }),
  profit: (from, to) => ({
    title: 'Profit Report',
    columns: [col('day', 'Date'), money('sales', 'Net Sales'), money('cogs', 'COGS'), money('gross', 'Gross Profit'), money('expenses', 'Expenses'), money('wastage', 'Wastage'), money('net', 'Est. Net Profit')],
    rows: all(`SELECT d.day,
      ROUND(COALESCE(s.sales,0),2) AS sales, ROUND(COALESCE(s.cogs,0),2) AS cogs,
      ROUND(COALESCE(s.sales,0) - COALESCE(s.tax,0) - COALESCE(s.cogs,0),2) AS gross,
      ROUND(COALESCE(e.exp,0),2) AS expenses, ROUND(COALESCE(w.wst,0),2) AS wastage,
      ROUND(COALESCE(s.sales,0) - COALESCE(s.tax,0) - COALESCE(s.cogs,0) - COALESCE(e.exp,0) - COALESCE(w.wst,0),2) AS net
      FROM (SELECT DISTINCT substr(created_at,1,10) AS day FROM sales WHERE status IN ${LIVE} AND substr(created_at,1,10) BETWEEN ? AND ?) d
      LEFT JOIN (SELECT ${D} AS day, SUM(s.total) AS sales, SUM(s.tax) AS tax,
        SUM((SELECT COALESCE(SUM(si.cost),0) FROM sale_items si WHERE si.sale_id = s.id)) AS cogs
        FROM sales s WHERE s.status IN ${LIVE} GROUP BY day) s ON s.day = d.day
      LEFT JOIN (SELECT date AS day, SUM(amount) AS exp FROM expenses GROUP BY date) e ON e.day = d.day
      LEFT JOIN (SELECT date AS day, SUM(cost) AS wst FROM wastage GROUP BY date) w ON w.day = d.day
      ORDER BY d.day DESC`, from, to)
  }),
  cashier: (from, to) => ({
    title: 'Cashier Report',
    columns: [col('cashier', 'Cashier'), num('bills', 'Bills'), money('total', 'Sales'), money('cash', 'Cash Collected'), money('upi', 'UPI'), money('discount', 'Discounts Given')],
    rows: all(`SELECT u.name AS cashier, COUNT(*) AS bills, ROUND(SUM(s.total),2) AS total,
      ROUND(COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.user_id = u.id AND p.kind='sale' AND p.method='cash' AND substr(p.created_at,1,10) BETWEEN ? AND ?),0),2) AS cash,
      ROUND(COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.user_id = u.id AND p.kind='sale' AND p.method='upi' AND substr(p.created_at,1,10) BETWEEN ? AND ?),0),2) AS upi,
      ROUND(SUM(s.discount),2) AS discount
      FROM sales s JOIN users u ON u.id = s.user_id
      WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ? GROUP BY u.id ORDER BY total DESC`, from, to, from, to, from, to)
  }),
  gst: (from, to) => ({
    title: 'Tax / GST Report',
    columns: [col('day', 'Date'), num('gst_rate', 'GST %'), money('taxable', 'Taxable Value'), money('tax', 'GST Collected')],
    rows: all(`SELECT ${D} AS day, si.gst_rate, ROUND(SUM(si.amount),2) AS taxable,
      ROUND(SUM(si.amount * si.gst_rate / 100.0),2) AS tax
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.status IN ${LIVE} AND ${D} BETWEEN ? AND ? AND si.gst_rate > 0
      GROUP BY day, si.gst_rate ORDER BY day DESC, si.gst_rate`, from, to)
  })
};

r.get('/reports/types', requirePerm('reports'), (req, res) => {
  res.json(Object.keys(REPORTS));
});
r.get('/reports/:type', requirePerm('reports'), (req, res) => {
  const fn = REPORTS[req.params.type];
  if (!fn) return res.status(404).json({ error: 'Unknown report: ' + req.params.type });
  const { from, to } = range(req);
  const report = fn(from, to);
  // summary row: sum numeric/money columns
  const summary = {};
  for (const c of report.columns) {
    if (c.money || c.align === 'right') {
      const vals = report.rows.map(x => Number(x[c.key])).filter(v => !Number.isNaN(v));
      if (vals.length) summary[c.key] = r2(vals.reduce((a, b) => a + b, 0));
    }
  }
  res.json({ ...report, from, to, summary, count: report.rows.length });
});

export default r;
