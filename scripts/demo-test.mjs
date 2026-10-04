// Smoke test: run the whole in-browser demo API inside Node.
import { installDemoApi, demoFetch } from '../client/src/demo/server.js';

const J = async (r) => ({ status: r.status, data: await r.json() });
let token = null;
const call = (path, method = 'GET', body) => demoFetch('/api' + path, {
  method,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  body: body ? JSON.stringify(body) : undefined
}).then(J);

await installDemoApi(); // seeds the WASM db

let r = await call('/auth/login', 'POST', { username: 'owner', password: 'owner123' });
console.log('login:', r.status, r.data.user?.name);
if (r.status !== 200) process.exit(1);
token = r.data.token;

r = await call('/auth/me');
console.log('me:', r.status, r.data.user?.role);

r = await call('/business');
console.log('business:', r.status, r.data.name);

r = await call('/dashboard');
console.log('dashboard:', r.status, 'bills today =', r.data.kpis?.bills, 'sale =', r.data.kpis?.gross_sales ?? r.data.kpis?.net_sales);

r = await call('/products?active=1');
const prods = r.data.slice ? r.data : (r.data.rows || []);
const kg = prods.find((p) => p.unit === 'kg');
console.log('products:', r.status, 'count =', prods.length, '| kg item:', kg?.name, kg?.price);

// underpay with cash; remainder goes to udhaar for customer 5 (valid flow)
r = await call('/sales/checkout', 'POST', {
  customer_id: 5,
  items: [{ product_id: kg.id, qty: 0.25 }],
  payments: [{ method: 'cash', amount: 1, received: 1 }]
});
console.log('checkout:', r.status, r.data.bill_no, 'total =', r.data.total, r.data.error || '');

if (r.status === 200) {
  const rec = await call(`/sales/${r.data.id}/receipt`);
  console.log('receipt:', rec.status, rec.data.sale?.bill_no, 'items =', rec.data.sale?.items?.length);
}

r = await call('/reports/daily_sales?from=2026-09-01&to=2026-10-04');
console.log('report:', r.status, r.data.title, 'rows =', r.data.rows?.length);

r = await call('/finance?from=2026-09-04&to=2026-10-04');
console.log('finance:', r.status, 'net profit =', r.data.net_profit, 'receivables =', r.data.customer_receivables);

// cashier permission check
let r2 = await call('/auth/login', 'POST', { username: 'ramesh', password: '1234' });
token = r2.data.token;
r2 = await call('/sales/1/refund', 'POST', { items: [], method: 'cash' });
console.log('cashier refund blocked:', r2.status === 403 ? 'OK(403)' : 'FAIL ' + r2.status);

console.log('\nDEMO API SMOKE TEST DONE');
