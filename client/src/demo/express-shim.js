// Minimal express.Router() stand-in for demo mode: just records routes so the
// in-browser dispatcher (server.js) can match and execute them.
export function Router() {
  const routes = [];
  const r = { routes };
  for (const m of ['get', 'post', 'put', 'delete']) {
    r[m] = (path, ...handlers) => { routes.push({ method: m.toUpperCase(), path, handlers }); return r; };
  }
  r.use = () => r;
  return r;
}
export default { Router };
