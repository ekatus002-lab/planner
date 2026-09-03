// Split out of `database.ts` so these pure capability checks can be unit
// tested without triggering `database.ts`'s module-level `new
// PowerSyncDatabase(...)` side effect, which opens a real `Worker` and fails
// outside a browser (including under Vitest's jsdom environment).

// `OPFSCoopSyncVFS` needs both the File System Access API
// (`navigator.storage.getDirectory`) *and* a cross-origin-isolated context:
// it uses `SharedArrayBuffer` for its synchronous access-handle pool, which
// browsers only expose when `Cross-Origin-Opener-Policy` and
// `Cross-Origin-Embedder-Policy` are set (see `next.config.ts`'s
// `headers()`). Checking only the first condition is not enough - if those
// headers are ever stripped by a hosting layer/CDN/reverse proxy that
// doesn't propagate custom headers, `navigator.storage.getDirectory` would
// still exist but `SharedArrayBuffer` would not, and unconditionally
// selecting `OPFSCoopSyncVFS` would fail with "Failed to fetch dynamically
// imported module" instead of gracefully falling back to
// `IDBBatchAtomicVFS`.
export function supportsOPFS(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function' &&
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.crossOriginIsolated === true
  );
}

export function supportsSharedWorker(): boolean {
  return typeof window !== 'undefined' && 'SharedWorker' in window;
}
