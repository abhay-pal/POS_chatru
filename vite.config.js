import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.join(__dirname, 'client', 'src', 'demo');

// When server/* files are bundled for the in-browser demo, swap their
// Node-only dependencies for browser equivalents.
const serverShims = {
  name: 'pos-server-shims',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer) return null;
    const imp = importer.replace(/\\/g, '/');
    if (!imp.includes('/server/')) return null;
    if (source === 'express') return path.join(DEMO_DIR, 'express-shim.js');
    if (source === '../db.js' || source === './db.js') return path.join(DEMO_DIR, 'db-browser.js');
    return null;
  }
};

export default defineConfig({
  root: 'client',
  plugins: [serverShims, react()],
  build: {
    target: 'es2022' // top-level await (sql.js WASM init in demo mode)
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true }
    }
  }
});
