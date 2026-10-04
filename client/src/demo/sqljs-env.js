// Vite/browser environment for sql.js: bundle the wasm as an asset.
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
export const sqlJsOptions = { locateFile: () => wasmUrl };
