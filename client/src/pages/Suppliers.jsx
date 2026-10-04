import React, { useEffect, useState } from 'react';
import { BookOpen, Pencil, HandCoins } from 'lucide-react';
import { api, fmt, fmtDay } from '../api.js';
import { Modal, Field, useToast } from '../components/ui.jsx';

export default function Suppliers() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [ledgerFor, setLedgerFor] = useState(null);
  const [payFor, setPayFor] = useState(null);

  const load = () => api('/suppliers').then(setRows).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);

  return (
    <div className="page">
      <div className="row-flex mb" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary" onClick={() => setEdit({})}>+ Add Supplier</button>
      </div>
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Supplier</th><th>Phone</th><th>GSTIN</th><th className="num">Total Purchase</th><th className="num">Paid</th><th className="num">Outstanding</th><th>Last Purchase</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map(s => {
                const out = s.total_purchase - s.total_paid;
                return (
                  <tr key={s.id}>
                    <td><b>{s.name}</b><div className="muted" style={{ fontSize: 12 }}>{s.address}</div></td>
                    <td>{s.phone}</td>
                    <td>{s.gstin || '—'}</td>
                    <td className="num">{fmt(s.total_purchase)}</td>
                    <td className="num">{fmt(s.total_paid)}</td>
                    <td className="num">{out > 0.5 ? <b style={{ color: 'var(--red)' }}>{fmt(out)}</b> : <span className="badge green">Clear</span>}</td>
                    <td>{fmtDay(s.last_purchase)}</td>
                    <td>
                      <div className="row-flex" style={{ gap: 5, flexWrap: 'nowrap' }}>
                        <button className="btn sm" onClick={() => setLedgerFor(s)}><BookOpen size={14} /></button>
                        <button className="btn sm" onClick={() => setEdit(s)}><Pencil size={14} /></button>
                        {out > 0.5 && <button className="btn sm primary" onClick={() => setPayFor(s)}><HandCoins size={14} /> Pay</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {edit && <EditSupplier s={edit} onDone={() => { setEdit(null); load(); }} onClose={() => setEdit(null)} />}
      {ledgerFor && <SupplierLedger s={ledgerFor} onClose={() => setLedgerFor(null)} />}
      {payFor && <PaySupplier s={payFor} onDone={() => { setPayFor(null); load(); }} onClose={() => setPayFor(null)} />}
    </div>
  );
}

function EditSupplier({ s, onDone, onClose }) {
  const toast = useToast();
  const isNew = !s.id;
  const [f, setF] = useState({ name: s.name || '', phone: s.phone || '', address: s.address || '', gstin: s.gstin || '', notes: s.notes || '' });
  const save = async () => {
    if (!f.name.trim()) return toast('Name required', 'err');
    try {
      if (isNew) await api('/suppliers', { method: 'POST', body: f });
      else await api(`/suppliers/${s.id}`, { method: 'PUT', body: f });
      toast('Supplier saved', 'ok'); onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={isNew ? 'Add Supplier' : `Edit — ${s.name}`} onClose={onClose} footer={<button className="btn primary" onClick={save}>Save</button>}>
      <div className="form-row">
        <Field label="Name *"><input className="input" autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <Field label="Address"><input className="input" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
      <div className="form-row">
        <Field label="GSTIN"><input className="input" value={f.gstin} onChange={e => setF({ ...f, gstin: e.target.value })} /></Field>
        <Field label="Notes"><input className="input" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function SupplierLedger({ s, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => { api(`/suppliers/${s.id}/ledger`).then(setData); }, [s.id]);
  return (
    <Modal title={`Ledger — ${s.name}`} onClose={onClose} size="lg">
      {!data ? <div className="empty">Loading…</div> : (
        <>
          <div className="tbl-wrap" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Type</th><th>Ref</th><th className="num">Purchase</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {data.entries.map((e, i) => (
                  <tr key={i}>
                    <td>{fmtDay(e.date)}</td>
                    <td><span className={`badge ${e.type === 'purchase' ? 'gold' : 'green'}`}>{e.type}</span></td>
                    <td>{e.ref}</td>
                    <td className="num">{e.debit ? fmt(e.debit) : ''}</td>
                    <td className="num">{e.credit ? fmt(e.credit) : ''}</td>
                    <td className="num"><b>{fmt(e.balance)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tot-row grand mt"><span>Outstanding</span><span style={{ color: data.outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(data.outstanding)}</span></div>
        </>
      )}
    </Modal>
  );
}

function PaySupplier({ s, onDone, onClose }) {
  const toast = useToast();
  const out = s.total_purchase - s.total_paid;
  const [f, setF] = useState({ amount: '', method: 'cash', reference: '', notes: '', date: new Date().toISOString().slice(0, 10) });
  const save = async () => {
    if (!(Number(f.amount) > 0)) return toast('Enter amount', 'err');
    try {
      await api(`/suppliers/${s.id}/pay`, { method: 'POST', body: { ...f, amount: Number(f.amount) } });
      toast('Payment recorded', 'ok'); onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={`Pay supplier — ${s.name}`} onClose={onClose} footer={<button className="btn primary" onClick={save}>Save Payment</button>}>
      <div className="tot-row grand mb"><span>Outstanding</span><span style={{ color: 'var(--red)' }}>{fmt(out)}</span></div>
      <div className="form-row">
        <Field label="Amount"><input className="input" type="number" autoFocus value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Method">
          <select className="input" value={f.method} onChange={e => setF({ ...f, method: e.target.value })}>
            <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option>
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Reference"><input className="input" value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
