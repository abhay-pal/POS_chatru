import React, { useEffect, useState } from 'react';
import { HandCoins, Printer, BookOpen } from 'lucide-react';
import { api, fmt, fmtDay, fmtDate, showQty } from '../api.js';
import { Modal, Field, Stat, useToast } from '../components/ui.jsx';
import { AddCustomerModal } from './POS.jsx';

export default function Udhaar() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [receiveFor, setReceiveFor] = useState(null);
  const [ledgerFor, setLedgerFor] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = () => api('/udhaar/summary').then(setData).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="page"><div className="empty">Loading…</div></div>;
  const customers = data.customers.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone || '').includes(q));

  return (
    <div className="page">
      <div className="kpis mb">
        <Stat label="Total Pending Udhaar" value={data.total_outstanding} color="#c0392b" />
        <Stat label="Total Udhaar Given (all time)" value={data.total_udhaar_given} color="#8c2f23" />
        <Stat label="Total Received (all time)" value={data.total_received} color="#1e7d45" />
        <Stat label="Today's Udhaar" value={data.today_udhaar} color="#b8860b" />
        <Stat label="Today's Collection" value={data.today_received} color="#1e7d45" />
        <Stat label="Customers with Due" value={data.customers.length} money={false} color="#6b5433" />
      </div>

      <div className="row-flex mb" style={{ justifyContent: 'space-between' }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Search customer / phone…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="row-flex">
          <button className="btn" onClick={() => setAddOpen(true)}>+ Add Customer</button>
          <button className="btn primary" onClick={() => setReceiveFor({})}><HandCoins size={16} /> RECEIVE PAYMENT</button>
        </div>
      </div>

      <div className="card">
        <div className="tbl-wrap" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Phone</th><th>Last Activity</th><th className="num">Outstanding</th><th>Actions</th></tr></thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id}>
                  <td><b>{c.name}</b> <span className="muted">#{c.id}</span></td>
                  <td>{c.phone}</td>
                  <td>{fmtDate(c.last_activity)}</td>
                  <td className="num"><b style={{ color: 'var(--red)', fontSize: 15 }}>{fmt(c.balance)}</b></td>
                  <td>
                    <div className="row-flex" style={{ gap: 6 }}>
                      <button className="btn sm primary" onClick={() => setReceiveFor(c)}>Receive</button>
                      <button className="btn sm" onClick={() => setLedgerFor(c)}><BookOpen size={14} /> Ledger</button>
                      <button className="btn sm" onClick={() => window.open(`/print/statement/${c.id}`, '_blank')}><Printer size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!customers.length && <tr><td colSpan={5}><div className="empty"><div className="big">🎉</div>No pending udhaar</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {receiveFor && <ReceiveModal customer={receiveFor.id ? receiveFor : null} onDone={() => { setReceiveFor(null); load(); }} onClose={() => setReceiveFor(null)} />}
      {ledgerFor && <LedgerModal customer={ledgerFor} onClose={() => setLedgerFor(null)} />}
      {addOpen && <AddCustomerModal onDone={() => { setAddOpen(false); load(); }} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

// ── receive udhaar payment ──
export function ReceiveModal({ customer, onDone, onClose }) {
  const toast = useToast();
  const [cust, setCust] = useState(customer);
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState([]);
  const [f, setF] = useState({ amount: '', method: 'cash', date: new Date().toISOString().slice(0, 10), reference: '', notes: '' });

  useEffect(() => {
    if (!q) { setOpts([]); return; }
    const t = setTimeout(() => api(`/customers?q=${encodeURIComponent(q)}&limit=8`).then(setOpts), 200);
    return () => clearTimeout(t);
  }, [q]);

  const save = async () => {
    if (!cust) return toast('Select a customer', 'err');
    if (!(Number(f.amount) > 0)) return toast('Enter payment amount', 'err');
    try {
      const res = await api('/udhaar/receive', { method: 'POST', body: { customer_id: cust.id, ...f, amount: Number(f.amount) } });
      toast(`Payment saved. New balance: ${fmt(res.balance)}`, 'ok');
      onDone();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <Modal title="Receive Udhaar Payment" onClose={onClose} footer={<button className="btn primary lg" onClick={save}>Save Payment</button>}>
      {!cust ? (
        <Field label="Select customer">
          <input className="input" autoFocus placeholder="Search name / phone…" value={q} onChange={e => setQ(e.target.value)} />
          {opts.map(c => (
            <button key={c.id} className="btn" style={{ justifyContent: 'space-between', marginTop: 6 }} onClick={() => setCust(c)}>
              <span>{c.name} · {c.phone}</span>
              <b style={{ color: c.balance > 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(c.balance)}</b>
            </button>
          ))}
        </Field>
      ) : (
        <div className="card mb" style={{ boxShadow: 'none', background: 'var(--gold-softer)' }}>
          <div className="card-b row-flex" style={{ justifyContent: 'space-between' }}>
            <div><b>{cust.name}</b><div className="muted">{cust.phone}</div></div>
            <div className="right">
              <div className="muted">Current Outstanding</div>
              <b style={{ fontSize: 20, color: 'var(--red)' }}>{fmt(cust.balance)}</b>
            </div>
          </div>
        </div>
      )}
      <div className="form-row">
        <Field label="Payment amount (₹) — partial allowed">
          <input className="input" type="number" style={{ fontSize: 18, fontWeight: 700 }} value={f.amount}
            onChange={e => setF({ ...f, amount: e.target.value })} autoFocus={!!cust} />
        </Field>
        <Field label="Method">
          <select className="input" value={f.method} onChange={e => setF({ ...f, method: e.target.value })}>
            <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option>
          </select>
        </Field>
      </div>
      {cust && Number(f.amount) > 0 && (
        <div className="chips mb">
          {[0.25, 0.5, 1].map(p => (
            <button key={p} className="chip" onClick={() => setF({ ...f, amount: String(Math.round(cust.balance * p)) })}>{p === 1 ? 'Full' : `${p * 100}%`}</button>
          ))}
        </div>
      )}
      {cust && <div className="chips mb">
        <button className="chip" onClick={() => setF({ ...f, amount: String(cust.balance) })}>Full {fmt(cust.balance)}</button>
        <button className="chip" onClick={() => setF({ ...f, amount: String(Math.round(cust.balance / 2)) })}>Half</button>
      </div>}
      <div className="form-row">
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Reference"><input className="input" value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} placeholder="UPI ref / receipt no" /></Field>
      </div>
      <Field label="Notes"><input className="input" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
      {cust && Number(f.amount) > 0 && (
        <div className="tot-row grand">
          <span>Balance after payment</span>
          <span style={{ color: 'var(--green)' }}>{fmt(Math.max(cust.balance - Number(f.amount), 0))}</span>
        </div>
      )}
    </Modal>
  );
}

// ── ledger modal (date-wise with items) ──
export function LedgerModal({ customer, onClose }) {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = () => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    api(`/customers/${customer.id}/ledger?${qs}`).then(setData);
  };
  useEffect(() => { load(); }, [customer.id]);

  const typeLabel = { opening: 'Opening Balance', sale: 'Udhaar Sale', payment: 'Payment Received', adjustment: 'Adjustment', refund: 'Refund' };

  return (
    <Modal title={`Ledger — ${customer.name}`} onClose={onClose} size="xl" footer={<>
      <button className="btn" onClick={() => window.open(`/print/statement/${customer.id}${from || to ? `?from=${from}&to=${to}` : ''}`, '_blank')}>
        <Printer size={15} /> Print Statement
      </button>
    </>}>
      <div className="row-flex mb">
        <input type="date" className="input" style={{ width: 150 }} value={from} onChange={e => setFrom(e.target.value)} />
        <span className="muted">to</span>
        <input type="date" className="input" style={{ width: 150 }} value={to} onChange={e => setTo(e.target.value)} />
        <button className="btn sm" onClick={load}>Apply</button>
        {data && (
          <div className="row-flex" style={{ marginLeft: 'auto', gap: 14 }}>
            <span>Udhaar: <b style={{ color: 'var(--maroon)' }}>{fmt(data.totals.total_debits)}</b></span>
            <span>Received: <b style={{ color: 'var(--green)' }}>{fmt(data.totals.total_credits)}</b></span>
            <span>Pending: <b style={{ color: 'var(--red)', fontSize: 16 }}>{fmt(data.totals.current_balance)}</b></span>
          </div>
        )}
      </div>
      {!data ? <div className="empty">Loading…</div> : (
        <div className="tbl-wrap" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Bill / Ref</th><th>Details</th><th className="num">Udhaar</th><th className="num">Received</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {data.totals.opening !== 0 && (
                <tr><td colSpan={5}><b>Opening balance before period</b></td><td className="num"><b>{fmt(data.totals.opening)}</b></td></tr>
              )}
              {data.entries.map(e => (
                <tr key={e.id}>
                  <td>{fmtDay(e.created_at)}</td>
                  <td>{e.bill || e.reference || <span className="muted">{typeLabel[e.type]}</span>}</td>
                  <td>
                    {e.items ? e.items.map((it, i) => (
                      <div key={i} style={{ fontSize: 12.5 }}>{it.name} — {showQty(it.qty, it.unit)} × {fmt(it.rate)} = {fmt(it.amount)}</div>
                    )) : <span>{typeLabel[e.type]}{e.method ? ` (${e.method.toUpperCase()})` : ''}{e.notes ? ` · ${e.notes}` : ''}</span>}
                    {e.paid_at_sale > 0 && <div className="muted" style={{ fontSize: 12 }}>Bill {fmt(e.bill_total)} − paid at counter {fmt(e.paid_at_sale)}</div>}
                  </td>
                  <td className="num" style={{ color: 'var(--maroon)' }}>{e.amount > 0 ? fmt(e.amount) : ''}</td>
                  <td className="num" style={{ color: 'var(--green)' }}>{e.amount < 0 ? fmt(-e.amount) : ''}</td>
                  <td className="num"><b>{fmt(e.running_balance)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
