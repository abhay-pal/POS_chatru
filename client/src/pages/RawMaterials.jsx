import React, { useEffect, useState } from 'react';
import { History, SlidersHorizontal, Pencil, Soup } from 'lucide-react';
import { api, fmt, qty3, showQty, fmtDate } from '../api.js';
import { Modal, Field, useToast } from '../components/ui.jsx';
import { useApp } from '../App.jsx';

export default function RawMaterials() {
  const toast = useToast();
  const { hasPerm } = useApp();
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [histFor, setHistFor] = useState(null);
  const [adjFor, setAdjFor] = useState(null);
  const [useFor, setUseFor] = useState(null);

  const load = () => api('/raw-materials').then(setRows).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);

  const totValue = rows.reduce((a, r) => a + r.stock * r.avg_rate, 0);

  return (
    <div className="page">
      <div className="row-flex mb" style={{ justifyContent: 'space-between' }}>
        <span className="badge gold" style={{ fontSize: 13 }}>Raw material value: {fmt(totValue)}</span>
        <button className="btn primary" onClick={() => setEdit({})}>+ Add Raw Material</button>
      </div>
      <div className="card">
        <div className="tbl-wrap" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr>
              <th>Material</th><th>Unit</th><th className="num">Stock</th><th className="num">Min</th>
              <th className="num">Avg Rate</th><th className="num">Value</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {rows.map(m => {
                const low = m.stock <= m.min_stock;
                return (
                  <tr key={m.id}>
                    <td><b>{m.name}</b>{m.name_hi && <span className="muted"> · {m.name_hi}</span>}</td>
                    <td>{m.unit}</td>
                    <td className="num"><b>{qty3(m.stock)}</b></td>
                    <td className="num">{m.min_stock}</td>
                    <td className="num">{fmt(m.avg_rate)}</td>
                    <td className="num">{fmt(m.stock * m.avg_rate)}</td>
                    <td>{m.stock <= 0 ? <span className="badge red">Out</span> : low ? <span className="badge red">Low</span> : <span className="badge green">OK</span>}</td>
                    <td>
                      <div className="row-flex" style={{ gap: 5, flexWrap: 'nowrap' }}>
                        <button className="btn sm" title="Record consumption" onClick={() => setUseFor(m)}><Soup size={14} /></button>
                        <button className="btn sm" title="History" onClick={() => setHistFor(m)}><History size={14} /></button>
                        {hasPerm('stock_adjust') && <button className="btn sm" title="Adjust" onClick={() => setAdjFor(m)}><SlidersHorizontal size={14} /></button>}
                        <button className="btn sm" onClick={() => setEdit(m)}><Pencil size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <EditModal m={edit} onDone={() => { setEdit(null); load(); }} onClose={() => setEdit(null)} />}
      {histFor && <HistModal m={histFor} onClose={() => setHistFor(null)} />}
      {adjFor && <AdjModal m={adjFor} onDone={() => { setAdjFor(null); load(); }} onClose={() => setAdjFor(null)} />}
      {useFor && <ConsumeModal m={useFor} onDone={() => { setUseFor(null); load(); }} onClose={() => setUseFor(null)} />}
    </div>
  );
}

function EditModal({ m, onDone, onClose }) {
  const toast = useToast();
  const isNew = !m.id;
  const [f, setF] = useState({ name: m.name || '', name_hi: m.name_hi || '', unit: m.unit || 'kg', min_stock: m.min_stock ?? '', avg_rate: m.avg_rate ?? '' });
  const save = async () => {
    if (!f.name.trim()) return toast('Name required', 'err');
    try {
      if (isNew) await api('/raw-materials', { method: 'POST', body: f });
      else await api(`/raw-materials/${m.id}`, { method: 'PUT', body: f });
      toast('Saved', 'ok'); onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={isNew ? 'Add Raw Material' : `Edit — ${m.name}`} onClose={onClose} footer={<button className="btn primary" onClick={save}>Save</button>}>
      <div className="form-row">
        <Field label="Name *"><input className="input" autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Hindi name"><input className="input" value={f.name_hi} onChange={e => setF({ ...f, name_hi: e.target.value })} /></Field>
      </div>
      <div className="form-row3">
        <Field label="Unit">
          <select className="input" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}>
            {['kg', 'litre', 'g', 'piece', 'packet'].map(u => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Min stock"><input className="input" type="number" value={f.min_stock} onChange={e => setF({ ...f, min_stock: e.target.value })} /></Field>
        <Field label="Avg purchase rate"><input className="input" type="number" value={f.avg_rate} onChange={e => setF({ ...f, avg_rate: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function HistModal({ m, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api(`/raw-materials/transactions?raw_material_id=${m.id}`).then(setRows); }, [m.id]);
  return (
    <Modal title={`History — ${m.name}`} onClose={onClose} size="lg">
      {!rows ? <div className="empty">Loading…</div> : (
        <div className="tbl-wrap" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Type</th><th className="num">Qty</th><th className="num">Stock After</th><th className="num">Rate</th><th>Notes</th></tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td>{fmtDate(t.created_at)}</td>
                  <td><span className={`badge ${t.qty < 0 ? 'red' : 'green'}`}>{t.type}</span></td>
                  <td className="num">{t.qty > 0 ? '+' : ''}{qty3(t.qty)}</td>
                  <td className="num"><b>{qty3(t.stock_after)}</b></td>
                  <td className="num">{t.rate ? fmt(t.rate) : ''}</td>
                  <td className="muted">{t.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function AdjModal({ m, onDone, onClose }) {
  const toast = useToast();
  const [v, setV] = useState(m.stock);
  const [notes, setNotes] = useState('');
  const save = async () => {
    try {
      await api('/raw-materials/adjust', { method: 'POST', body: { raw_material_id: m.id, new_stock: Number(v), notes } });
      toast('Adjusted', 'ok'); onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={`Adjust — ${m.name}`} onClose={onClose} footer={<button className="btn primary" onClick={save}>Save</button>}>
      <Field label={`New counted stock (${m.unit}) — current ${qty3(m.stock)}`}>
        <input className="input" type="number" step="0.001" autoFocus value={v} onChange={e => setV(e.target.value)} />
      </Field>
      <Field label="Notes"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
    </Modal>
  );
}

function ConsumeModal({ m, onDone, onClose }) {
  const toast = useToast();
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const save = async () => {
    if (!(Number(qty) > 0)) return toast('Enter quantity', 'err');
    try {
      await api('/raw-materials/consume', { method: 'POST', body: { raw_material_id: m.id, qty: Number(qty), notes } });
      toast('Consumption recorded', 'ok'); onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={`Kitchen consumption — ${m.name}`} onClose={onClose} footer={<button className="btn primary" onClick={save}>Save</button>}>
      <Field label={`Quantity used (${m.unit}) — stock ${qty3(m.stock)}`}>
        <input className="input" type="number" step="0.001" autoFocus value={qty} onChange={e => setQty(e.target.value)} />
      </Field>
      <Field label="Notes"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Used for jalebi batch…" /></Field>
    </Modal>
  );
}
