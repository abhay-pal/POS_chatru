import React, { useEffect, useState } from 'react';
import { BookOpen, Pencil, Printer } from 'lucide-react';
import { api, fmt, fmtDay, withBase } from '../api.js';
import { Modal, Field, useToast } from '../components/ui.jsx';
import { LedgerModal, ReceiveModal } from './Udhaar.jsx';

export default function Customers() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);     // customer object or {} for new
  const [ledgerFor, setLedgerFor] = useState(null);
  const [receiveFor, setReceiveFor] = useState(null);

  const load = () => api(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setRows).catch(e => toast(e.message, 'err'));
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q]);

  return (
    <div className="page">
      <div className="row-flex mb" style={{ justifyContent: 'space-between' }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search name / mobile / customer ID…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => setEdit({})}>+ Add Customer</button>
      </div>
      <div className="card">
        <div className="tbl-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Address</th><th>Since</th><th className="num">Udhaar Balance</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id}>
                  <td className="muted">#{c.id}</td>
                  <td><b>{c.name}</b>{c.notes && <div className="muted" style={{ fontSize: 12 }}>{c.notes}</div>}</td>
                  <td>{c.phone}</td>
                  <td className="muted">{c.address}</td>
                  <td>{fmtDay(c.created_at)}</td>
                  <td className="num">
                    {c.balance > 0 ? <b style={{ color: 'var(--red)' }}>{fmt(c.balance)}</b> : <span className="badge green">Clear</span>}
                  </td>
                  <td>
                    <div className="row-flex" style={{ gap: 5, flexWrap: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setLedgerFor(c)}><BookOpen size={14} /></button>
                      <button className="btn sm" onClick={() => setEdit(c)}><Pencil size={14} /></button>
                      <button className="btn sm" onClick={() => window.open(withBase(`/print/statement/${c.id}`), '_blank')}><Printer size={14} /></button>
                      {c.balance > 0 && <button className="btn sm primary" onClick={() => setReceiveFor(c)}>Receive</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7}><div className="empty"><div className="big">👥</div>No customers</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <EditCustomerModal customer={edit} onDone={() => { setEdit(null); load(); }} onClose={() => setEdit(null)} />}
      {ledgerFor && <LedgerModal customer={ledgerFor} onClose={() => setLedgerFor(null)} />}
      {receiveFor && <ReceiveModal customer={receiveFor} onDone={() => { setReceiveFor(null); load(); }} onClose={() => setReceiveFor(null)} />}
    </div>
  );
}

function EditCustomerModal({ customer, onDone, onClose }) {
  const toast = useToast();
  const isNew = !customer.id;
  const [f, setF] = useState({
    name: customer.name || '', phone: customer.phone || '', address: customer.address || '',
    notes: customer.notes || '', opening_balance: customer.opening_balance || ''
  });
  const save = async () => {
    if (!f.name.trim()) return toast('Name is required', 'err');
    try {
      if (isNew) await api('/customers', { method: 'POST', body: { ...f, opening_balance: Number(f.opening_balance) || 0 } });
      else await api(`/customers/${customer.id}`, { method: 'PUT', body: f });
      toast('Customer saved', 'ok');
      onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={isNew ? 'Add Customer' : `Edit — ${customer.name}`} onClose={onClose}
      footer={<button className="btn primary" onClick={save}>Save</button>}>
      <div className="form-row">
        <Field label="Name *"><input className="input" autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <Field label="Address"><input className="input" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
      <div className="form-row">
        {isNew && <Field label="Opening balance (₹)"><input className="input" type="number" value={f.opening_balance} onChange={e => setF({ ...f, opening_balance: e.target.value })} /></Field>}
        <Field label="Notes"><input className="input" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
