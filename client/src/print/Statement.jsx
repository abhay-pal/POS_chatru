import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, fmt, fmtDay, showQty, assetUrl } from '../api.js';

export default function PrintStatement() {
  const { customerId } = useParams();
  const [sp] = useSearchParams();
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('a4'); // a4 | thermal

  const from = sp.get('from'), to = sp.get('to');
  useEffect(() => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    api(`/customers/${customerId}/ledger?${qs}`).then(setData).catch(() => {});
  }, [customerId]);

  if (!data) return <div className="print-page">Loading statement…</div>;
  const { customer, entries, totals, business } = data;
  const period = from || to ? `${from ? fmtDay(from) : 'Start'} to ${to ? fmtDay(to) : 'Today'}` : 'Full history';

  const typeLabel = { opening: 'Opening Balance', sale: 'Udhaar Sale', payment: 'Payment Received', adjustment: 'Adjustment', refund: 'Refund' };

  return (
    <div className="print-page">
      <div className="no-print row-flex">
        <div className="seg">
          <button className={mode === 'a4' ? 'active' : ''} onClick={() => setMode('a4')}>A4</button>
          <button className={mode === 'thermal' ? 'active' : ''} onClick={() => setMode('thermal')}>Thermal 80mm</button>
        </div>
        <button className="btn primary" onClick={() => window.print()}>🖨️ Print</button>
        <button className="btn" onClick={() => window.close()}>Close</button>
      </div>

      {mode === 'a4' ? (
        <div className="statement-a4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px double #b8860b', paddingBottom: 10, marginBottom: 14 }}>
            <div>
              <h1 style={{ margin: 0, color: '#3d2b14' }}>{business.name}</h1>
              <div>{business.address} · Ph: {business.phone}</div>
              {business.gstin && <div>GSTIN: {business.gstin}</div>}
            </div>
            {business.logo && <img src={assetUrl(business.logo)} style={{ width: 70, height: 70 }} alt="" />}
          </div>
          <h2 style={{ margin: '0 0 4px' }}>Udhaar Statement (Khata)</h2>
          <table style={{ marginBottom: 12, border: 0 }}>
            <tbody>
              <tr>
                <td style={{ border: 0, padding: '2px 0' }}><b>Customer:</b> {customer.name} · {customer.phone} {customer.address ? `· ${customer.address}` : ''}</td>
                <td style={{ border: 0, padding: '2px 0', textAlign: 'right' }}><b>Period:</b> {period}</td>
              </tr>
            </tbody>
          </table>
          <table>
            <thead>
              <tr><th>Date</th><th>Bill No.</th><th>Particulars</th><th style={{ textAlign: 'right' }}>Udhaar (₹)</th><th style={{ textAlign: 'right' }}>Received (₹)</th><th style={{ textAlign: 'right' }}>Balance (₹)</th></tr>
            </thead>
            <tbody>
              {totals.opening !== 0 && (
                <tr><td colSpan={5}><b>Opening balance (before period)</b></td><td style={{ textAlign: 'right' }}><b>{totals.opening.toFixed(2)}</b></td></tr>
              )}
              {entries.map(e => (
                <tr key={e.id}>
                  <td>{fmtDay(e.created_at)}</td>
                  <td>{e.bill || e.reference || '-'}</td>
                  <td>
                    {typeLabel[e.type] || e.type}{e.method ? ` (${e.method.toUpperCase()})` : ''}
                    {e.items && (
                      <div style={{ fontSize: 11, color: '#555' }}>
                        {e.items.map((it, i) => <div key={i}>{it.name} — {showQty(it.qty, it.unit)} × ₹{it.rate} = ₹{it.amount.toFixed(2)}</div>)}
                        {e.paid_at_sale > 0 && <div>Bill total ₹{e.bill_total?.toFixed(2)} − paid at counter ₹{e.paid_at_sale.toFixed(2)}</div>}
                      </div>
                    )}
                    {e.notes && !e.items ? <div style={{ fontSize: 11, color: '#555' }}>{e.notes}</div> : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>{e.amount > 0 ? e.amount.toFixed(2) : ''}</td>
                  <td style={{ textAlign: 'right' }}>{e.amount < 0 ? (-e.amount).toFixed(2) : ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{e.running_balance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f3e5c3' }}>
                <td colSpan={3}><b>TOTALS</b></td>
                <td style={{ textAlign: 'right' }}><b>{totals.total_debits.toFixed(2)}</b></td>
                <td style={{ textAlign: 'right' }}><b>{totals.total_credits.toFixed(2)}</b></td>
                <td style={{ textAlign: 'right' }}><b>{totals.closing.toFixed(2)}</b></td>
              </tr>
            </tfoot>
          </table>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#555' }}>Generated on {new Date().toLocaleString('en-IN')} · {business.name} Sweet Shop POS</div>
            <div style={{ border: '2px solid #8c2f23', color: '#8c2f23', padding: '8px 18px', borderRadius: 8, fontSize: 18, fontWeight: 800 }}>
              TOTAL PENDING: ₹{totals.current_balance.toFixed(2)}
            </div>
          </div>
        </div>
      ) : (
        <div className="receipt w80">
          <div className="c">
            <div className="b xl">{business.name?.toUpperCase()}</div>
            <div>{business.address}</div>
            <div>Ph: {business.phone}</div>
          </div>
          <hr />
          <div className="c b">UDHAAR STATEMENT</div>
          <div>Customer: <b>{customer.name}</b></div>
          <div>Phone: {customer.phone}</div>
          <div>Period: {period}</div>
          <hr />
          {totals.opening !== 0 && <div>Opening Balance: <b>₹{totals.opening.toFixed(2)}</b></div>}
          {entries.map(e => (
            <div key={e.id} style={{ marginBottom: 3 }}>
              <div className="b">{fmtDay(e.created_at)} · {e.bill || typeLabel[e.type]}</div>
              {e.items && e.items.map((it, i) => (
                <table key={i}><tbody><tr>
                  <td>{it.name}</td><td className="rt">{showQty(it.qty, it.unit)} × {it.rate}</td><td className="rt">{it.amount.toFixed(2)}</td>
                </tr></tbody></table>
              ))}
              <table><tbody><tr>
                <td>{e.amount > 0 ? 'Udhaar +' : 'Received -'}{Math.abs(e.amount).toFixed(2)}</td>
                <td className="rt">Bal: {e.running_balance.toFixed(2)}</td>
              </tr></tbody></table>
            </div>
          ))}
          <hr />
          <table><tbody>
            <tr><td>Total Purchases</td><td className="rt">{totals.total_debits.toFixed(2)}</td></tr>
            <tr><td>Total Payments</td><td className="rt">{totals.total_credits.toFixed(2)}</td></tr>
            <tr className="b xl"><td>TOTAL PENDING</td><td className="rt">₹{totals.current_balance.toFixed(2)}</td></tr>
          </tbody></table>
          <hr />
          <div className="c b">Kripya samay par bhugtan karein 🙏</div>
        </div>
      )}
    </div>
  );
}
