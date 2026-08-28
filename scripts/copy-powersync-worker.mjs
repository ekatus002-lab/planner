// Copies the PowerSync WA-SQLite worker bundle (worker.js, its
// content-hashed VFS chunk files, and their .wasm assets) from
// `@powersync/web`'s published `dist/worker` directory into
// `public/@powersync/worker`, so the browser can load the worker as a plain
// static asset at a stable URL (`/@powersync/worker/worker.js`) instead of
// relying on bundler-specific `new URL(..., import.meta.url)` rewriting,
// which Next.js does not reliably support for Worker/SharedWorker
// constructors.
//
// Run automatically via the `postinstall` script so the copy stays in sync
// with whatever `@powersync/web` version is installed.

import { existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const sourceDir = join(projectRoot, 'node_modules', '@powersync', 'web', 'dist', 'worker');
const destDir = join(projectRoot, 'public', '@powersync', 'worker');

if (!existsSync(sourceDir)) {
  console.warn(
    `[copy-powersync-worker] Source directory not found, skipping: ${sourceDir}`,
  );
  process.exit(0);
}

// Start from a clean destination so stale, content-hashed chunk files from a
// previous @powersync/web version never linger alongside the new ones.
rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });

cpSync(sourceDir, destDir, { recursive: true });

console.log(`[copy-powersync-worker] Copied PowerSync worker assets to ${destDir}`);
