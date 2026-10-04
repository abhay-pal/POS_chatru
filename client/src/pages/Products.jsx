import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Upload, Download } from 'lucide-react';
import { api, fmt, showQty, UNITS, downloadCSV } from '../api.js';
import { Modal, Field, StatusBadge, useToast } from '../components/ui.jsx';

export default function Products() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (catF) qs.set('category_id', catF);
    if (lowOnly) qs.set('low_stock', '1');
    qs.set('active', showInactive ? 'false' : 'true');
    setRows(await api(`/products?${qs}`));
  };
  useEffect(() => { api('/categories').then(setCats); }, []);
  useEffect(() => { const t = setTimeout(() => load().catch(e => toast(e.message, 'err')), 200); return () => clearTimeout(t); }, [q, catF, lowOnly, showInactive]);

  const importCSV = async (file) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map(v => v.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) || line.split(',');
      const obj = {};
      header.forEach((h, i) => obj[h] = vals[i]);
      return obj;
    });
    try {
      const res = await api('/products/import', { method: 'POST', body: { rows } });
      toast(`Imported: ${res.created} new, ${res.updated} updated`, 'ok');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const exportCSV = () => {
    downloadCSV('products.csv', [
      { key: 'name', label: 'name' }, { key: 'name_hi', label: 'name_hi' }, { key: 'category_name', label: 'category' },
      { key: 'unit', label: 'unit' }, { key: 'price', label: 'price' }, { key: 'cost_price', label: 'cost_price' },
      { key: 'gst_rate', label: 'gst_rate' }, { key: 'stock', label: 'stock' }, { key: 'min_stock', label: 'min_stock' }
    ], rows);
  };

  return (
    <div className="page">
      <div className="row-flex mb" style={{ justifyContent: 'space-between' }}>
        <div className="row-flex">
          <input className="input" style={{ width: 230 }} placeholder="Search product…" value={q} onChange={e => setQ(e.target.value)} />
          <select className="input" style={{ width: 170 }} value={catF} onChange={e => setCatF(e.target.value)}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="row-flex" style={{ cursor: 'pointer', gap: 5 }}>
            <input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} /> Low stock
          </label>
          <label className="row-flex" style={{ cursor: 'pointer', gap: 5 }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Inactive
          </label>
        </div>
        <div className="row-flex">
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={e => e.target.files[0] && importCSV(e.target.files[0])} />
          <button className="btn" onClick={() => fileRef.current.click()}><Upload size={15} /> Import CSV</button>
          <button className="btn" onClick={exportCSV}><Download size={15} /> Export</button>
          <button className="btn primary" onClick={() => setEdit({})}>+ Add Product</button>
        </div>
      </div>

      <div className="card">
        <div className="tbl-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr>
              <th>Product</th><th>Category</th><th>Unit</th><th className="num">Selling ₹</th><th className="num">Cost ₹</th>
              <th className="num">GST %</th><th className="num">Stock</th><th className="num">Min</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id}>
                  <td><span style={{ fontSize: 18 }}>{p.emoji}</span> <b>{p.name}</b>{p.name_hi && <span className="muted"> · {p.name_hi}</span>}
                    <div className="muted" style={{ fontSize: 11.5 }}>{p.sku}</div></td>
                  <td>{p.category_name}</td>
                  <td>{p.unit}</td>
                  <td className="num"><b>{fmt(p.price)}</b></td>
                  <td className="num">{fmt(p.cost_price)}</td>
                  <td className="num">{p.gst_rate}%</td>
                  <td className="num">{p.track_stock ? showQty(p.stock, p.unit) : '—'}</td>
                  <td className="num">{p.min_stock}</td>
                  <td>{!p.active ? <StatusBadge status="closed" /> : p.track_stock && p.stock <= 0 ? <span className="badge red">Out</span> : p.track_stock && p.stock <= p.min_stock ? <span className="badge red">Low</span> : <span className="badge green">OK</span>}</td>
                  <td><button className="btn sm" onClick={() => setEdit(p)}><Pencil size={14} /></button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10}><div className="empty"><div className="big">🍬</div>No products</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <EditProductModal product={edit} cats={cats} onDone={() => { setEdit(null); load(); }} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditProductModal({ product, cats, onDone, onClose }) {
  const toast = useToast();
  const isNew = !product.id;
  const [f, setF] = useState({
    name: product.name || '', name_hi: product.name_hi || '', category_id: product.category_id || '',
    unit: product.unit || 'kg', price: product.price ?? '', cost_price: product.cost_price ?? '',
    gst_rate: product.gst_rate ?? 5, min_stock: product.min_stock ?? '', barcode: product.barcode || '',
    emoji: product.emoji || '🍬', sku: product.sku || '', opening_stock: '',
    track_stock: product.track_stock !== 0, active: product.active !== 0
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return toast('Product name required', 'err');
    try {
      const body = { ...f, category_id: f.category_id || null, price: Number(f.price) || 0, cost_price: Number(f.cost_price) || 0, gst_rate: Number(f.gst_rate) || 0, min_stock: Number(f.min_stock) || 0, opening_stock: Number(f.opening_stock) || 0 };
      if (isNew) await api('/products', { method: 'POST', body });
      else await api(`/products/${product.id}`, { method: 'PUT', body });
      toast('Product saved', 'ok');
      onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={isNew ? 'Add Product' : `Edit — ${product.name}`} onClose={onClose} size="lg"
      footer={<>
        {!isNew && <button className="btn red" onClick={async () => { await api(`/products/${product.id}`, { method: 'PUT', body: { ...f, active: !f.active } }); toast(f.active ? 'Deactivated' : 'Activated', 'ok'); onDone(); }}>
          {f.active ? 'Deactivate' : 'Activate'}
        </button>}
        <button className="btn primary" onClick={save}>Save Product</button>
      </>}>
      <div className="form-row3">
        <Field label="Name *"><input className="input" autoFocus value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Hindi name"><input className="input" value={f.name_hi} onChange={e => set('name_hi', e.target.value)} /></Field>
        <Field label="Emoji / symbol"><input className="input" value={f.emoji} onChange={e => set('emoji', e.target.value)} /></Field>
      </div>
      <div className="form-row3">
        <Field label="Category">
          <select className="input" value={f.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">— none —</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Unit">
          <select className="input" value={f.unit} onChange={e => set('unit', e.target.value)}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="GST %">
          <select className="input" value={f.gst_rate} onChange={e => set('gst_rate', e.target.value)}>
            {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
          </select>
        </Field>
      </div>
      <div className="form-row3">
        <Field label={`Selling price (per ${f.unit})`}><input className="input" type="number" value={f.price} onChange={e => set('price', e.target.value)} /></Field>
        <Field label="Cost price"><input className="input" type="number" value={f.cost_price} onChange={e => set('cost_price', e.target.value)} /></Field>
        <Field label="Minimum stock alert"><input className="input" type="number" value={f.min_stock} onChange={e => set('min_stock', e.target.value)} /></Field>
      </div>
      <div className="form-row3">
        <Field label="SKU"><input className="input" value={f.sku} onChange={e => set('sku', e.target.value)} /></Field>
        <Field label="Barcode (optional)"><input className="input" value={f.barcode} onChange={e => set('barcode', e.target.value)} /></Field>
        {isNew && <Field label="Opening stock"><input className="input" type="number" value={f.opening_stock} onChange={e => set('opening_stock', e.target.value)} /></Field>}
      </div>
      <label className="row-flex" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={f.track_stock} onChange={e => set('track_stock', e.target.checked)} />
        Track inventory for this product (untick for made-to-order items like tea)
      </label>
    </Modal>
  );
}
