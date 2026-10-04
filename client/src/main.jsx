import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

async function boot() {
  // Demo mode (GitHub Pages): the entire backend runs in the browser via
  // sql.js (SQLite → WASM), executing the same server route files.
  if (import.meta.env.VITE_DEMO === '1') {
    const { installDemoApi } = await import('./demo/server.js');
    await installDemoApi();
  }
  createRoot(document.getElementById('root')).render(<App />);
}
boot();
