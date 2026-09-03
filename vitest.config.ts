import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // `tests/e2e/*.spec.ts` are Playwright specs (run via `pnpm test:e2e`),
    // which use Playwright's own `test`/`test.use` and must not be picked up
    // by Vitest's default `*.spec.ts` glob - but `tests/e2e/*.test.ts` (e.g.
    // `global-setup.test.ts`) are plain Vitest unit tests for helper logic
    // the Playwright specs depend on, and should still run under `pnpm
    // test`. Re-list Vitest's own defaults alongside the spec exclusion,
    // since setting `exclude` replaces them rather than extending them.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'tests/e2e/**/*.spec.ts',
      // Claude Code tooling state - may contain nested git worktrees with
      // their own copy of this same test suite; never run those here.
      '.claude/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
