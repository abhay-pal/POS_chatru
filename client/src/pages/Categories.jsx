import React, { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { api } from '../api.js';
import { Modal, Field, useToast } from '../components/ui.jsx';

export default function Categories() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);

  const load = () => api('/categories').then(setRows).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="row-flex mb" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary" onClick={() => setEdit({})}>+ Add Category</button>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>#</th><th>Category</th><th>Hindi</th><th className="num">Products</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td className="muted">{c.sort_order}</td>
                <td><span style={{ fontSize: 17 }}>{c.icon}</span> <b>{c.name}</b></td>
                <td>{c.name_hi}</td>
                <td className="num">{c.product_count}</td>
                <td>{c.active ? <span className="badge green">Active</span> : <span className="badge gray">Hidden</span>}</td>
                <td><button className="btn sm" onClick={() => setEdit(c)}><Pencil size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && <EditCat cat={edit} onDone={() => { setEdit(null); load(); }} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditCat({ cat, onDone, onClose }) {
  const toast = useToast();
  const isNew = !cat.id;
  const [f, setF] = useState({ name: cat.name || '', name_hi: cat.name_hi || '', icon: cat.icon || '🍬', sort_order: cat.sort_order ?? 0, active: cat.active !== 0 });
  const save = async () => {
    if (!f.name.trim()) return toast('Name required', 'err');
    try {
      if (isNew) await api('/categories', { method: 'POST', body: f });
      else await api(`/categories/${cat.id}`, { method: 'PUT', body: f });
      toast('Category saved', 'ok'); onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={isNew ? 'Add Category' : `Edit — ${cat.name}`} onClose={onClose} footer={<button className="btn primary" onClick={save}>Save</button>}>
      <div className="form-row">
        <Field label="Name *"><input className="input" autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Hindi name"><input className="input" value={f.name_hi} onChange={e => setF({ ...f, name_hi: e.target.value })} /></Field>
      </div>
      <div className="form-row">
        <Field label="Icon (emoji)"><input className="input" value={f.icon} onChange={e => setF({ ...f, icon: e.target.value })} /></Field>
        <Field label="Sort order"><input className="input" type="number" value={f.sort_order} onChange={e => setF({ ...f, sort_order: Number(e.target.value) })} /></Field>
      </div>
      {!isNew && (
        <label className="row-flex" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Active (visible on POS)
        </label>
      )}
    </Modal>
  );
}
