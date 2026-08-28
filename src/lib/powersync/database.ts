import { PowerSyncDatabase, WASQLiteVFS, type WebSQLOpenOptions } from '@powersync/web';
import { AppSchema } from './app-schema';

// Path to the worker asset copied into `public/@powersync/worker` by
// `scripts/copy-powersync-worker.mjs` (wired up as a `postinstall` step). We
// load the worker from a static URL instead of relying on bundler-rewritten
// `new URL('./worker.js', import.meta.url)` resolution, since that pattern is
// not reliably supported by Next.js's build pipeline.
const POWERSYNC_WORKER_URL = '/@powersync/worker/worker.js';

const DB_FILENAME = 'planner.sqlite';

function supportsOPFS(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function'
  );
}

function supportsSharedWorker(): boolean {
  return typeof window !== 'undefined' && 'SharedWorker' in window;
}

// Prefer OPFSCoopSyncVFS for reliable, multi-tab-safe persistence (this is
// the VFS PowerSync recommends for Safari/iOS). Fall back to the library's
// default IndexedDB-backed VFS only when the browser lacks OPFS support.
const databaseOptions: WebSQLOpenOptions = {
  dbFilename: DB_FILENAME,
  vfs: supportsOPFS() ? WASQLiteVFS.OPFSCoopSyncVFS : WASQLiteVFS.IDBBatchAtomicVFS,
  enableMultiTabs: supportsSharedWorker(),
  worker: POWERSYNC_WORKER_URL,
};

// A single, module-level PowerSyncDatabase instance for the `planner.sqlite`
// database filename. Import this from client modules/the provider only -
// PowerSync's SSR mode (auto-detected when `window` is unavailable) makes
// this safe to import during server rendering, but no domain code should
// execute SQL against it before the browser has a real session.
export const plannerDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: databaseOptions,
  sync: { worker: POWERSYNC_WORKER_URL },
});
