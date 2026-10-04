import React, { useEffect, useState } from 'react';
import { api, fmt, qty3, fmtDay, presetRange, todayStr } from '../api.js';
import { Modal, Field, DateRange, useToast } from '../components/ui.jsx';

export default function Purchases() {
  const toast = useToast();
  const [range, setRange] = useState({ preset: 'month', ...presetRange('month') });
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);

  const load = () => api(`/purchases?from=${range.from}&to=${range.to}`).then(setRows).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, [range]);

  const totals = rows.reduce((a, r) => ({ total: a.total + r.total, paid: a.paid + r.paid }), { total: 0, paid: 0 });

  return (
    <div className="page">
      <div className="row-flex mb" style={{ justifyContent: 'space-between' }}>
        <DateRange value={range} onChange={setRange} />
        <div className="row-flex">
          <span className="badge gold">Total {fmt(totals.total)}</span>
          <span className="badge red">Pending {fmt(totals.total - totals.paid)}</span>
          <button className="btn primary" onClick={() => setOpen(true)}>+ New Purchase</button>
        </div>
      </div>
      <div className="card">
        <div className="tbl-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Invoice</th><th>Supplier</th><th>Items</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Pending</th><th>Mode</th></tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} onClick={() => setView(p)} style={{ cursor: 'pointer' }}>
                  <td>{fmtDay(p.date)}</td>
                  <td><b>{p.invoice_no}</b></td>
                  <td>{p.supplier_name}</td>
                  <td className="muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.items.map(i => i.name).join(', ')}
                  </td>
                  <td className="num"><b>{fmt(p.total)}</b></td>
                  <td className="num">{fmt(p.paid)}</td>
                  <td className="num">{p.total - p.paid > 0.5 ? <b style={{ color: 'var(--red)' }}>{fmt(p.total - p.paid)}</b> : <span className="badge green">Paid</span>}</td>
                  <td>{p.payment_method || '—'}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8}><div className="empty"><div className="big">🚚</div>No purchases in period</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {open && <NewPurchase onDone={() => { setOpen(false); load(); }} onClose={() => setOpen(false)} />}
      {view && (
        <Modal title={`Purchase ${view.invoice_no || '#' + view.id}`} onClose={() => setView(null)}>
          <table className="tbl">
            <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {view.items.map(i => (
                <tr key={i.id}><td>{i.name} <span className="badge gray">{i.item_type === 'raw_material' ? 'raw' : 'product'}</span></td>
                  <td className="num">{qty3(i.qty)} {i.unit}</td><td className="num">{fmt(i.rate)}</td><td className="num">{fmt(i.amount)}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={3}>Total (incl tax {fmt(view.tax)})</td><td className="num">{fmt(view.total)}</td></tr>
              <tr><td colSpan={3}>Paid</td><td className="num">{fmt(view.paid)}</td></tr>
            </tfoot>
          </table>
        </Modal>
      )}
    </div>
  );
}

function NewPurchase({ onDone, onClose }) {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [raws, setRaws] = useState([]);
  const [products, setProducts] = useState([]);
  const [f, setF] = useState({ supplier_id: '', invoice_no: '', date: todayStr(), tax: '', paid: '', payment_method: 'cash', notes: '' });
  const [items, setItems] = useState([{ item_type: 'raw_material', item_id: '', qty: '', rate: '' }]);

  useEffect(() => {
    api('/suppliers').then(setSuppliers);
    api('/raw-materials').then(setRaws);
    api('/products?active=true').then(setProducts);
  }, []);

  const subtotal = items.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
  const total = subtotal + (Number(f.tax) || 0);

  const setItem = (i, patch) => setItems(its => its.map((x, j) => j === i ? { ...x, ...patch } : x));
  const lookup = (it) => (it.item_type === 'raw_material' ? raws : products).find(x => x.id === Number(it.item_id));

  const save = async () => {
    const valid = items.filter(it => it.item_id && Number(it.qty) > 0 && Number(it.rate) >= 0);
    if (!valid.length) return toast('Add at least one item', 'err');
    try {
      await api('/purchases', {
        method: 'POST',
        body: {
          ...f, supplier_id: f.supplier_id || null, tax: Number(f.tax) || 0, paid: Number(f.paid) || 0,
          items: valid.map(it => {
            const src = lookup(it);
            return { item_type: it.item_type, item_id: Number(it.item_id), name: src?.name, unit: src?.unit, qty: Number(it.qty), rate: Number(it.rate) };
          })
        }
      });
      toast('Purchase saved — stock updated', 'ok');
      onDone();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <Modal title="New Purchase Entry" onClose={onClose} size="lg" footer={
      <button className="btn primary lg" onClick={save}>Save Purchase ({fmt(total)})</button>
    }>
      <div className="form-row3">
        <Field label="Supplier">
          <select className="input" value={f.supplier_id} onChange={e => setF({ ...f, supplier_id: e.target.value })}>
            <option value="">— select —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Invoice number"><input className="input" value={f.invoice_no} onChange={e => setF({ ...f, invoice_no: e.target.value })} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
      </div>

      <Field label="Items">
        {items.map((it, i) => {
          const src = lookup(it);
          return (
            <div key={i} className="row-flex" style={{ marginBottom: 7, flexWrap: 'nowrap' }}>
              <select className="input" style={{ width: 110 }} value={it.item_type} onChange={e => setItem(i, { item_type: e.target.value, item_id: '' })}>
                <option value="raw_material">Raw</option><option value="product">Product</option>
              </select>
              <select className="input" value={it.item_id} onChange={e => {
                const id = e.target.value;
                const s = (it.item_type === 'raw_material' ? raws : products).find(x => x.id === Number(id));
                setItem(i, { item_id: id, rate: it.rate || (it.item_type === 'raw_material' ? s?.avg_rate : s?.cost_price) || '' });
              }}>
                <option value="">— item —</option>
                {(it.item_type === 'raw_material' ? raws : products).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <input className="input" style={{ width: 95 }} type="number" placeholder={`Qty ${src?.unit || ''}`} value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} />
              <input className="input" style={{ width: 95 }} type="number" placeholder="Rate" value={it.rate} onChange={e => setItem(i, { rate: e.target.value })} />
              <b style={{ width: 90, textAlign: 'right', flex: 'none' }}>{fmt((Number(it.qty) || 0) * (Number(it.rate) || 0))}</b>
              <button className="btn sm ghost" onClick={() => setItems(its => its.filter((_, j) => j !== i))}>✕</button>
            </div>
          );
        })}
        <button className="btn sm" onClick={() => setItems(its => [...its, { item_type: 'raw_material', item_id: '', qty: '', rate: '' }])}>+ Add item</button>
      </Field>

      <div className="form-row3">
        <Field label="Tax (₹)"><input className="input" type="number" value={f.tax} onChange={e => setF({ ...f, tax: e.target.value })} /></Field>
        <Field label={`Paid now (of ${fmt(total)})`}><input className="input" type="number" value={f.paid} onChange={e => setF({ ...f, paid: e.target.value })} /></Field>
        <Field label="Payment mode">
          <select className="input" value={f.payment_method} onChange={e => setF({ ...f, payment_method: e.target.value })}>
            <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option>
          </select>
        </Field>
      </div>
      {total - (Number(f.paid) || 0) > 0.5 && <div className="badge red">Pending to supplier: {fmt(total - (Number(f.paid) || 0))}</div>}
    </Modal>
  );
}
