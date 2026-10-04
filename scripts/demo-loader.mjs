// Node ESM loader mirroring the vite 'pos-server-shims' plugin, so the
// browser demo API can be smoke-tested in Node (sql.js has a Node build).
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = (f) => pathToFileURL(path.join(root, 'client', 'src', 'demo', f)).href;

export async function resolve(specifier, context, nextResolve) {
  const parent = (context.parentURL || '').replace(/\\/g, '/');
  if (parent.includes('/server/')) {
    if (specifier === 'express') return { url: demo('express-shim.js'), shortCircuit: true };
    if (specifier === '../db.js' || specifier === './db.js') return { url: demo('db-browser.js'), shortCircuit: true };
  }
  if (specifier === './sqljs-env.js' && parent.includes('/demo/')) {
    return { url: demo('sqljs-env.node.mjs'), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
