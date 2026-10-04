import React, { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api, fmt, fmtDay, presetRange, todayStr } from '../api.js';
import { Modal, Field, DateRange, useToast } from '../components/ui.jsx';

export default function Expenses() {
  const toast = useToast();
  const [range, setRange] = useState({ preset: 'month', ...presetRange('month') });
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [catF, setCatF] = useState('');
  const [edit, setEdit] = useState(null);

  const load = async () => {
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    if (catF) qs.set('category_id', catF);
    setRows(await api(`/expenses?${qs}`));
  };
  useEffect(() => { api('/expense-categories').then(setCats); }, []);
  useEffect(() => { load().catch(e => toast(e.message, 'err')); }, [range, catF]);

  const total = rows.reduce((a, r) => a + r.amount, 0);

  return (
    <div className="page">
      <div className="row-flex mb" style={{ justifyContent: 'space-between' }}>
        <DateRange value={range} onChange={setRange} />
        <div className="row-flex">
          <select className="input" style={{ width: 170 }} value={catF} onChange={e => setCatF(e.target.value)}>
            <option value="">All categories</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="badge red" style={{ fontSize: 13 }}>Total {fmt(total)}</span>
          <button className="btn primary" onClick={() => setEdit({})}>+ Add Expense</button>
        </div>
      </div>
      <div className="card">
        <div className="tbl-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="num">Amount</th><th>Mode</th><th>Entered By</th><th></th></tr></thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.id}>
                  <td>{fmtDay(e.date)}</td>
                  <td><span className="badge gold">{e.category_name || 'Other'}</span></td>
                  <td>{e.description}</td>
                  <td className="num"><b>{fmt(e.amount)}</b></td>
                  <td>{e.payment_method}</td>
                  <td>{e.user_name}</td>
                  <td>
                    <div className="row-flex" style={{ gap: 5, flexWrap: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setEdit(e)}><Pencil size={14} /></button>
                      <button className="btn sm red" onClick={async () => {
                        if (!confirm('Delete this expense? (audit logged)')) return;
                        await api(`/expenses/${e.id}`, { method: 'DELETE' });
                        load();
                      }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7}><div className="empty"><div className="big">💸</div>No expenses</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <EditExpense exp={edit} cats={cats} setCats={setCats} onDone={() => { setEdit(null); load(); }} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditExpense({ exp, cats, setCats, onDone, onClose }) {
  const toast = useToast();
  const isNew = !exp.id;
  const [f, setF] = useState({
    date: exp.date || todayStr(), category_id: exp.category_id || '', description: exp.description || '',
    amount: exp.amount ?? '', payment_method: exp.payment_method || 'cash'
  });
  const [newCat, setNewCat] = useState('');
  const addCat = async () => {
    if (!newCat.trim()) return;
    const c = await api('/expense-categories', { method: 'POST', body: { name: newCat.trim() } });
    setCats(cs => cs.some(x => x.id === c.id) ? cs : [...cs, c]);
    setF(s => ({ ...s, category_id: c.id }));
    setNewCat('');
  };
  const save = async () => {
    if (!(Number(f.amount) > 0)) return toast('Enter amount', 'err');
    try {
      if (isNew) await api('/expenses', { method: 'POST', body: { ...f, amount: Number(f.amount), category_id: f.category_id || null } });
      else await api(`/expenses/${exp.id}`, { method: 'PUT', body: { ...f, amount: Number(f.amount), category_id: f.category_id || null } });
      toast('Expense saved', 'ok'); onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={isNew ? 'Add Expense' : 'Edit Expense'} onClose={onClose} footer={<button className="btn primary" onClick={save}>Save</button>}>
      <div className="form-row">
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount (₹)"><input className="input" type="number" autoFocus value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
      </div>
      <Field label="Category">
        <select className="input" value={f.category_id} onChange={e => setF({ ...f, category_id: e.target.value })}>
          <option value="">— select —</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="row-flex mb">
        <input className="input" style={{ maxWidth: 220 }} placeholder="New category name…" value={newCat} onChange={e => setNewCat(e.target.value)} />
        <button className="btn sm" onClick={addCat}>+ Add category</button>
      </div>
      <div className="form-row">
        <Field label="Description"><input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Payment mode">
          <select className="input" value={f.payment_method} onChange={e => setF({ ...f, payment_method: e.target.value })}>
            <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}
