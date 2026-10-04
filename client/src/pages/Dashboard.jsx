import React, { useEffect, useState } from 'react';
import { api, fmt, fmtDate, presetRange, showQty } from '../api.js';
import { Stat, DateRange, StatusBadge, useToast } from '../components/ui.jsx';
import { TrendChart, DonutChart, HBarChart } from '../components/charts.jsx';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [range, setRange] = useState({ preset: 'today', ...presetRange('today') });
  const [data, setData] = useState(null);
  const toast = useToast();

  useEffect(() => {
    api(`/dashboard?from=${range.from}&to=${range.to}`).then(setData).catch(e => toast(e.message, 'err'));
  }, [range]);

  if (!data) return <div className="page"><div className="empty">Loading dashboard…</div></div>;
  const k = data.kpis, c = data.charts, l = data.lists;

  return (
    <div className="page">
      <div className="mb"><DateRange value={range} onChange={setRange} /></div>

      <div className="kpis mb">
        <Stat label="Sales" value={k.net_sales} sub={`${k.bills} bills`} color="#d4a017" />
        <Stat label="Bills" value={k.bills} money={false} sub={`Avg ${fmt(k.avg_bill)}`} color="#6b5433" />
        <Stat label="Cash Sale" value={k.cash_sales} color="#1e7d45" />
        <Stat label="UPI Sale" value={k.upi_sales} color="#1f5f8b" />
        <Stat label="Card Sale" value={k.card_sales} color="#2e86ab" />
        <Stat label="Udhaar Sale" value={k.udhaar_sales} color="#8c2f23" />
        <Stat label="Udhaar Received" value={k.udhaar_received} color="#1e7d45" />
        <Stat label="Total Pending Udhaar" value={k.pending_udhaar} color="#c0392b" />
        <Stat label="Expenses" value={k.expenses} color="#c0392b" />
        <Stat label="Gross Profit" value={k.gross_profit} color="#1e7d45" />
        <Stat label="Est. Net Profit" value={k.net_profit} color={k.net_profit >= 0 ? '#1e7d45' : '#c0392b'} />
        <Stat label="Wastage" value={k.wastage_cost} color="#935116" />
        <Stat label="Low Stock Items" value={k.low_stock} money={false} sub="need production" color="#c0392b" />
        <Stat label="GST Collected" value={k.tax} color="#7d6608" />
      </div>

      <div className="chart-grid mb">
        <div className="card">
          <div className="card-h">Sales Trend</div>
          <div className="card-b"><TrendChart data={c.salesTrend} series={[{ key: 'sales', label: 'Sales' }]} /></div>
        </div>
        <div className="card">
          <div className="card-h">Hourly Sales</div>
          <div className="card-b"><TrendChart data={c.hourly} x="hour" kind="bar" series={[{ key: 'sales', label: 'Sales' }]} /></div>
        </div>
        <div className="card third">
          <div className="card-h">Category Sales</div>
          <div className="card-b"><DonutChart data={c.categorySales.slice(0, 7)} /></div>
        </div>
        <div className="card third">
          <div className="card-h">Payment Modes</div>
          <div className="card-b"><DonutChart data={c.paymentModes} /></div>
        </div>
        <div className="card third">
          <div className="card-h">Top Selling Items</div>
          <div className="card-b"><HBarChart data={c.topItems.slice(0, 7)} /></div>
        </div>
        <div className="card">
          <div className="card-h">Sales vs Expenses</div>
          <div className="card-b">
            <TrendChart kind="bar" data={mergeByDay(c.salesTrend, c.expensesTrend)} series={[
              { key: 'sales', label: 'Sales', color: '#d4a017' },
              { key: 'expenses', label: 'Expenses', color: '#8c2f23' }
            ]} />
          </div>
        </div>
        <div className="card">
          <div className="card-h">Profit Trend</div>
          <div className="card-b"><TrendChart kind="line" data={c.profitTrend} series={[{ key: 'profit', label: 'Profit', color: '#1e7d45' }]} /></div>
        </div>
        <div className="card full">
          <div className="card-h">Udhaar Trend — Given vs Received</div>
          <div className="card-b">
            <TrendChart kind="bar" data={c.udhaarTrend} height={200} series={[
              { key: 'given', label: 'Udhaar Given', color: '#8c2f23' },
              { key: 'received', label: 'Udhaar Received', color: '#1e7d45' }
            ]} />
          </div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="card third">
          <div className="card-h">Recent Bills <Link className="spacer" to="/sales" style={{ fontSize: 12 }}>View all →</Link></div>
          <div className="card-b list-mini">
            {l.recentBills.map(b => (
              <div className="row" key={b.id}>
                <div className="grow"><b>{b.bill_no}</b><small>{b.customer_name || 'Walk-in'} · {fmtDate(b.created_at)}</small></div>
                <StatusBadge status={b.status} />
                <b>{fmt(b.total)}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="card third">
          <div className="card-h">Low Stock Alerts <Link className="spacer" to="/inventory" style={{ fontSize: 12 }}>Inventory →</Link></div>
          <div className="card-b list-mini">
            {l.lowStockItems.length === 0 && <div className="muted">All stocked up 🎉</div>}
            {l.lowStockItems.map(p => (
              <div className="row" key={p.id}>
                <div className="grow"><b>{p.name}</b><small>min {showQty(p.min_stock, p.unit)}</small></div>
                <span className="badge red">{showQty(p.stock, p.unit)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card third">
          <div className="card-h">Pending Udhaar <Link className="spacer" to="/udhaar" style={{ fontSize: 12 }}>Udhaar →</Link></div>
          <div className="card-b list-mini">
            {l.pendingCustomers.map(cu => (
              <div className="row" key={cu.id}>
                <div className="grow"><b>{cu.name}</b><small>{cu.phone}</small></div>
                <b style={{ color: 'var(--red)' }}>{fmt(cu.balance)}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="card third">
          <div className="card-h">Top Selling Mithai</div>
          <div className="card-b list-mini">
            {c.topItems.slice(0, 6).map((t, i) => (
              <div className="row" key={i}>
                <span className="badge gold">#{i + 1}</span>
                <div className="grow"><b>{t.name}</b><small>{showQty(t.qty, t.unit)} sold</small></div>
                <b>{fmt(t.amount)}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="card third">
          <div className="card-h">Top Customers</div>
          <div className="card-b list-mini">
            {l.topCustomers.length === 0 && <div className="muted">No customer-tagged sales in this period.</div>}
            {l.topCustomers.map((cu, i) => (
              <div className="row" key={cu.id}>
                <span className="badge gold">#{i + 1}</span>
                <div className="grow"><b>{cu.name}</b><small>{cu.bills} bills</small></div>
                <b>{fmt(cu.total)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function mergeByDay(sales, expenses) {
  const map = {};
  for (const s of sales || []) map[s.day] = { day: s.day, sales: s.sales, expenses: 0 };
  for (const e of expenses || []) { map[e.day] = map[e.day] || { day: e.day, sales: 0 }; map[e.day].expenses = e.expenses; }
  return Object.values(map).sort((a, b) => a.day < b.day ? -1 : 1);
}
