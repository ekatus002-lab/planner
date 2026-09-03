import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @powersync/web and @journeyapps/wa-sqlite are browser-only (Worker/
  // SharedWorker, IndexedDB, OPFS) and ship a pre-bundled worker that is
  // served as a static asset from `public/@powersync/worker` (see
  // `scripts/copy-powersync-worker.mjs`). Keep them out of Next's server
  // bundling/transform pipeline entirely.
  serverExternalPackages: ['@powersync/web', '@journeyapps/wa-sqlite'],

  // The OPFSCoopSyncVFS worker PowerSync loads for local-first storage uses
  // `SharedArrayBuffer` for its synchronous access handle pool. Browsers only
  // expose `SharedArrayBuffer` in a cross-origin-isolated context, so every
  // route (the document and the worker/wasm assets it dynamically imports
  // from `/@powersync/worker`) needs these two headers - without them,
  // `SharedArrayBuffer` is undefined and the worker fails to load.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

export default nextConfig;
