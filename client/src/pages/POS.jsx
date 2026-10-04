import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Pause, FolderOpen, Trash2, UserPlus, X, Banknote, Smartphone,
  CreditCard, HandCoins, SplitSquareHorizontal, Printer, CheckCircle2, Clock
} from 'lucide-react';
import { api, fmt, qty3, showQty } from '../api.js';
import { Modal, Field, useToast } from '../components/ui.jsx';
import { useApp } from '../App.jsx';

const WEIGHTS = [100, 200, 250, 500, 750, 1000, 1500, 2000];

export default function POS() {
  const toast = useToast();
  const { user } = useApp();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState({});
  const [cat, setCat] = useState(0);
  const [q, setQ] = useState('');

  // cart state
  const [cart, setCart] = useState([]);           // {key, product_id, name, name_hi, unit, qty, rate, discount, gst_rate, notes, stock}
  const [heldId, setHeldId] = useState(null);     // editing a held bill
  const [heldBillNo, setHeldBillNo] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [billDiscount, setBillDiscount] = useState(0);
  const [notes, setNotes] = useState('');

  // modals
  const [weightFor, setWeightFor] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [done, setDone] = useState(null);         // completed sale
  const [held, setHeld] = useState([]);
  const [shift, setShift] = useState(null);

  const load = async () => {
    const [p, c, s, h, sh] = await Promise.all([
      api('/products?active=true'), api('/categories'), api('/settings'),
      api('/sales/held'), api('/shifts/current')
    ]);
    setProducts(p); setCategories(c.filter(x => x.active)); setSettings(s); setHeld(h); setShift(sh);
  };
  useEffect(() => { load().catch(e => toast(e.message, 'err')); }, []);

  const gstOn = settings.gst_enabled !== false;
  const filtered = useMemo(() => products.filter(p =>
    (!cat || p.category_id === cat) &&
    (!q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.name_hi || '').includes(q))
  ), [products, cat, q]);

  // ── totals (mirrors server) ──
  const totals = useMemo(() => {
    let subtotal = 0, itemDisc = 0;
    for (const it of cart) { subtotal += it.qty * it.rate; itemDisc += it.discount || 0; }
    const bd = Number(billDiscount) || 0;
    const netBase = Math.max(subtotal - itemDisc, 0.0001);
    let tax = 0;
    for (const it of cart) {
      const itNet = Math.max(it.qty * it.rate - (it.discount || 0), 0);
      const share = itNet - bd * (itNet / netBase);
      if (gstOn) tax += share * (it.gst_rate || 0) / 100;
    }
    const raw = subtotal - itemDisc - bd + tax;
    const total = settings.round_off === false ? Math.round(raw * 100) / 100 : Math.round(raw);
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round((itemDisc + bd) * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      round_off: Math.round((total - raw) * 100) / 100,
      total
    };
  }, [cart, billDiscount, gstOn, settings.round_off]);

  // ── cart ops ──
  const addProduct = (p) => {
    if (p.track_stock && p.stock <= 0) { toast(`${p.name} is out of stock`, 'err'); return; }
    if (p.unit === 'kg') { setWeightFor(p); return; }
    setCart(c => {
      const ex = c.find(x => x.product_id === p.id && !x.discount);
      if (ex) return c.map(x => x === ex ? { ...x, qty: x.qty + 1 } : x);
      return [...c, newItem(p, 1)];
    });
  };
  const newItem = (p, qty) => ({
    key: Math.random().toString(36).slice(2), product_id: p.id, name: p.name, name_hi: p.name_hi,
    unit: p.unit, qty, rate: p.price, discount: 0, gst_rate: p.gst_rate, notes: '', stock: p.stock, track_stock: p.track_stock
  });
  const addWeight = (grams) => {
    const kg = grams / 1000;
    setCart(c => {
      const ex = c.find(x => x.product_id === weightFor.id && !x.discount);
      if (ex) return c.map(x => x === ex ? { ...x, qty: Math.round((x.qty + kg) * 1000) / 1000 } : x);
      return [...c, newItem(weightFor, kg)];
    });
    setWeightFor(null);
  };
  const bumpQty = (it, d) => {
    setCart(c => c.map(x => {
      if (x.key !== it.key) return x;
      const step = x.unit === 'kg' ? 0.25 * d : d;
      const nq = Math.round((x.qty + step) * 1000) / 1000;
      return nq <= 0 ? null : { ...x, qty: nq };
    }).filter(Boolean));
  };
  const clearAll = () => { setCart([]); setHeldId(null); setHeldBillNo(null); setCustomer(null); setBillDiscount(0); setNotes(''); };

  // ── hold ──
  const holdBill = async () => {
    if (!cart.length) return toast('Cart is empty', 'err');
    try {
      const body = { id: heldId, customer_id: customer?.id ?? null, items: cart, discount: Number(billDiscount) || 0, notes };
      const s = await api('/sales/hold', { method: 'POST', body });
      toast(`Bill ${s.bill_no} saved on hold`, 'ok');
      clearAll();
      setHeld(await api('/sales/held'));
    } catch (e) { toast(e.message, 'err'); }
  };
  const reopenHeld = async (h) => {
    setHeldId(h.id); setHeldBillNo(h.bill_no);
    setCart(h.items.map(it => ({
      key: Math.random().toString(36).slice(2), product_id: it.product_id, name: it.name, unit: it.unit,
      qty: it.qty, rate: it.rate, discount: it.discount, gst_rate: it.gst_rate, notes: it.notes || ''
    })));
    setCustomer(h.customer_id ? { id: h.customer_id, name: h.customer_name } : null);
    setBillDiscount(0); setNotes(h.notes || '');
    setHeldOpen(false);
    toast(`Reopened held bill ${h.bill_no} — add items & save or pay`, 'ok');
  };
  const discardHeld = async (h) => {
    if (!confirm(`Discard held bill ${h.bill_no}?`)) return;
    await api(`/sales/held/${h.id}`, { method: 'DELETE' });
    setHeld(await api('/sales/held'));
    if (heldId === h.id) clearAll();
  };

  // ── checkout done ──
  const onPaid = async (sale) => {
    setPayOpen(false);
    setDone(sale);
    clearAll();
    load().catch(() => {});
  };

  return (
    <div className="pos-layout">
      {/* LEFT: products */}
      <div className="pos-left">
        <div className="pos-tools">
          <div className="pos-search">
            <Search size={17} />
            <input className="input" placeholder="Search mithai, namkeen, snacks…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <button className="btn" onClick={() => { setHeldOpen(true); }}>
            <FolderOpen size={16} /> Held Bills {held.length > 0 && <span className="badge gold">{held.length}</span>}
          </button>
          <button className="btn" onClick={() => setShiftOpen(true)}>
            <Clock size={16} /> {shift ? 'Shift Open' : 'Open Shift'}
          </button>
        </div>
        <div className="cat-tabs">
          <button className={`cat-tab ${cat === 0 ? 'active' : ''}`} onClick={() => setCat(0)}>All</button>
          {categories.map(c => (
            <button key={c.id} className={`cat-tab ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>
        <div className="prod-grid">
          {filtered.map(p => {
            const out = p.track_stock && p.stock <= 0;
            const low = p.track_stock && !out && p.stock <= p.min_stock;
            return (
              <button key={p.id} className={`prod-card ${out ? 'out' : ''}`} onClick={() => addProduct(p)}>
                {p.track_stock ? <span className={`p-stock ${low || out ? 'low' : ''}`}>{out ? 'Out' : showQty(p.stock, p.unit)}</span> : null}
                <span className="p-emoji">{p.emoji || '🍬'}</span>
                <span className="p-name">{p.name}</span>
                {p.name_hi && <span className="p-hindi">{p.name_hi}</span>}
                <span className="p-price">{fmt(p.price)} <small>/ {p.unit}</small></span>
              </button>
            );
          })}
          {!filtered.length && <div className="empty" style={{ gridColumn: '1/-1' }}><div className="big">🔍</div>No products match</div>}
        </div>
      </div>

      {/* RIGHT: cart */}
      <div className="pos-right">
        <div className="cart-head">
          <div className="row-flex" style={{ justifyContent: 'space-between' }}>
            <b style={{ fontSize: 15 }}>
              {heldId ? <>✏️ Editing held bill <span className="badge gold">{heldBillNo}</span></> : 'Current Bill'}
            </b>
            {cart.length > 0 && <button className="btn sm ghost" onClick={clearAll}><X size={14} /> Clear</button>}
          </div>
          <CustomerPicker customer={customer} setCustomer={setCustomer} onAddNew={() => setCustOpen(true)} />
        </div>

        <div className="cart-items">
          {!cart.length && <div className="empty"><div className="big">🛒</div>Tap products to add.<br />KG items will ask for weight.</div>}
          {cart.map(it => (
            <div className="cart-item" key={it.key}>
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setEditItem(it)}>
                <div className="ci-name">{it.name}</div>
                <div className="ci-meta">
                  {fmt(it.rate)}/{it.unit}
                  {it.discount > 0 && <span style={{ color: 'var(--green)' }}> · −{fmt(it.discount)}</span>}
                  {it.notes && <span> · 📝</span>}
                </div>
              </div>
              <div className="ci-qty">
                <button onClick={() => bumpQty(it, -1)}>−</button>
                <span className="q" onClick={() => setEditItem(it)}>{showQty(it.qty, it.unit)}</span>
                <button onClick={() => bumpQty(it, 1)}>+</button>
              </div>
              <b style={{ width: 72, textAlign: 'right' }}>{fmt(it.qty * it.rate - (it.discount || 0))}</b>
            </div>
          ))}
        </div>

        <div className="cart-totals">
          <div className="tot-row"><span>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
          <div className="tot-row">
            <span>Discount</span>
            <span className="row-flex" style={{ gap: 6 }}>
              <input className="input" style={{ width: 90, padding: '3px 8px', textAlign: 'right' }} type="number" min="0"
                value={billDiscount || ''} placeholder="0" onChange={e => setBillDiscount(e.target.value)} />
            </span>
          </div>
          {gstOn && <div className="tot-row"><span>GST</span><span>{fmt(totals.tax)}</span></div>}
          <div className="tot-row"><span>Round Off</span><span>{totals.round_off >= 0 ? '+' : ''}{totals.round_off.toFixed(2)}</span></div>
          <div className="tot-row grand"><span>Total</span><span>{fmt(totals.total)}</span></div>
        </div>
        <div className="paybar">
          <button className="btn lg" onClick={holdBill} disabled={!cart.length}>
            <Pause size={18} /> {heldId ? 'SAVE HOLD' : 'HOLD BILL'}
          </button>
          <button className="btn primary lg" disabled={!cart.length} onClick={() => setPayOpen(true)}>
            PAY {fmt(totals.total)}
          </button>
        </div>
      </div>

      {/* modals */}
      {weightFor && <WeightModal product={weightFor} onPick={addWeight} onClose={() => setWeightFor(null)} />}
      {editItem && <EditItemModal item={editItem} onSave={(u) => { setCart(c => u ? c.map(x => x.key === u.key ? u : x) : c.filter(x => x.key !== editItem.key)); setEditItem(null); }} onClose={() => setEditItem(null)} />}
      {custOpen && <AddCustomerModal onDone={(cu) => { setCustomer(cu); setCustOpen(false); }} onClose={() => setCustOpen(false)} />}
      {payOpen && <PaymentModal totals={totals} cart={cart} customer={customer} setCustomer={setCustomer}
        heldId={heldId} billDiscount={billDiscount} notes={notes} onPaid={onPaid} onClose={() => setPayOpen(false)} onNewCustomer={() => setCustOpen(true)} />}
      {heldOpen && (
        <Modal title="Held Bills (editable until finalized)" onClose={() => setHeldOpen(false)} size="lg">
          {!held.length && <div className="empty"><div className="big">📂</div>No held bills right now</div>}
          {held.map(h => (
            <div key={h.id} className="card mb" style={{ boxShadow: 'none' }}>
              <div className="card-b row-flex" style={{ justifyContent: 'space-between' }}>
                <div>
                  <b>{h.bill_no}</b> <span className="muted">· {h.customer_name || 'Walk-in'} · {h.created_at?.slice(11, 16)}</span>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {h.items.map(i => `${i.name} (${showQty(i.qty, i.unit)})`).join(', ')}
                  </div>
                </div>
                <div className="row-flex">
                  <b style={{ fontSize: 16 }}>{fmt(h.total)}</b>
                  <button className="btn sm primary" onClick={() => reopenHeld(h)}>Reopen / Edit</button>
                  <button className="btn sm red" onClick={() => discardHeld(h)}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </Modal>
      )}
      {shiftOpen && <ShiftModal shift={shift} onChange={async () => { setShift(await api('/shifts/current')); }} onClose={() => setShiftOpen(false)} />}
      {done && <DoneModal sale={done} onClose={() => setDone(null)} />}
    </div>
  );
}

// ── weight modal for KG items ──
function WeightModal({ product, onPick, onClose }) {
  const [customG, setCustomG] = useState('');
  const amount = (g) => fmt(Math.round(g / 1000 * product.price * 100) / 100);
  return (
    <Modal title={`${product.name} — select weight (${fmt(product.price)}/kg)`} onClose={onClose}>
      <div className="chips">
        {WEIGHTS.map(g => (
          <button key={g} className="chip" onClick={() => onPick(g)}>
            {g < 1000 ? `${g} g` : `${g / 1000} kg`}
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{amount(g)}</div>
          </button>
        ))}
      </div>
      <div className="mt">
        <Field label="Custom weight (grams) — type reading from weighing scale">
          <div className="row-flex">
            <input className="input" style={{ maxWidth: 170 }} type="number" min="1" autoFocus placeholder="e.g. 1250"
              value={customG} onChange={e => setCustomG(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && Number(customG) > 0 && onPick(Number(customG))} />
            <span className="muted">g {customG > 0 && `= ${qty3(customG / 1000)} kg → ${amount(Number(customG))}`}</span>
            <button className="btn primary" disabled={!(Number(customG) > 0)} onClick={() => onPick(Number(customG))}>Add</button>
          </div>
        </Field>
        <div className="muted" style={{ fontSize: 12 }}>⚖️ Digital weighing-scale integration ready — scale reading can auto-fill this field.</div>
      </div>
    </Modal>
  );
}

// ── edit cart item ──
function EditItemModal({ item, onSave, onClose }) {
  const [qty, setQty] = useState(item.unit === 'kg' ? Math.round(item.qty * 1000) : item.qty);
  const [rate, setRate] = useState(item.rate);
  const [discount, setDiscount] = useState(item.discount || 0);
  const [notes, setNotes] = useState(item.notes || '');
  const save = () => {
    const q = item.unit === 'kg' ? Number(qty) / 1000 : Number(qty);
    if (!(q > 0)) return;
    onSave({ ...item, qty: q, rate: Number(rate), discount: Number(discount) || 0, notes });
  };
  return (
    <Modal title={`Edit — ${item.name}`} onClose={onClose} footer={<>
      <button className="btn red" onClick={() => { onSave(null); }}><Trash2 size={15} /> Remove Item</button>
      <button className="btn primary" onClick={save}>Save</button>
    </>}>
      <div className="form-row">
        <Field label={item.unit === 'kg' ? 'Weight (grams)' : `Quantity (${item.unit})`}>
          <input className="input" type="number" value={qty} min="0" autoFocus onChange={e => setQty(e.target.value)} />
        </Field>
        <Field label={`Rate (per ${item.unit})`}>
          <input className="input" type="number" value={rate} min="0" onChange={e => setRate(e.target.value)} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Item discount (₹)">
          <input className="input" type="number" value={discount} min="0" onChange={e => setDiscount(e.target.value)} />
        </Field>
        <Field label="Amount">
          <div className="input" style={{ background: 'var(--surface2)', fontWeight: 800 }}>
            {fmt((item.unit === 'kg' ? qty / 1000 : qty) * rate - (Number(discount) || 0))}
          </div>
        </Field>
      </div>
      <Field label="Notes (e.g. 'pack in gift box')">
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}

// ── customer picker ──
export function CustomerPicker({ customer, setCustomer, onAddNew, compact }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState([]);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!q) { setOpts([]); return; }
    const t = setTimeout(() => api(`/customers?q=${encodeURIComponent(q)}&limit=8`).then(setOpts).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (customer) {
    return (
      <div className="row-flex" style={{ background: 'var(--gold-softer)', border: '1px solid var(--border)', borderRadius: 10, padding: '7px 10px', justifyContent: 'space-between' }}>
        <div>
          <b>{customer.name}</b>
          <small className="muted" style={{ display: 'block' }}>
            {customer.phone || ''} {customer.balance > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}> · Udhaar due {fmt(customer.balance)}</span>}
          </small>
        </div>
        <button className="btn sm ghost" onClick={() => setCustomer(null)}><X size={14} /></button>
      </div>
    );
  }
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <div className="row-flex" style={{ gap: 7 }}>
        <input className="input" placeholder="Walk-in — search name / mobile / ID" value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
        <button className="btn sm" title="Add customer" onClick={onAddNew} style={{ height: 38 }}><UserPlus size={16} /></button>
      </div>
      {open && opts.length > 0 && (
        <div className="card" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '105%', maxHeight: 230, overflowY: 'auto' }}>
          {opts.map(c => (
            <button key={c.id} className="sb-item" style={{ color: 'var(--text)', width: '100%' }}
              onClick={() => { setCustomer(c); setQ(''); setOpen(false); }}>
              <span><b>{c.name}</b> <span className="muted">· {c.phone} · #{c.id}</span>
                {c.balance > 0 && <span style={{ color: 'var(--red)' }}> · due {fmt(c.balance)}</span>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── add customer (inline from POS) ──
export function AddCustomerModal({ onDone, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', phone: '', address: '', notes: '', opening_balance: '' });
  const save = async () => {
    if (!f.name.trim()) return toast('Name is required', 'err');
    try {
      const c = await api('/customers', { method: 'POST', body: { ...f, opening_balance: Number(f.opening_balance) || 0 } });
      toast(`Customer ${c.name} added`, 'ok');
      onDone(c);
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <Modal title="Add Customer" onClose={onClose} footer={<button className="btn primary" onClick={save}>Save Customer</button>}>
      <div className="form-row">
        <Field label="Name *"><input className="input" autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <Field label="Address"><input className="input" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
      <div className="form-row">
        <Field label="Opening balance (old udhaar ₹)"><input className="input" type="number" value={f.opening_balance} onChange={e => setF({ ...f, opening_balance: e.target.value })} /></Field>
        <Field label="Notes"><input className="input" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// ── payment modal ──
function PaymentModal({ totals, cart, customer, setCustomer, heldId, billDiscount, notes, onPaid, onClose, onNewCustomer }) {
  const toast = useToast();
  const [mode, setMode] = useState('cash');
  const [received, setReceived] = useState('');
  const [reference, setReference] = useState('');
  const [splits, setSplits] = useState([{ method: 'cash', amount: '' }, { method: 'upi', amount: '' }]);
  const [udhaarPaidNow, setUdhaarPaidNow] = useState('');
  const [udhaarMethod, setUdhaarMethod] = useState('cash');
  const [busy, setBusy] = useState(false);

  const total = totals.total;
  const change = mode === 'cash' && received !== '' ? Number(received) - total : 0;
  const splitSum = splits.reduce((a, s) => a + (Number(s.amount) || 0), 0);

  const buildPayments = () => {
    if (mode === 'cash') {
      const rec = received === '' ? total : Number(received);
      if (rec < total) throw new Error('Received amount is less than bill total');
      return [{ method: 'cash', amount: total, received: rec }];
    }
    if (mode === 'upi' || mode === 'card') return [{ method: mode, amount: total, reference }];
    if (mode === 'split') {
      if (Math.abs(splitSum - total) > 0.01) throw new Error(`Split total ${fmt(splitSum)} must equal bill total ${fmt(total)}`);
      return splits.filter(s => Number(s.amount) > 0).map(s => ({ method: s.method, amount: Number(s.amount), received: s.method === 'cash' ? Number(s.amount) : undefined }));
    }
    // udhaar: optional part-payment now
    const now = Number(udhaarPaidNow) || 0;
    if (now >= total) throw new Error('Part payment covers full bill — choose Cash/UPI instead');
    return now > 0 ? [{ method: udhaarMethod, amount: now, received: udhaarMethod === 'cash' ? now : undefined }] : [];
  };

  const pay = async () => {
    try {
      if (mode === 'udhaar' && !customer) { toast('Select or add the customer for udhaar sale', 'err'); return; }
      const payments = buildPayments();
      setBusy(true);
      const sale = await api('/sales/checkout', {
        method: 'POST',
        body: { id: heldId, customer_id: customer?.id ?? null, items: cart, discount: Number(billDiscount) || 0, notes, payments }
      });
      onPaid(sale);
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  const Pm = ({ id, icon: Icon, label }) => (
    <button className={`pm ${mode === id ? 'active' : ''}`} onClick={() => setMode(id)}><Icon />{label}</button>
  );

  return (
    <Modal title={`Payment — ${fmt(total)}`} onClose={onClose} footer={
      <button className="btn primary lg" style={{ width: '100%' }} disabled={busy} onClick={pay}>
        <CheckCircle2 size={19} /> {busy ? 'Saving…' : mode === 'udhaar' ? `CONFIRM UDHAAR ${fmt(Math.max(total - (Number(udhaarPaidNow) || 0), 0))}` : `CONFIRM PAYMENT ${fmt(total)}`}
      </button>
    }>
      <div className="pm-grid mb" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
        <Pm id="cash" icon={Banknote} label="Cash" />
        <Pm id="upi" icon={Smartphone} label="UPI" />
        <Pm id="card" icon={CreditCard} label="Card" />
        <Pm id="udhaar" icon={HandCoins} label="Udhaar" />
        <Pm id="split" icon={SplitSquareHorizontal} label="Split" />
      </div>

      {mode === 'cash' && (
        <>
          <div className="form-row">
            <Field label="Bill amount"><div className="input" style={{ fontWeight: 800, background: 'var(--surface2)' }}>{fmt(total)}</div></Field>
            <Field label="Received from customer">
              <input className="input" type="number" autoFocus placeholder={String(total)} value={received} onChange={e => setReceived(e.target.value)} style={{ fontSize: 17, fontWeight: 700 }} />
            </Field>
          </div>
          <div className="chips mb">
            {[total, Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500]
              .filter((v, i, a) => a.indexOf(v) === i)
              .map(v => <button key={v} className="chip" onClick={() => setReceived(String(v))}>{fmt(v)}</button>)}
          </div>
          {received !== '' && (
            <div className="tot-row grand" style={{ color: change < 0 ? 'var(--red)' : 'var(--green)' }}>
              <span>Return change</span><span>{fmt(Math.max(change, 0))}{change < 0 ? ` (short ${fmt(-change)})` : ''}</span>
            </div>
          )}
        </>
      )}

      {(mode === 'upi' || mode === 'card') && (
        <Field label={`${mode.toUpperCase()} reference (optional)`}>
          <input className="input" autoFocus placeholder={mode === 'upi' ? 'UPI txn ID' : 'Card last 4 digits'} value={reference} onChange={e => setReference(e.target.value)} />
        </Field>
      )}

      {mode === 'split' && (
        <>
          {splits.map((s, i) => (
            <div className="form-row mb" key={i} style={{ marginBottom: 8 }}>
              <select className="input" value={s.method} onChange={e => setSplits(sp => sp.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
              </select>
              <input className="input" type="number" placeholder="Amount" value={s.amount}
                onChange={e => setSplits(sp => sp.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
            </div>
          ))}
          <div className="row-flex" style={{ justifyContent: 'space-between' }}>
            <button className="btn sm" onClick={() => setSplits(s => [...s, { method: 'cash', amount: '' }])}>+ Add row</button>
            <b style={{ color: Math.abs(splitSum - total) < 0.01 ? 'var(--green)' : 'var(--red)' }}>
              {fmt(splitSum)} / {fmt(total)}
            </b>
          </div>
        </>
      )}

      {mode === 'udhaar' && (
        <>
          {!customer ? (
            <div className="card mb" style={{ borderColor: 'var(--red)', boxShadow: 'none' }}>
              <div className="card-b">
                <b style={{ color: 'var(--red)' }}>Customer required for Udhaar</b>
                <div className="mt"><CustomerPicker customer={customer} setCustomer={setCustomer} onAddNew={onNewCustomer} /></div>
              </div>
            </div>
          ) : (
            <div className="mb"><CustomerPicker customer={customer} setCustomer={setCustomer} onAddNew={onNewCustomer} /></div>
          )}
          <div className="form-row">
            <Field label="Customer pays now (optional)">
              <input className="input" type="number" placeholder="0" value={udhaarPaidNow} onChange={e => setUdhaarPaidNow(e.target.value)} />
            </Field>
            <Field label="Paid-now method">
              <select className="input" value={udhaarMethod} onChange={e => setUdhaarMethod(e.target.value)}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
              </select>
            </Field>
          </div>
          <div className="tot-row grand" style={{ color: 'var(--maroon)' }}>
            <span>Udhaar (added to khata)</span>
            <span>{fmt(Math.max(total - (Number(udhaarPaidNow) || 0), 0))}</span>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── success + print ──
function DoneModal({ sale, onClose }) {
  return (
    <Modal title="Sale Completed ✅" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>New Sale</button>
      <button className="btn primary" onClick={() => window.open(`/print/receipt/${sale.id}`, '_blank', 'width=450,height=700')}>
        <Printer size={16} /> Print Receipt
      </button>
    </>}>
      <div className="empty" style={{ padding: '10px 0 16px' }}>
        <div className="big">🧾</div>
        <h2 style={{ margin: '4px 0' }}>{sale.bill_no}</h2>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--brown)' }}>{fmt(sale.total)}</div>
        <div className="muted mt">
          {sale.payments.map(p => `${p.method.toUpperCase()} ${fmt(p.amount)}`).join(' + ') || ''}
          {sale.udhaar_amount > 0 && ` ${sale.payments.length ? '+ ' : ''}UDHAAR ${fmt(sale.udhaar_amount)}`}
        </div>
        {sale.payments.some(p => p.change > 0) && (
          <div style={{ marginTop: 8, fontWeight: 800, color: 'var(--green)', fontSize: 18 }}>
            Return change: {fmt(sale.payments.find(p => p.change > 0).change)}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── shift modal ──
function ShiftModal({ shift, onChange, onClose }) {
  const toast = useToast();
  const [opening, setOpening] = useState('2000');
  const [actual, setActual] = useState('');
  const [data, setData] = useState(shift);
  useEffect(() => { api('/shifts/current').then(setData).catch(() => {}); }, []);

  const open = async () => {
    try { await api('/shifts/open', { method: 'POST', body: { opening_cash: Number(opening) || 0 } }); toast('Shift opened', 'ok'); onChange(); onClose(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const close = async () => {
    try {
      const res = await api('/shifts/close', { method: 'POST', body: { actual_cash: actual === '' ? undefined : Number(actual) } });
      toast(`Shift closed. Difference: ${fmt(res.difference)}`, res.difference === 0 ? 'ok' : 'err');
      onChange(); onClose();
    } catch (e) { toast(e.message, 'err'); }
  };

  if (!data) {
    return (
      <Modal title="Open Shift" onClose={onClose} footer={<button className="btn primary" onClick={open}>Open Shift</button>}>
        <Field label="Opening cash in drawer (₹)">
          <input className="input" type="number" autoFocus value={opening} onChange={e => setOpening(e.target.value)} />
        </Field>
      </Modal>
    );
  }
  const c = data.computation || {};
  return (
    <Modal title={`Close Shift (opened ${data.opened_at?.slice(11, 16)})`} onClose={onClose} footer={<button className="btn red solid" onClick={close}>Close Shift</button>}>
      <table className="tbl">
        <tbody>
          <tr><td>Opening Cash</td><td className="num">{fmt(data.opening_cash)}</td></tr>
          <tr><td>Cash Sales</td><td className="num">{fmt(c.cashSales)}</td></tr>
          <tr><td>Cash Udhaar Collection</td><td className="num">{fmt(c.cashUdhaar)}</td></tr>
          <tr><td>Cash Refunds</td><td className="num">−{fmt(c.cashRefunds)}</td></tr>
          <tr><td>Cash Expenses</td><td className="num">−{fmt(c.cashExpenses)}</td></tr>
          <tr><td><b>Expected Cash</b></td><td className="num"><b>{fmt(c.expected)}</b></td></tr>
          <tr><td className="muted">UPI / Card (info)</td><td className="num muted">{fmt(c.upiSales)} / {fmt(c.cardSales)}</td></tr>
        </tbody>
      </table>
      <Field label="Actual cash counted in drawer">
        <input className="input" type="number" autoFocus placeholder={String(c.expected ?? '')} value={actual} onChange={e => setActual(e.target.value)} />
      </Field>
      {actual !== '' && (
        <div className="tot-row grand" style={{ color: Number(actual) - c.expected === 0 ? 'var(--green)' : 'var(--red)' }}>
          <span>Difference</span><span>{fmt(Number(actual) - c.expected)}</span>
        </div>
      )}
    </Modal>
  );
}
