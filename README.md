# 🍯 Chatru Halwai — Sweet Shop POS

A complete, production-style **Point of Sale & Sweet Shop Management System** built for Indian
Halwai / Mithai / Namkeen shops. First deployment: **Chatru Halwai** (Sadar Bazaar, Agra) —
but every bit of branding (name, logo, address, GST, products, categories, invoice settings)
is configurable from **Settings**, so the same product can be redeployed for any sweet shop.

## Quick start

```bash
npm install
npm run server    # API on :4000 (auto-seeds demo data on first run)
npm run client    # UI on :3000 (Vite dev server, proxies /api → :4000)
```

**Demo logins**

| Role    | Username  | Password     |
|---------|-----------|--------------|
| Owner   | `owner`   | `owner123`   |
| Manager | `manager` | `manager123` |
| Cashier | `ramesh`  | `1234`       |

Demo data: **62 products · 10 categories · 100 customers · 1,400+ sales across 45 days**,
plus udhaar ledgers, purchases, suppliers, raw materials, expenses, wastage, shifts and
audit history — the dashboard is populated from day one.

## What actually works end-to-end

- **POS billing** — category tabs, product cards (Hindi names, live stock), search
- **Weight-based billing** — KG items ask for weight (100 g…2 kg presets + custom grams from
  the weighing scale); price auto-calculated. Piece / plate / box / packet / cup / litre units too
- **Hold / Save bill** → reopen later, add items, save again — editable until finalized.
  Finalized bills disappear from "Held" and can only be **reprinted** from Sales History
- **Payments** — Cash (received / change), UPI, Card, **Split** (e.g. ₹500 cash + ₹350 UPI)
- **Udhaar (credit) sales** — customer mandatory (add new customer without leaving POS),
  optional part-payment at counter; rest goes to the customer's khata
- **Udhaar ledger** — date-wise entries with items, running balance, partial payments,
  printable statement (A4 + 80 mm thermal); payments reduce receivables and are **never**
  double-counted as sales
- **Receive udhaar payment** — cash/UPI/bank, partial allowed, full history kept forever
- **Inventory** — every movement ledgered (opening, production, purchase, sale, return,
  wastage, adjustment) with stock-after snapshots; production can consume raw materials
- **Raw materials** — separate inventory with purchases, consumption, wastage, avg rate, value
- **Purchases & suppliers** — purchase entry auto-increases stock; supplier ledger + payments + outstanding
- **Expenses** — 11 categories + custom, entered-by tracking
- **Wastage** — reasons (expired/damaged/preparation loss/unsold/quality), reduces stock, cost analytics
- **Returns / refunds** — per-item quantity, restock option, refund method (incl. udhaar adjustment)
- **Cancel bill** — restocks items, reverses udhaar, refunds payments, excluded from net sales
- **Reports** — 19 reports (daily/monthly/product/category/hourly sales, payment/cash/UPI/udhaar,
  inventory, raw material, purchase, supplier, expense, wastage, profit, cashier, GST) with
  date presets, CSV/Excel export, print/PDF
- **Finance & Analysis** — P&L, COGS, gross/net profit, inventory value, supplier outstanding,
  receivables; **udhaar sales vs udhaar collections shown separately**
- **Dashboard** — 14 KPIs, 8 charts, recent bills, low-stock alerts, pending udhaar, top items/customers
- **Staff & roles** — Owner / Manager / Cashier with configurable permissions; sensitive actions
  (refund, cancel, large discount, price change, stock adjustment) require Manager/Owner
- **Shift closing** — opening cash → expected vs actual cash with difference, full history
- **Thermal printing** — 58 mm & 80 mm receipt layouts (logo, GSTIN, items, GST, round-off,
  payment, change, footer), reprint marked as duplicate
- **Audit log** — cancellations, refunds, price changes, stock adjustments, permission changes
  with old/new values; financial records are never silently overwritten

## Architecture

```
server/            Express API (Node 18+, ES modules)
  db.js            schema + ledger primitives (stock moves, credit entries, audit)
  perm.js          role → permission matrix (overridable from Settings)
  seed.js          Chatru Halwai demo dataset (45 days, ledger-consistent)
  routes/
    masters.js     business, settings, categories, products (+CSV), customers, suppliers, raw materials, staff
    sales.js       hold/reopen/checkout, payments, udhaar, ledger, returns, cancel, receipts
    ops.js         purchases, expenses, wastage, inventory, production, shifts, audit
    analytics.js   dashboard, finance, 19-report engine (single calculation source)
client/            React 18 + Vite + recharts, golden/cream touch-first UI
  src/pages/       17 modules, collapsible sidebar, responsive (desktop / tablet / mobile)
  src/print/       thermal receipt + udhaar statement (A4/thermal)
data/pos.db        SQLite database (auto-created; delete to reseed)
```

### Database

Embedded **SQLite** (`node:sqlite`, zero native deps) with a schema written to be
**PostgreSQL/Supabase-portable**: `business, users, sessions, categories, products, customers,
sales, sale_items, payments, credit_transactions, inventory_transactions, raw_materials,
raw_material_transactions, suppliers, purchases, purchase_items, supplier_payments,
expense_categories, expenses, wastage, returns, return_items, shifts, settings, audit_logs`.

Every financial event is an immutable ledger row (credit_transactions / inventory_transactions /
payments) with running balances — corrections happen through new entries, never edits.

**Migrating to Supabase:** the SQL in `server/db.js` uses portable types (INTEGER PK, TEXT
timestamps, REAL money). Swap the `node:sqlite` calls in `db.js` for a `pg` pool (the
`get/all/run/tx` helpers are the single seam), change `AUTOINCREMENT` → `GENERATED ALWAYS AS
IDENTITY`, and point the app at your Supabase connection string.

### Accounting rules enforced

- Sale ↑ revenue; cash/UPI/card payment rows recorded against the sale
- Udhaar sale ↑ customer receivable; later collection ↓ receivable — **never counted as a sale again**
- Purchase ↑ inventory, sale/wastage ↓ inventory, return reverses sale + inventory
- Cancelled bills are excluded from net sales and fully reversed
- Dashboard, Reports, and Finance all read from the same calculation logic

## Rebranding for another shop

1. **Settings → Shop Profile**: name, logo, address, phone, GSTIN, FSSAI, tagline
2. **Settings → Billing**: invoice prefix, GST on/off, round-off, receipt size/footer, discount limit
3. **Products / Categories**: import your menu via CSV (name, category, unit, price, cost_price, gst_rate, min_stock)
4. Delete `data/pos.db` before go-live for a clean ledger (login seed users are created on first run)
