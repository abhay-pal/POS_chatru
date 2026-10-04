// ─── Demo-mode API: runs the REAL server routes inside the browser ─────────
// The vite plugin (see vite.config.js) aliases 'express' → express-shim and
// server '../db.js' → db-browser (sql.js/WASM). This module replicates the
// thin express app from server/index.js (auth + mounting) and intercepts
// window.fetch('/api/...') so the whole POS works statically (GitHub Pages).
import masters from '../../../server/routes/masters.js';
import salesRoutes from '../../../server/routes/sales.js';
import ops from '../../../server/routes/ops.js';
import analytics from '../../../server/routes/analytics.js';
import { permsFor } from '../../../server/perm.js';
import { seedIfEmpty } from '../../../server/seed.js';
import { get, run, now, persistSoon } from './db-browser.js';

const ROUTES = [...masters.routes, ...salesRoutes.routes, ...ops.routes, ...analytics.routes];

function matchRoute(method, path) {
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const pp = r.path.split('/').filter(Boolean);
    const aa = path.split('/').filter(Boolean);
    if (pp.length !== aa.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(aa[i]);
      else if (pp[i] !== aa[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

const randToken = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');

export async function demoFetch(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const u = new URL(url, 'http://demo.local');
  const path = u.pathname.replace(/^\/api/, '') || '/';
  const query = Object.fromEntries(u.searchParams.entries());
  let body = {};
  try { body = opts.body ? JSON.parse(opts.body) : {}; } catch { body = {}; }
  const authHeader = (opts.headers && (opts.headers.Authorization || opts.headers.authorization)) || '';
  const token = authHeader.replace('Bearer ', '');

  const reply = (status, data, contentType = 'application/json') =>
    new Response(contentType === 'application/json' ? JSON.stringify(data) : data,
      { status, headers: { 'Content-Type': contentType } });

  try {
    // ── auth endpoints (mirror server/index.js) ──
    if (path === '/auth/login' && method === 'POST') {
      const user = get('SELECT * FROM users WHERE username = ? AND active = 1', String(body.username || '').trim().toLowerCase());
      if (!user || user.password !== String(body.password || '')) return reply(401, { error: 'Invalid username or password' });
      const t = randToken();
      run('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)', t, user.id, now());
      persistSoon();
      return reply(200, { token: t, user: { id: user.id, name: user.name, username: user.username, role: user.role }, perms: permsFor(user.role) });
    }
    const row = token && get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', token);
    if (!row) return reply(401, { error: 'Not authenticated' });
    const user = { id: row.id, name: row.name, username: row.username, role: row.role };
    if (path === '/auth/me') return reply(200, { user, perms: permsFor(user.role) });

    // ── dispatch to the real route handlers ──
    const m = matchRoute(method, path);
    if (!m) return reply(404, { error: 'Not found: ' + method + ' ' + path });

    const req = { method, params: m.params, query, body, user, headers: {} };
    let status = 200, payload, contentType = 'application/json', finished = false;
    const res = {
      status(s) { status = s; return res; },
      json(d) { payload = JSON.stringify(d); finished = true; return res; },
      send(d) { payload = typeof d === 'string' ? d : JSON.stringify(d); contentType = contentType === 'application/json' && typeof d === 'string' ? 'text/plain' : contentType; finished = true; return res; },
      setHeader(k, v) { if (k.toLowerCase() === 'content-type') contentType = v; return res; }
    };
    // run handler chain (supports requirePerm middleware)
    for (const handler of m.route.handlers) {
      let nextCalled = false;
      await handler(req, res, () => { nextCalled = true; });
      if (finished) break;
      if (!nextCalled) break;
    }
    if (!finished) return reply(500, { error: 'No response from handler' });
    if (method !== 'GET') persistSoon();
    return new Response(payload, { status, headers: { 'Content-Type': contentType } });
  } catch (e) {
    return reply(400, { error: e.message || 'Something went wrong' });
  }
}

export async function installDemoApi() {
  seedIfEmpty();                 // first visit: generate the full Chatru Halwai dataset
  persistSoon();
  if (typeof window !== 'undefined') {
    window.__POS_DEMO__ = true;
    const origFetch = window.fetch.bind(window);
    window.fetch = (input, opts) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/api/') || url.startsWith('/api?') || url === '/api') return demoFetch(url, opts);
      return origFetch(input, opts);
    };
  }
}
