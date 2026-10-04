import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { RANGE_PRESETS, presetRange, fmt } from '../api.js';

// ── toasts ──
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ── modal ──
export function Modal({ title, onClose, children, footer, size }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size || ''}`}>
        <div className="modal-h">{title}<button className="x" onClick={onClose}><X size={19} /></button></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

// ── stat card ──
export function Stat({ label, value, sub, color, money = true }) {
  return (
    <div className="kpi" style={color ? { '--kpi-color': color } : undefined}>
      <div className="k-label">{label}</div>
      <div className="k-value">{money ? fmt(value) : value}</div>
      {sub != null && <div className="k-sub">{sub}</div>}
    </div>
  );
}

// ── generic data table ──
export function DataTable({ columns, rows, footer, onRow, maxHeight }) {
  return (
    <div className="tbl-wrap" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table className="tbl">
        <thead><tr>{columns.map(c => <th key={c.key} className={c.align === 'right' ? 'num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} onClick={onRow ? () => onRow(r) : undefined} style={onRow ? { cursor: 'pointer' } : undefined}>
              {columns.map(c => (
                <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                  {c.render ? c.render(r) : c.money ? fmt(r[c.key]) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={columns.length}><div className="empty"><div className="big">🍯</div>No records found</div></td></tr>}
        </tbody>
        {footer && <tfoot><tr>{columns.map(c => <td key={c.key} className={c.align === 'right' ? 'num' : ''}>{footer[c.key] ?? ''}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

// ── date range filter ──
export function DateRange({ value, onChange }) {
  const [preset, setPreset] = useState(value?.preset || 'today');
  const [custom, setCustom] = useState({ from: value?.from, to: value?.to });
  const apply = (p) => {
    setPreset(p);
    if (p !== 'custom') onChange({ preset: p, ...presetRange(p) });
  };
  return (
    <div className="row-flex">
      <div className="seg">
        {RANGE_PRESETS.map(p => (
          <button key={p.id} className={preset === p.id ? 'active' : ''} onClick={() => apply(p.id)}>{p.label}</button>
        ))}
      </div>
      {preset === 'custom' && (
        <>
          <input type="date" className="input" style={{ width: 150 }} value={custom.from || ''} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
          <span className="muted">to</span>
          <input type="date" className="input" style={{ width: 150 }} value={custom.to || ''} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
          <button className="btn sm primary" disabled={!custom.from || !custom.to} onClick={() => onChange({ preset: 'custom', ...custom })}>Apply</button>
        </>
      )}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    held: ['gold', 'Held'], completed: ['green', 'Completed'], cancelled: ['red', 'Cancelled'],
    refunded: ['red', 'Refunded'], partial_refund: ['blue', 'Partial Refund'],
    open: ['green', 'Open'], closed: ['gray', 'Closed'], OK: ['green', 'OK'], LOW: ['red', 'Low'],
    'OUT OF STOCK': ['red', 'Out of stock'], OUT: ['red', 'Out']
  };
  const [cls, label] = map[status] || ['gray', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}
