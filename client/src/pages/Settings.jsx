import React, { useEffect, useState } from 'react';
import { api, fmt, assetUrl } from '../api.js';
import { Field, useToast } from '../components/ui.jsx';
import { useApp } from '../App.jsx';

export default function Settings() {
  const toast = useToast();
  const { business, setBusiness } = useApp();
  const [b, setB] = useState(null);
  const [s, setS] = useState(null);

  useEffect(() => {
    api('/business').then(setB);
    api('/settings').then(setS);
  }, []);

  if (!b || !s) return <div className="page"><div className="empty">Loading…</div></div>;

  const saveBusiness = async () => {
    try {
      const nb = await api('/business', { method: 'PUT', body: b });
      setBusiness(nb);
      toast('Shop profile saved — branding updated', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
  const saveSettings = async () => {
    try { setS(await api('/settings', { method: 'PUT', body: s })); toast('Settings saved', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
  const backup = async () => {
    const dump = {};
    for (const ep of ['business', 'settings', 'products?active=true', 'categories', 'customers', 'suppliers', 'raw-materials']) {
      dump[ep.split('?')[0]] = await api('/' + ep);
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast('Backup downloaded', 'ok');
  };

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="chart-grid">
        <div className="card">
          <div className="card-h">🏪 Shop Profile & Branding
            <span className="muted spacer" style={{ fontWeight: 400, fontSize: 12 }}>same POS, any sweet shop — just change these</span>
          </div>
          <div className="card-b">
            <Field label="Shop name"><input className="input" value={b.name || ''} onChange={e => setB({ ...b, name: e.target.value })} /></Field>
            <Field label="Tagline"><input className="input" value={b.tagline || ''} onChange={e => setB({ ...b, tagline: e.target.value })} /></Field>
            <Field label="Logo URL (shown in sidebar, login & receipts)">
              <div className="row-flex">
                <img src={assetUrl(b.logo || '/logo.png')} alt="" style={{ width: 44, height: 44, borderRadius: 10, border: '1px solid var(--border)' }} />
                <input className="input" value={b.logo || ''} onChange={e => setB({ ...b, logo: e.target.value })} />
              </div>
            </Field>
            <Field label="Address"><input className="input" value={b.address || ''} onChange={e => setB({ ...b, address: e.target.value })} /></Field>
            <div className="form-row">
              <Field label="Phone"><input className="input" value={b.phone || ''} onChange={e => setB({ ...b, phone: e.target.value })} /></Field>
              <Field label="Email"><input className="input" value={b.email || ''} onChange={e => setB({ ...b, email: e.target.value })} /></Field>
            </div>
            <div className="form-row">
              <Field label="GSTIN"><input className="input" value={b.gstin || ''} onChange={e => setB({ ...b, gstin: e.target.value })} /></Field>
              <Field label="FSSAI"><input className="input" value={b.fssai || ''} onChange={e => setB({ ...b, fssai: e.target.value })} /></Field>
            </div>
            <button className="btn primary" onClick={saveBusiness}>Save Shop Profile</button>
          </div>
        </div>

        <div className="card">
          <div className="card-h">🧾 Billing & Invoice</div>
          <div className="card-b">
            <div className="form-row">
              <Field label="Invoice prefix"><input className="input" value={s.invoice_prefix || ''} onChange={e => setS({ ...s, invoice_prefix: e.target.value })} /></Field>
              <Field label="Next bill number"><div className="input" style={{ background: 'var(--surface2)' }}>{s.invoice_prefix}-{String((s.bill_seq || 0) + 1).padStart(5, '0')}</div></Field>
            </div>
            <div className="form-row">
              <Field label="GST on bills">
                <select className="input" value={s.gst_enabled === false ? '0' : '1'} onChange={e => setS({ ...s, gst_enabled: e.target.value === '1' })}>
                  <option value="1">ON — add GST per product rate</option>
                  <option value="0">OFF — no GST on bills</option>
                </select>
              </Field>
              <Field label="Round off totals">
                <select className="input" value={s.round_off === false ? '0' : '1'} onChange={e => setS({ ...s, round_off: e.target.value === '1' })}>
                  <option value="1">Yes — round to nearest ₹</option>
                  <option value="0">No — exact paise</option>
                </select>
              </Field>
            </div>
            <div className="form-row">
              <Field label="Default GST % (new products)">
                <select className="input" value={s.default_gst ?? 5} onChange={e => setS({ ...s, default_gst: Number(e.target.value) })}>
                  {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                </select>
              </Field>
              <Field label="Discount limit without manager (%)">
                <input className="input" type="number" value={s.discount_limit_pct ?? 10} onChange={e => setS({ ...s, discount_limit_pct: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Receipt size (thermal printer)">
                <select className="input" value={s.receipt_size || '80'} onChange={e => setS({ ...s, receipt_size: e.target.value })}>
                  <option value="58">58mm</option><option value="80">80mm</option>
                </select>
              </Field>
              <Field label="Receipt footer">
                <input className="input" value={s.receipt_footer || ''} onChange={e => setS({ ...s, receipt_footer: e.target.value })} />
              </Field>
            </div>
            <button className="btn primary" onClick={saveSettings}>Save Billing Settings</button>
          </div>
        </div>

        <div className="card">
          <div className="card-h">⚖️ Weighing & Payments</div>
          <div className="card-b">
            <Field label="Quick weight buttons (grams, comma separated)">
              <input className="input" value={(s.weight_presets_g || []).join(', ')}
                onChange={e => setS({ ...s, weight_presets_g: e.target.value.split(',').map(x => Number(x.trim())).filter(Boolean) })} />
            </Field>
            <Field label="Enabled payment methods">
              <div className="row-flex">
                {['cash', 'upi', 'card', 'udhaar'].map(m => (
                  <label key={m} className="row-flex" style={{ gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={(s.payment_methods || ['cash', 'upi', 'card', 'udhaar']).includes(m)}
                      onChange={e => {
                        const cur = new Set(s.payment_methods || ['cash', 'upi', 'card', 'udhaar']);
                        e.target.checked ? cur.add(m) : cur.delete(m);
                        setS({ ...s, payment_methods: [...cur] });
                      }} /> {m.toUpperCase()}
                  </label>
                ))}
              </div>
            </Field>
            <div className="muted mb" style={{ fontSize: 12.5 }}>
              ⚖️ Architecture is ready for digital weighing-scale integration (serial/USB scale can push grams straight into the POS weight field).
            </div>
            <button className="btn primary" onClick={saveSettings}>Save</button>
          </div>
        </div>

        <div className="card">
          <div className="card-h">💾 Backup / Export</div>
          <div className="card-b">
            <p className="muted" style={{ marginTop: 0 }}>
              Download a JSON backup of masters (shop, settings, products, categories, customers, suppliers, raw materials).
              Full transaction exports are available per-report in <b>Reports → Excel/CSV</b>.
            </p>
            <button className="btn" onClick={backup}>⬇ Download Backup</button>
          </div>
        </div>
      </div>
    </div>
  );
}
