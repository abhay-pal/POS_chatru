import React, { useEffect, useState } from 'react';
import { Download, Printer, FileSpreadsheet } from 'lucide-react';
import { api, fmt, presetRange, downloadCSV } from '../api.js';
import { DateRange, useToast } from '../components/ui.jsx';

const REPORT_GROUPS = [
  { label: 'Sales', items: [['daily_sales', 'Daily Sales'], ['monthly_sales', 'Monthly Sales'], ['product_sales', 'Product Sales'], ['category_sales', 'Category Sales'], ['hourly_sales', 'Hourly Sales'], ['cashier', 'Cashier Report']] },
  { label: 'Payments', items: [['payments', 'Payment Report'], ['cash', 'Cash Report'], ['upi', 'UPI Report'], ['udhaar', 'Udhaar Report'], ['gst', 'Tax / GST Report']] },
  { label: 'Stock & Purchase', items: [['products', 'Product Master'], ['inventory', 'Inventory'], ['raw_materials', 'Raw Materials'], ['purchases', 'Purchases'], ['suppliers', 'Suppliers']] },
  { label: 'Spend & Profit', items: [['expenses', 'Expenses'], ['wastage', 'Wastage'], ['profit', 'Profit Report']] }
];

export default function Reports() {
  const toast = useToast();
  const [type, setType] = useState('daily_sales');
  const [range, setRange] = useState({ preset: 'month', ...presetRange('month') });
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try { setData(await api(`/reports/${type}?from=${range.from}&to=${range.to}`)); }
    catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };
  useEffect(() => { load(); }, [type, range]);

  const exportCSV = () => data && downloadCSV(`${type}_${range.from}_${range.to}.csv`, data.columns, data.rows);
  const printReport = () => window.print();

  return (
    <div className="page wide">
      <div className="row-flex mb no-print" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {REPORT_GROUPS.map(g => (
            <div key={g.label} className="row-flex" style={{ gap: 6 }}>
              <span className="muted" style={{ width: 110, fontSize: 11.5, textTransform: 'uppercase', fontWeight: 700 }}>{g.label}</span>
              {g.items.map(([id, label]) => (
                <button key={id} className={`cat-tab ${type === id ? 'active' : ''}`} style={{ padding: '5px 12px', fontSize: 12.5 }} onClick={() => setType(id)}>{label}</button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="row-flex mb no-print" style={{ justifyContent: 'space-between' }}>
        <DateRange value={range} onChange={setRange} />
        <div className="row-flex">
          <button className="btn" onClick={exportCSV}><FileSpreadsheet size={15} /> Excel/CSV</button>
          <button className="btn" onClick={printReport}><Printer size={15} /> Print / PDF</button>
        </div>
      </div>

      {data && (
        <div className="card">
          <div className="card-h">
            {data.title}
            <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>· {data.from} → {data.to} · {data.count} rows</span>
          </div>
          <div className="tbl-wrap" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
            <table className="tbl">
              <thead><tr>{data.columns.map(c => <th key={c.key} className={c.align === 'right' ? 'num' : ''}>{c.label}</th>)}</tr></thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    {data.columns.map(c => (
                      <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                        {c.money ? fmt(r[c.key]) : r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
                {!data.rows.length && <tr><td colSpan={data.columns.length}><div className="empty">{busy ? 'Loading…' : 'No data for this period'}</div></td></tr>}
              </tbody>
              {Object.keys(data.summary || {}).length > 0 && (
                <tfoot>
                  <tr>
                    {data.columns.map((c, i) => (
                      <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                        {i === 0 ? 'TOTAL' : data.summary[c.key] != null ? (c.money ? fmt(data.summary[c.key]) : data.summary[c.key]) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
