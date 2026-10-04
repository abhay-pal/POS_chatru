import React, { useEffect, useState } from 'react';
import { Printer, Eye, Ban, Undo2 } from 'lucide-react';
import { api, fmt, fmtDate, presetRange, showQty, STATUS_LABEL, withBase } from '../api.js';
import { Modal, DateRange, StatusBadge, Field, useToast } from '../components/ui.jsx';
import { useApp } from '../App.jsx';

export default function SalesHistory() {
  const toast = useToast();
  const { hasPerm } = useApp();
  const [range, setRange] = useState({ preset: 'today', ...presetRange('today') });
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [view, setView] = useState(null);
  const [refundFor, setRefundFor] = useState(null);

  const load = async () => {
    const qs = new URLSearchParams({ from: range.from, to: range.to, limit: 300 });
    if (status) qs.set('status', status);
    if (q) qs.set('q', q);
    setRows(await api(`/sales?${qs}`));
  };
  useEffect(() => { load().catch(e => toast(e.message, 'err')); }, [range, status]);

  const openView = async (id) => setView(await api(`/sales/${id}`));

  const cancelBill = async (sale) => {
    const reason = prompt(`Cancel bill ${sale.bill_no}? This restocks items and reverses udhaar.\nEnter reason:`);
    if (reason === null) return;
    try {
      await api(`/sales/${sale.id}/cancel`, { method: 'POST', body: { reason } });
      toast(`Bill ${sale.bill_no} cancelled`, 'ok');
      setView(null); load();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <div className="page">
      <div className="row-flex mb" style={{ justifyContent: 'space-between' }}>
        <DateRange value={range} onChange={setRange} />
        <div className="row-flex">
          <input className="input" style={{ width: 210 }} placeholder="Search bill no / customer…" value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
          <select className="input" style={{ width: 150 }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="tbl-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr>
              <th>Bill No</th><th>Date / Time</th><th>Customer</th><th className="num">Items</th>
              <th className="num">Total</th><th>Payment</th><th>Cashier</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td><b>{s.bill_no}</b></td>
                  <td>{fmtDate(s.created_at)}</td>
                  <td>{s.customer_name || <span className="muted">Walk-in</span>}</td>
                  <td className="num">{s.item_count}</td>
                  <td className="num"><b>{fmt(s.total)}</b></td>
                  <td>{s.udhaar_amount > 0 ? <span className="badge red">Udhaar {fmt(s.udhaar_amount)}</span> : <PayMethods saleId={s.id} paid={s.paid} />}</td>
                  <td>{s.cashier_name}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                    <div className="row-flex" style={{ gap: 5, flexWrap: 'nowrap' }}>
                      <button className="btn sm" title="View" onClick={() => openView(s.id)}><Eye size={14} /></button>
                      {s.status !== 'held' && s.status !== 'cancelled' && (
                        <button className="btn sm" title="Reprint" onClick={() => window.open(withBase(`/print/receipt/${s.id}?reprint=1`), '_blank', 'width=450,height=700')}><Printer size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={9}><div className="empty"><div className="big">🧾</div>No bills in this period</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {view && (
        <Modal title={`Bill ${view.bill_no}`} onClose={() => setView(null)} size="lg" footer={<>
          {['completed', 'partial_refund'].includes(view.status) && hasPerm('refund') && (
            <button className="btn" onClick={() => { setRefundFor(view); setView(null); }}><Undo2 size={15} /> Refund / Return</button>
          )}
          {view.status === 'completed' && hasPerm('cancel_bill') && (
            <button className="btn red" onClick={() => cancelBill(view)}><Ban size={15} /> Cancel Bill</button>
          )}
          {view.status !== 'held' && view.status !== 'cancelled' && (
            <button className="btn primary" onClick={() => window.open(withBase(`/print/receipt/${view.id}?reprint=1`), '_blank', 'width=450,height=700')}><Printer size={15} /> Reprint</button>
          )}
        </>}>
          <SaleDetail sale={view} />
        </Modal>
      )}
      {refundFor && <RefundModal sale={refundFor} onDone={() => { setRefundFor(null); load(); }} onClose={() => setRefundFor(null)} />}
    </div>
  );
}

function PayMethods({ saleId, paid }) {
  return <span className="badge green">{fmt(paid)}</span>;
}

export function SaleDetail({ sale }) {
  return (
    <>
      <div className="row-flex mb" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="muted">Customer</div>
          <b>{sale.customer_name || 'Walk-in'}</b> {sale.customer_phone && <span className="muted">· {sale.customer_phone}</span>}
        </div>
        <div><div className="muted">Cashier</div><b>{sale.cashier_name}</b></div>
        <div><div className="muted">Date</div><b>{fmtDate(sale.created_at)}</b></div>
        <StatusBadge status={sale.status} />
      </div>
      {sale.cancel_reason && <div className="badge red mb">Reason: {sale.cancel_reason}</div>}
      <table className="tbl mb">
        <thead><tr><th>Item</th><th className="num">Qty / Weight</th><th className="num">Rate</th><th className="num">Disc</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {sale.items.map(it => (
            <tr key={it.id}>
              <td>{it.name}{it.notes && <div className="muted" style={{ fontSize: 11.5 }}>📝 {it.notes}</div>}</td>
              <td className="num">{showQty(it.qty, it.unit)}</td>
              <td className="num">{fmt(it.rate)}</td>
              <td className="num">{it.discount ? fmt(it.discount) : '—'}</td>
              <td className="num"><b>{fmt(it.amount)}</b></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={4}>Subtotal</td><td className="num">{fmt(sale.subtotal)}</td></tr>
          {sale.discount > 0 && <tr><td colSpan={4}>Discount</td><td className="num">−{fmt(sale.discount)}</td></tr>}
          <tr><td colSpan={4}>GST</td><td className="num">{fmt(sale.tax)}</td></tr>
          <tr><td colSpan={4}>Round off</td><td className="num">{sale.round_off?.toFixed(2)}</td></tr>
          <tr><td colSpan={4}><b>TOTAL</b></td><td className="num"><b>{fmt(sale.total)}</b></td></tr>
        </tfoot>
      </table>
      <div className="row-flex">
        {sale.payments.map(p => (
          <span key={p.id} className={`badge ${p.kind === 'refund' ? 'red' : 'green'}`}>
            {p.kind === 'refund' ? 'Refund ' : ''}{p.method.toUpperCase()} {fmt(p.amount)}
            {p.change > 0 ? ` (recv ${fmt(p.received)}, change ${fmt(p.change)})` : ''}
          </span>
        ))}
        {sale.udhaar_amount > 0 && <span className="badge red">UDHAAR {fmt(sale.udhaar_amount)}</span>}
      </div>
      {sale.returns?.length > 0 && (
        <div className="mt">
          <b>Returns:</b>
          {sale.returns.map(r => <div key={r.id} className="muted" style={{ fontSize: 13 }}>• {r.date}: {fmt(r.total_refund)} via {r.method} ({r.reason || 'no reason'})</div>)}
        </div>
      )}
    </>
  );
}

function RefundModal({ sale, onDone, onClose }) {
  const toast = useToast();
  const [sel, setSel] = useState({});
  const [method, setMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);

  const totalRefund = sale.items.reduce((a, it) => {
    const q = Number(sel[it.id]) || 0;
    return a + q * it.rate * (it.amount / Math.max(it.qty * it.rate, 0.0001));
  }, 0);

  const submit = async () => {
    const items = Object.entries(sel).filter(([, q]) => Number(q) > 0).map(([id, q]) => ({ sale_item_id: Number(id), qty: Number(q) }));
    if (!items.length) return toast('Enter return quantity for at least one item', 'err');
    try {
      const res = await api(`/sales/${sale.id}/refund`, { method: 'POST', body: { items, method, reason, restock } });
      toast(`Refunded ${fmt(res.total_refund)}`, 'ok');
      onDone();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <Modal title={`Return / Refund — ${sale.bill_no}`} onClose={onClose} footer={
      <button className="btn red solid" onClick={submit}>Refund {fmt(totalRefund)}</button>
    }>
      <table className="tbl mb">
        <thead><tr><th>Item</th><th className="num">Sold</th><th className="num">Return Qty</th><th className="num">Refund</th></tr></thead>
        <tbody>
          {sale.items.map(it => (
            <tr key={it.id}>
              <td>{it.name}</td>
              <td className="num">{showQty(it.qty, it.unit)}</td>
              <td className="num">
                <input className="input" style={{ width: 90, textAlign: 'right' }} type="number" min="0" max={it.qty}
                  step={it.unit === 'kg' ? '0.05' : '1'} value={sel[it.id] ?? ''} placeholder="0"
                  onChange={e => setSel(s => ({ ...s, [it.id]: e.target.value }))} />
              </td>
              <td className="num">{fmt((Number(sel[it.id]) || 0) * it.rate * (it.amount / Math.max(it.qty * it.rate, 0.0001)))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="form-row">
        <Field label="Refund method">
          <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="upi">UPI</option>
            {sale.customer_id && <option value="udhaar">Adjust in Udhaar khata</option>}
          </select>
        </Field>
        <Field label="Reason">
          <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Quality issue / wrong item…" />
        </Field>
      </div>
      <label className="row-flex" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} />
        Add returned quantity back to stock
      </label>
    </Modal>
  );
}
