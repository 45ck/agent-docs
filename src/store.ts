/**
 * specgraph store — re-exports the SQLite store implementation.
 *
 * The implementation lives in src/v2/store.ts; this shim preserves the
 * canonical import path `./store.js` while keeping the v2/ layout intact.
 * Use `openStore(root)` to obtain a `SpecStore` instance.
 */
export * from './v2/store.js';
