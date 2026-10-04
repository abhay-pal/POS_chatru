import React, { useEffect, useMemo, useState } from 'react';
import { api, fmt, qty3, fmtDay, presetRange, todayStr } from '../api.js';
import { Modal, Field, DateRange, Stat, useToast } from '../components/ui.jsx';
import { HBarChart } from '../components/charts.jsx';

const REASONS = ['Expired', 'Damaged', 'Preparation Loss', 'Unsold', 'Quality Issue', 'Other'];

export default function Wastage() {
  const toast = useToast();
  const [range, setRange] = useState({ preset: 'month', ...presetRange('month') });
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);

  const load = () => api(`/wastage?from=${range.from}&to=${range.to}`).then(setRows).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, [range]);

  const totalCost = rows.reduce((a, r) => a + r.cost, 0);
  const todayCost = rows.filter(r => r.date === todayStr()).reduce((a, r) => a + r.cost, 0);
  const top = useMemo(() => {
    const m = {};
    for (const r of rows) m[r.name] = (m[r.name] || 0) + r.cost;
    return Object.entries(m).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 7);
  }, [rows]);

  return (
    <div className="page">
      <div className="row-flex mb" style={{ justifyContent: 'space-between' }}>
        <DateRange value={range} onChange={setRange} />
        <button className="btn primary" onClick={() => setOpen(true)}>+ Record Wastage</button>
      </div>
      <div className="kpis mb">
        <Stat label="Wastage Cost (period)" value={totalCost} color="#c0392b" />
        <Stat label="Today's Wastage" value={todayCost} color="#935116" />
        <Stat label="Entries" value={rows.length} money={false} color="#6b5433" />
      </div>
      <div className="chart-grid mb">
        <div className="card full">
          <div className="card-h">Top Wasted Items (by cost)</div>
          <div className="card-b"><HBarChart data={top} color="#8c2f23" height={210} /></div>
        </div>
      </div>
      <div className="card">
        <div className="tbl-wrap" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Item</th><th>Type</th><th className="num">Qty</th><th className="num">Cost</th><th>Reason</th><th>Staff</th><th>Notes</th></tr></thead>
            <tbody>
              {rows.map(w => (
                <tr key={w.id}>
                  <td>{fmtDay(w.date)}</td>
                  <td><b>{w.name}</b></td>
                  <td><span className="badge gray">{w.item_type === 'product' ? 'Product' : 'Raw'}</span></td>
                  <td className="num">{qty3(w.qty)} {w.unit}</td>
                  <td className="num" style={{ color: 'var(--red)' }}><b>{fmt(w.cost)}</b></td>
                  <td>{w.reason}</td>
                  <td>{w.staff}</td>
                  <td className="muted">{w.notes}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8}><div className="empty"><div className="big">♻️</div>No wastage recorded</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {open && <AddWastage onDone={() => { setOpen(false); load(); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

function AddWastage({ onDone, onClose }) {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [raws, setRaws] = useState([]);
  const [f, setF] = useState({ date: todayStr(), item_type: 'product', item_id: '', qty: '', reason: 'Unsold', staff: '', notes: '' });
  useEffect(() => {
    api('/products?active=true').then(setProducts);
    api('/raw-materials').then(setRaws);
  }, []);
  const src = f.item_type === 'product' ? products : raws;
  const item = src.find(x => x.id === Number(f.item_id));
  const estCost = item ? (Number(f.qty) || 0) * (f.item_type === 'product' ? item.cost_price : item.avg_rate) : 0;

  const save = async () => {
    if (!f.item_id || !(Number(f.qty) > 0)) return toast('Select item and quantity', 'err');
    try {
      await api('/wastage', { method: 'POST', body: { ...f, item_id: Number(f.item_id), qty: Number(f.qty) } });
      toast('Wastage recorded — stock reduced', 'ok'); onDone();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <Modal title="Record Wastage" onClose={onClose} footer={<button className="btn primary" onClick={save}>Save ({fmt(estCost)} loss)</button>}>
      <div className="form-row">
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Type">
          <select className="input" value={f.item_type} onChange={e => setF({ ...f, item_type: e.target.value, item_id: '' })}>
            <option value="product">Finished Product</option><option value="raw_material">Raw Material</option>
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Item">
          <select className="input" value={f.item_id} onChange={e => setF({ ...f, item_id: e.target.value })}>
            <option value="">— select —</option>
            {src.map(x => <option key={x.id} value={x.id}>{x.name} ({qty3(x.stock)} {x.unit})</option>)}
          </select>
        </Field>
        <Field label={`Quantity ${item ? `(${item.unit})` : ''}`}>
          <input className="input" type="number" step="0.001" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Reason">
          <select className="input" value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })}>
            {REASONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Staff"><input className="input" value={f.staff} onChange={e => setF({ ...f, staff: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
    </Modal>
  );
}
