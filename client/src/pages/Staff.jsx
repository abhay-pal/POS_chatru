import React, { useEffect, useState } from 'react';
import { Pencil, ShieldCheck } from 'lucide-react';
import { api, fmt, fmtDate } from '../api.js';
import { Modal, Field, StatusBadge, useToast } from '../components/ui.jsx';
import { useApp } from '../App.jsx';

export default function Staff() {
  const { hasPerm, user } = useApp();
  const [tab, setTab] = useState(hasPerm('*') ? 'staff' : 'shifts');
  return (
    <div className="page">
      <div className="seg mb">
        {hasPerm('*') && <button className={tab === 'staff' ? 'active' : ''} onClick={() => setTab('staff')}>Staff & Roles</button>}
        <button className={tab === 'shifts' ? 'active' : ''} onClick={() => setTab('shifts')}>Shift Closings</button>
        {hasPerm('*') && <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Audit Log</button>}
      </div>
      {tab === 'staff' && <StaffTab />}
      {tab === 'shifts' && <ShiftsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

const PERM_LABELS = {
  dashboard: 'Dashboard', pos: 'POS billing', sales_history: 'Sales history', customers: 'Customers',
  udhaar: 'Udhaar view', receive_udhaar: 'Receive udhaar payment', products: 'Products', categories: 'Categories',
  inventory: 'Inventory', raw_materials: 'Raw materials', purchases: 'Purchases & suppliers', expenses: 'Expenses',
  wastage: 'Wastage', reports: 'Reports', finance: 'Finance module', shift: 'Shifts',
  refund: '⚠ Refund', cancel_bill: '⚠ Cancel bill', large_discount: '⚠ Large discount',
  price_change: '⚠ Price change', stock_adjust: '⚠ Stock adjustment'
};

function StaffTab() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [permOpen, setPermOpen] = useState(false);

  const load = () => api('/staff').then(setRows).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="row-flex mb" style={{ justifyContent: 'space-between' }}>
        <div className="muted">Owner has full access · Manager runs operations · Cashier does billing</div>
        <div className="row-flex">
          <button className="btn" onClick={() => setPermOpen(true)}><ShieldCheck size={15} /> Role Permissions</button>
          <button className="btn primary" onClick={() => setEdit({})}>+ Add Staff</button>
        </div>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Phone</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id}>
                <td><b>{u.name}</b></td>
                <td><code>{u.username}</code></td>
                <td><span className={`badge ${u.role === 'owner' ? 'gold' : u.role === 'manager' ? 'blue' : 'gray'}`}>{u.role}</span></td>
                <td>{u.phone}</td>
                <td>{u.active ? <span className="badge green">Active</span> : <span className="badge red">Disabled</span>}</td>
                <td><button className="btn sm" onClick={() => setEdit(u)}><Pencil size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <EditStaff u={edit} onDone={() => { setEdit(null); load(); }} onClose={() => setEdit(null)} />}
      {permOpen && <PermModal onClose={() => setPermOpen(false)} />}
    </>
  );
}

