// API client + shared helpers
const TOKEN_KEY = 'pos_token';

// ── base-path helpers (GitHub Pages serves the app under /POS_chatru/) ──
export const BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
export const withBase = (p) => BASE + (p.startsWith('/') ? p : '/' + p);
export const assetUrl = (p) => (!p || /^(https?:|data:)/.test(p)) ? p : withBase(p);

// Token lives in memory first; browser storage is best-effort only, because
// embedded/iframe previews (and Safari) can block localStorage entirely.
let memToken = null;
const stores = () => {
  const out = [];
  try { if (window.localStorage) out.push(window.localStorage); } catch { /* blocked */ }
  try { if (window.sessionStorage) out.push(window.sessionStorage); } catch { /* blocked */ }
  return out;
};
export const getToken = () => {
  if (memToken) return memToken;
  for (const s of stores()) {
    try { const t = s.getItem(TOKEN_KEY); if (t) { memToken = t; return t; } } catch { /* ignore */ }
  }
  return null;
};
export const setToken = (t) => {
  memToken = t;
  for (const s of stores()) {
    try { t ? s.setItem(TOKEN_KEY, t) : s.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }
};

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers,
    body: opts.body != null && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    setToken(null);
    // soft redirect, and never loop if we're already on the login page
    if (!window.location.pathname.startsWith(withBase('/login'))) window.location.href = withBase('/login');
    throw new Error('Session expired — please sign in again');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data;
}

// ── formatting ──
export const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const fmt0 = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
export const qty3 = (n) => {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
};
export function showQty(qty, unit) {
  if (unit === 'kg') {
    const v = Number(qty);
    if (v < 1) return `${Math.round(v * 1000)} g`;
    return `${qty3(v)} kg`;
  }
  return `${qty3(qty)} ${unit}`;
}
export const fmtDate = (s) => {
  if (!s) return '';
  const [d, t] = String(s).split(' ');
  const [y, m, dd] = d.split('-');
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1];
  return `${dd}-${M}-${y}${t ? ' ' + t.slice(0, 5) : ''}`;
};
export const fmtDay = (s) => fmtDate(String(s || '').slice(0, 10));

// ── date ranges (IST) ──
export function todayStr(offset = 0) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
  const d = new Date(Date.now() + offset * 86400000);
  return p.format(d);
}
export const RANGE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'custom', label: 'Custom' }
];
export function presetRange(id) {
  const t = todayStr();
  if (id === 'today') return { from: t, to: t };
  if (id === 'yesterday') { const y = todayStr(-1); return { from: y, to: y }; }
  if (id === '7d') return { from: todayStr(-6), to: t };
  if (id === 'month') return { from: t.slice(0, 8) + '01', to: t };
  if (id === 'last_month') {
    const [y, m] = t.split('-').map(Number);
    const pm = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
    const last = new Date(pm.y, pm.m, 0).getDate();
    const mm = String(pm.m).padStart(2, '0');
    return { from: `${pm.y}-${mm}-01`, to: `${pm.y}-${mm}-${String(last).padStart(2, '0')}` };
  }
  return { from: t, to: t };
}

// CSV download helper
export function downloadCSV(filename, columns, rows) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [columns.map(c => esc(c.label)).join(','),
    ...rows.map(r => columns.map(c => esc(r[c.key])).join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const UNITS = ['kg', 'piece', 'plate', 'box', 'packet', 'cup', 'litre', 'g', 'custom'];
export const STATUS_LABEL = { held: 'Held', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded', partial_refund: 'Partial Refund' };
