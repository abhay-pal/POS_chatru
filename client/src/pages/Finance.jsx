import React, { useEffect, useState } from 'react';
import { api, fmt, presetRange } from '../api.js';
import { Stat, DateRange, useToast } from '../components/ui.jsx';
import { DonutChart, TrendChart } from '../components/charts.jsx';

export default function Finance() {
  const toast = useToast();
  const [range, setRange] = useState({ preset: 'month', ...presetRange('month') });
  const [d, setD] = useState(null);

  useEffect(() => {
    api(`/finance?from=${range.from}&to=${range.to}`).then(setD).catch(e => toast(e.message, 'err'));
  }, [range]);

  if (!d) return <div className="page"><div className="empty">Loading…</div></div>;

  const Row = ({ label, value, bold, color, indent }) => (
    <div className="tot-row" style={{ fontWeight: bold ? 800 : 500, color, paddingLeft: indent ? 18 : 0, fontSize: bold ? 15.5 : 13.5 }}>
      <span>{label}</span><span>{fmt(value)}</span>
    </div>
  );

  return (
    <div className="page">
      <div className="mb"><DateRange value={range} onChange={setRange} /></div>

      <div className="kpis mb">
        <Stat label="Gross Sales" value={d.gross_sales} color="#d4a017" />
        <Stat label="Net Sales (after returns)" value={d.net_sales} color="#b8860b" />
        <Stat label="COGS" value={d.cogs} color="#6b5433" />
        <Stat label="Gross Profit" value={d.gross_profit} color="#1e7d45" />
        <Stat label="Est. Net Profit" value={d.net_profit} color={d.net_profit >= 0 ? '#1e7d45' : '#c0392b'} />
        <Stat label="Inventory Value" value={d.total_inventory_value} color="#1f5f8b" />
        <Stat label="Customer Receivables" value={d.customer_receivables} color="#c0392b" />
        <Stat label="Supplier Outstanding" value={d.supplier_outstanding} color="#8c2f23" />
      </div>

      <div className="chart-grid mb">
        <div className="card">
          <div className="card-h">Profit & Loss (period)</div>
          <div className="card-b">
            <Row label="Gross Sales (completed bills)" value={d.gross_sales} />
            <Row label="− Returns / Refunds" value={-d.returns} color="var(--red)" />
            <Row label="Net Sales" value={d.net_sales} bold />
            <Row label="− GST collected (passed to govt)" value={-d.tax} indent />
            <Row label="− Cost of Goods Sold" value={-d.cogs} indent />
            <Row label="Gross Profit" value={d.gross_profit} bold color="var(--green)" />
            <Row label="− Expenses" value={-d.expenses} indent />
            <Row label="− Wastage" value={-d.wastage} indent />
            <Row label="Estimated Net Profit" value={d.net_profit} bold color={d.net_profit >= 0 ? 'var(--green)' : 'var(--red)'} />
          </div>
        </div>

        <div className="card">
          <div className="card-h">Udhaar — Sales vs Collections (kept separate)</div>
          <div className="card-b">
            <Row label="Total Sales (period)" value={d.gross_sales} />
            <Row label="…of which Udhaar Sales" value={d.udhaar_sales} indent color="var(--maroon)" />
            <Row label="…received at counter (cash/UPI/card)" value={d.gross_sales - d.udhaar_sales} indent />
            <div style={{ borderTop: '1px dashed var(--border)', margin: '8px 0' }} />
            <Row label="Udhaar Payments Received (period)" value={d.udhaar_received} color="var(--green)" bold />
            <div className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
              ✓ Udhaar collections are NOT counted again as sales — they only reduce receivables.
            </div>
            <Row label="Current Total Outstanding (all time)" value={d.customer_receivables} bold color="var(--red)" />
          </div>
        </div>

        <div className="card">
          <div className="card-h">Money In — by mode (period)</div>
          <div className="card-b">
            <Row label="Cash Sales" value={d.cash_sales} />
            <Row label="UPI Sales" value={d.upi_sales} />
            <Row label="Card Sales" value={d.card_sales} />
            <Row label="Udhaar Sales (receivable, not cash)" value={d.udhaar_sales} color="var(--maroon)" />
            <Row label="Udhaar Collections" value={d.udhaar_received} color="var(--green)" />
            <Row label="− Refunds paid out" value={-d.refunds} color="var(--red)" />
          </div>
        </div>

        <div className="card">
          <div className="card-h">Money Out (period)</div>
          <div className="card-b">
            <Row label="Purchases (raw material & goods)" value={d.purchases} />
            <Row label="Expenses" value={d.expenses} />
            <Row label="Wastage cost" value={d.wastage} />
            <Row label="Discounts given" value={d.discount} />
            <div style={{ borderTop: '1px dashed var(--border)', margin: '8px 0' }} />
            <Row label="Inventory Value — finished goods" value={d.inventory_value} indent />
            <Row label="Inventory Value — raw materials" value={d.raw_material_value} indent />
            <Row label="Total Inventory Value (today)" value={d.total_inventory_value} bold />
          </div>
        </div>

        <div className="card third">
          <div className="card-h">Expenses by Category</div>
          <div className="card-b"><DonutChart data={d.expenses_by_category.slice(0, 8)} height={230} /></div>
        </div>
        <div className="card" style={{ gridColumn: 'span 8' }}>
          <div className="card-h">Monthly Sales & Udhaar (last 12 months)</div>
          <div className="card-b">
            <TrendChart kind="bar" x="month" height={230}
              data={[...d.monthly].reverse()}
              series={[{ key: 'sales', label: 'Sales', color: '#d4a017' }, { key: 'udhaar', label: 'of which Udhaar', color: '#8c2f23' }]} />
          </div>
        </div>
      </div>
    </div>
  );
}
