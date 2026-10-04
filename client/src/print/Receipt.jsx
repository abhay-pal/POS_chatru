import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmt, showQty, assetUrl } from '../api.js';

export default function PrintReceipt() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [size, setSize] = useState(null);

  useEffect(() => {
    api(`/sales/${id}/receipt`).then(d => {
      setData(d);
      setSize(d.settings.receipt_size === '58' ? '58' : '80');
      setTimeout(() => window.print(), 500);
    }).catch(() => {});
  }, [id]);

  if (!data) return <div className="print-page">Loading receipt…</div>;
  const { sale, business, settings } = data;
  const isReprint = ['completed', 'refunded', 'partial_refund'].includes(sale.status) && window.location.search.includes('reprint');

  return (
    <div className="print-page">
      <div className="no-print row-flex">
        <div className="seg">
          <button className={size === '58' ? 'active' : ''} onClick={() => setSize('58')}>58mm</button>
          <button className={size === '80' ? 'active' : ''} onClick={() => setSize('80')}>80mm</button>
        </div>
        <button className="btn primary" onClick={() => window.print()}>🖨️ Print</button>
        <button className="btn" onClick={() => window.close()}>Close</button>
      </div>

      <div className={`receipt w${size}`}>
        <div className="c">
          {business.logo && <img className="rlogo" src={assetUrl(business.logo)} alt="" />}
          <div className="b xl">{business.name?.toUpperCase()}</div>
          {business.tagline && <div>{business.tagline}</div>}
          <div>{business.address}</div>
          <div>Ph: {business.phone}</div>
          {business.gstin && <div>GSTIN: {business.gstin}</div>}
          {business.fssai && <div>FSSAI: {business.fssai}</div>}
        </div>
        <hr />
        <table>
          <tbody>
            <tr><td>Bill No: <b>{sale.bill_no}</b></td><td className="rt">{sale.created_at?.slice(0, 10)}</td></tr>
            <tr><td>Cashier: {sale.cashier_name || '-'}</td><td className="rt">{(sale.completed_at || sale.created_at)?.slice(11, 16)}</td></tr>
            {sale.customer_name && <tr><td colSpan={2}>Customer: {sale.customer_name} {sale.customer_phone ? `(${sale.customer_phone})` : ''}</td></tr>}
            {isReprint && <tr><td colSpan={2} className="b c">*** DUPLICATE / REPRINT ***</td></tr>}
            {sale.status === 'cancelled' && <tr><td colSpan={2} className="b c">*** CANCELLED BILL ***</td></tr>}
          </tbody>
        </table>
        <hr />
        <table>
          <thead>
            <tr className="b"><th style={{ textAlign: 'left' }}>ITEM</th><th className="rt">QTY</th><th className="rt">RATE</th><th className="rt">AMT</th></tr>
          </thead>
          <tbody>
            {sale.items.map(it => (
              <tr key={it.id}>
                <td>{it.name}{it.discount > 0 ? ` (-₹${it.discount})` : ''}</td>
                <td className="rt">{showQty(it.qty, it.unit).replace(' ', '')}</td>
                <td className="rt">{it.rate}</td>
                <td className="rt">{(it.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr />
        <table>
          <tbody>
            <tr><td>Subtotal</td><td className="rt">{sale.subtotal.toFixed(2)}</td></tr>
            {sale.discount > 0 && <tr><td>Discount</td><td className="rt">-{sale.discount.toFixed(2)}</td></tr>}
            {settings.gst_enabled && <tr><td>GST</td><td className="rt">{sale.tax.toFixed(2)}</td></tr>}
            {sale.round_off !== 0 && <tr><td>Round Off</td><td className="rt">{sale.round_off > 0 ? '+' : ''}{sale.round_off.toFixed(2)}</td></tr>}
            <tr className="b xl"><td>TOTAL</td><td className="rt">₹{sale.total.toFixed(2)}</td></tr>
          </tbody>
        </table>
        <hr />
        <table>
          <tbody>
            {sale.payments.filter(p => p.kind === 'sale').map(p => (
              <React.Fragment key={p.id}>
                <tr><td>Paid ({p.method.toUpperCase()})</td><td className="rt">{p.amount.toFixed(2)}</td></tr>
                {p.received != null && p.received !== p.amount && <>
                  <tr><td>Received</td><td className="rt">{p.received.toFixed(2)}</td></tr>
                  <tr><td>Change</td><td className="rt">{(p.change || 0).toFixed(2)}</td></tr>
                </>}
              </React.Fragment>
            ))}
            {sale.udhaar_amount > 0 && <tr className="b"><td>UDHAAR (Khata)</td><td className="rt">{sale.udhaar_amount.toFixed(2)}</td></tr>}
          </tbody>
        </table>
        <hr />
        <div className="c b">{settings.receipt_footer || 'Thank You! Visit Again'}</div>
        <div className="c" style={{ fontSize: 10 }}>-- {business.name} --</div>
      </div>
    </div>
  );
}
