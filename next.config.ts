import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @powersync/web and @journeyapps/wa-sqlite are browser-only (Worker/
  // SharedWorker, IndexedDB, OPFS) and ship a pre-bundled worker that is
  // served as a static asset from `public/@powersync/worker` (see
  // `scripts/copy-powersync-worker.mjs`). Keep them out of Next's server
  // bundling/transform pipeline entirely.
  serverExternalPackages: ['@powersync/web', '@journeyapps/wa-sqlite'],
};

export default nextConfig;
