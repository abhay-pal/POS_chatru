import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../App.jsx';

export default function Login() {
  const { login } = useApp();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await login(username, password); nav('/'); }
    catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.png" alt="Chatru Halwai" />
        <h1>Chatru Halwai</h1>
        <div className="sub">Sweet Shop POS</div>
        <div className="field" style={{ textAlign: 'left' }}>
          <label>Username</label>
          <input className="input" value={username} onChange={e => setUsername(e.target.value)} autoFocus placeholder="owner / manager / ramesh" />
        </div>
        <div className="field" style={{ textAlign: 'left' }}>
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" />
        </div>
        {err && <div style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 10 }}>{err}</div>}
        <button className="btn primary xl" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
        <div className="demo-creds">
          <b>Demo logins:</b><br />
          Owner — <code>owner</code> / <code>owner123</code><br />
          Manager — <code>manager</code> / <code>manager123</code><br />
          Cashier — <code>ramesh</code> / <code>1234</code>
        </div>
      </form>
    </div>
  );
}
