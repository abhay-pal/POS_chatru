import React, { useEffect, useState } from 'react';
import { History, SlidersHorizontal, Factory } from 'lucide-react';
import { api, fmt, qty3, showQty, presetRange, fmtDate } from '../api.js';
import { Modal, Field, DateRange, useToast } from '../components/ui.jsx';
import { useApp } from '../App.jsx';

const TYPE_BADGE = {
  opening: 'gray', production: 'green', purchase: 'blue', sale: 'gold',
  return: 'blue', wastage: 'red', adjustment: 'gray', consumption: 'gold'
};

export default function Inventory() {
  const toast = useToast();
  const { hasPerm } = useApp();
  const [range, setRange] = useState({ preset: 'today', ...presetRange('today') });
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [histFor, setHistFor] = useState(null);
  const [adjFor, setAdjFor] = useState(null);
  const [prodFor, setProdFor] = useState(null);

  const load = () => api(`/inventory/summary?from=${range.from}&to=${range.to}`).then(setRows).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, [range]);

  const filtered = rows.filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const totValue = filtered.reduce((a, r) => a + r.stock * r.cost_price, 0);

  return (
    <div className="page">
      <div className="row-flex mb" style={{ justifyContent: 'space-between' }}>
        <DateRange value={range} onChange={setRange} />
        <div className="row-flex">
          <input className="input" style={{ width: 200 }} placeholder="Search product…" value={q} onChange={e => setQ(e.target.value)} />
          <span className="badge gold">Stock value: {fmt(totValue)}</span>
        </div>
      </div>
      <div className="card">
        <div className="tbl-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr>
              <th>Product</th><th className="num">Opening</th><th className="num">Produced / In</th><th className="num">Sold</th>
              <th className="num">Returned</th><th className="num">Wastage</th><th className="num">Adjusted</th>
              <th className="num">Current Stock</th><th className="num">Value</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(r => {
                const low = r.stock <= r.min_stock;
                return (
                  <tr key={r.id}>
                    <td><b>{r.name}</b><div className="muted" style={{ fontSize: 11.5 }}>{r.category_name} · min {r.min_stock} {r.unit}</div></td>
                    <td className="num">{qty3(r.opening_calc)}</td>
                    <td className="num" style={{ color: 'var(--green)' }}>+{qty3(r.added)}</td>
                    <td className="num" style={{ color: 'var(--maroon)' }}>−{qty3(r.sold)}</td>
                    <td className="num">{qty3(r.returned)}</td>
                    <td className="num" style={{ color: 'var(--red)' }}>−{qty3(r.wasted)}</td>
                    <td className="num">{qty3(r.adjusted)}</td>
                    <td className="num"><b style={{ color: low ? 'var(--red)' : 'inherit' }}>{showQty(r.stock, r.unit)}</b> {low && <span className="badge red">Low</span>}</td>
                    <td className="num">{fmt(r.stock * r.cost_price)}</td>
                    <td>
                      <div className="row-flex" style={{ gap: 5, flexWrap: 'nowrap' }}>
                        <button className="btn sm" title="Production" onClick={() => setProdFor(r)}><Factory size={14} /></button>
                        <button className="btn sm" title="History" onClick={() => setHistFor(r)}><History size={14} /></button>
                        {hasPerm('stock_adjust') && <button className="btn sm" title="Adjust" onClick={() => setAdjFor(r)}><SlidersHorizontal size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {histFor && <HistoryModal product={histFor} onClose={() => setHistFor(null)} />}
      {adjFor && <AdjustModal product={adjFor} onDone={() => { setAdjFor(null); load(); }} onClose={() => setAdjFor(null)} />}
      {prodFor && <ProductionModal product={prodFor} onDone={() => { setProdFor(null); load(); }} onClose={() => setProdFor(null)} />}
    </div>
  );
}

function HistoryModal({ product, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api(`/inventory/transactions?product_id=${product.id}`).then(setRows); }, [product.id]);
  return (
    <Modal title={`Stock history — ${product.name}`} onClose={onClose} size="lg">
      {!rows ? <div className="empty">Loading…</div> : (
        <div className="tbl-wrap" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Type</th><th className="num">Qty</th><th className="num">Stock After</th><th>Ref / Notes</th><th>By</th></tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td>{fmtDate(t.created_at)}</td>
                  <td><span className={`badge ${TYPE_BADGE[t.type] || 'gray'}`}>{t.type}</span></td>
                  <td className="num" style={{ color: t.qty < 0 ? 'var(--red)' : 'var(--green)' }}>{t.qty > 0 ? '+' : ''}{qty3(t.qty)}</td>
                  <td className="num"><b>{qty3(t.stock_after)}</b></td>
                  <td className="muted">{t.notes}</td>
                  <td>{t.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function AdjustModal({ product, onDone, onClose }) {
  const toast = useToast();
  const [v, setV] = useState(product.stock);
  const [notes, setNotes] = useState('');
  const save = async () => {
    try {
      await api('/inventory/adjust', { method: 'POST', body: { product_id: product.id, new_stock: Number(v), notes } });
      toast('Stock adjusted (audit logged)', 'ok'); onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={`Adjust stock — ${product.name}`} onClose={onClose} footer={<button className="btn primary" onClick={save}>Save Adjustment</button>}>
      <div className="form-row">
        <Field label="Current stock"><div className="input" style={{ background: 'var(--surface2)' }}>{showQty(product.stock, product.unit)}</div></Field>
        <Field label={`New counted stock (${product.unit})`}>
          <input className="input" type="number" step="0.001" autoFocus value={v} onChange={e => setV(e.target.value)} />
        </Field>
      </div>
      <Field label="Reason / notes"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Physical count correction…" /></Field>
      <div className="muted" style={{ fontSize: 12.5 }}>⚠️ Adjustments are recorded in the audit log with old & new values.</div>
    </Modal>
  );
}

function ProductionModal({ product, onDone, onClose }) {
  const toast = useToast();
  const [qty, setQty] = useState('');
  const [raws, setRaws] = useState([]);
  const [consume, setConsume] = useState([]);
  useEffect(() => { api('/raw-materials').then(setRaws); }, []);
  const save = async () => {
    if (!(Number(qty) > 0)) return toast('Enter produced quantity', 'err');
    try {
      await api('/inventory/production', {
        method: 'POST',
        body: { product_id: product.id, qty: Number(qty), consume: consume.filter(c => c.raw_material_id && Number(c.qty) > 0) }
      });
      toast('Production added to stock', 'ok'); onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={`Production — ${product.name}`} onClose={onClose} footer={<button className="btn primary" onClick={save}>Add to Stock</button>}>
      <Field label={`Quantity produced (${product.unit})`}>
        <input className="input" type="number" step="0.001" autoFocus value={qty} onChange={e => setQty(e.target.value)} />
      </Field>
      <Field label="Raw materials consumed (optional)">
        {consume.map((c, i) => (
          <div className="form-row" key={i} style={{ marginBottom: 7 }}>
            <select className="input" value={c.raw_material_id} onChange={e => setConsume(cs => cs.map((x, j) => j === i ? { ...x, raw_material_id: Number(e.target.value) } : x))}>
              <option value="">— material —</option>
              {raws.map(m => <option key={m.id} value={m.id}>{m.name} ({qty3(m.stock)} {m.unit})</option>)}
            </select>
            <input className="input" type="number" placeholder="Qty used" value={c.qty} onChange={e => setConsume(cs => cs.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
          </div>
        ))}
        <button className="btn sm" onClick={() => setConsume(c => [...c, { raw_material_id: '', qty: '' }])}>+ Add material</button>
      </Field>
    </Modal>
  );
}