function EditStaff({ u, onDone, onClose }) {
  const toast = useToast();
  const isNew = !u.id;
  const [f, setF] = useState({ name: u.name || '', username: u.username || '', password: '', role: u.role || 'cashier', phone: u.phone || '', active: u.active !== 0 });
  const save = async () => {
    if (!f.name.trim() || (isNew && (!f.username.trim() || !f.password))) return toast('Name, username & password required', 'err');
    try {
      if (isNew) await api('/staff', { method: 'POST', body: f });
      else await api(`/staff/${u.id}`, { method: 'PUT', body: f });
      toast('Staff saved', 'ok'); onDone();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title={isNew ? 'Add Staff' : `Edit — ${u.name}`} onClose={onClose} footer={<button className="btn primary" onClick={save}>Save</button>}>
      <div className="form-row">
        <Field label="Full name *"><input className="input" autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <div className="form-row">
        <Field label="Username *"><input className="input" value={f.username} disabled={!isNew} onChange={e => setF({ ...f, username: e.target.value })} /></Field>
        <Field label={isNew ? 'Password *' : 'New password (blank = keep)'}>
          <input className="input" type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Role">
          <select className="input" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
            <option value="owner">Owner — everything</option>
            <option value="manager">Manager — sales, inventory, reports, expenses</option>
            <option value="cashier">Cashier — POS, customers, basic sales</option>
          </select>
        </Field>
        {!isNew && <Field label="Status">
          <select className="input" value={f.active ? '1' : '0'} onChange={e => setF({ ...f, active: e.target.value === '1' })}>
            <option value="1">Active</option><option value="0">Disabled</option>
          </select>
        </Field>}
      </div>
    </Modal>
  );
}

function PermModal({ onClose }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  useEffect(() => { api('/role-permissions').then(setData); }, []);
  if (!data) return null;
  const allPerms = Object.keys(PERM_LABELS);
  const toggle = (role, p) => {
    setData(d => {
      const cur = new Set(d.current[role]);
      cur.has(p) ? cur.delete(p) : cur.add(p);
      return { ...d, current: { ...d.current, [role]: [...cur] } };
    });
  };
  const save = async () => {
    await api('/role-permissions', { method: 'PUT', body: { manager: data.current.manager, cashier: data.current.cashier } });
    toast('Permissions saved', 'ok'); onClose();
  };
  return (
    <Modal title="Configurable Role Permissions" onClose={onClose} size="lg" footer={<button className="btn primary" onClick={save}>Save Permissions</button>}>
      <div className="muted mb" style={{ fontSize: 12.5 }}>Owner always has everything. ⚠ marks sensitive actions (refund, cancel, large discount, price change, stock adjustment).</div>
      <table className="tbl">
        <thead><tr><th>Permission</th><th>Owner</th><th>Manager</th><th>Cashier</th></tr></thead>
        <tbody>
          {allPerms.map(p => (
            <tr key={p}>
              <td>{PERM_LABELS[p]}</td>
              <td>✅</td>
              {['manager', 'cashier'].map(role => (
                <td key={role}>
                  <input type="checkbox" checked={data.current[role].includes(p)} onChange={() => toggle(role, p)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function ShiftsTab() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/shifts').then(setRows); }, []);
  return (
    <div className="card">
      <div className="tbl-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Cashier</th><th>Opened</th><th>Closed</th><th className="num">Opening Cash</th><th className="num">Expected</th><th className="num">Actual</th><th className="num">Difference</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id}>
                <td><b>{s.user_name}</b></td>
                <td>{fmtDate(s.opened_at)}</td>
                <td>{fmtDate(s.closed_at)}</td>
                <td className="num">{fmt(s.opening_cash)}</td>
                <td className="num">{s.expected_cash != null ? fmt(s.expected_cash) : '—'}</td>
                <td className="num">{s.actual_cash != null ? fmt(s.actual_cash) : '—'}</td>
                <td className="num">
                  {s.difference != null && s.difference !== 0
                    ? <b style={{ color: s.difference < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(s.difference)}</b>
                    : s.status === 'closed' ? <span className="badge green">OK</span> : ''}
                </td>
                <td><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditTab() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/audit').then(setRows); }, []);
  return (
    <div className="card">
      <div className="tbl-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Date / Time</th><th>User</th><th>Action</th><th>Entity</th><th>Old Value</th><th>New Value</th></tr></thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id}>
                <td>{fmtDate(a.created_at)}</td>
                <td><b>{a.user_name}</b></td>
                <td><span className="badge gold">{a.action}</span></td>
                <td>{a.entity} {a.entity_id ? `#${a.entity_id}` : ''}</td>
                <td className="muted" style={{ maxWidth: 230, fontSize: 12, wordBreak: 'break-word' }}>{a.old_value}</td>
                <td className="muted" style={{ maxWidth: 230, fontSize: 12, wordBreak: 'break-word' }}>{a.new_value}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6}><div className="empty">No audit entries yet</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
