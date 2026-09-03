import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // `tests/e2e/` also holds plain Vitest unit tests (`*.test.ts`, run via
  // `pnpm test`) covering pure helper logic used by the Playwright specs
  // themselves (e.g. `global-setup.test.ts`). Playwright's own default
  // `testMatch` picks up `*.test.ts` too, so scope it to `*.spec.ts` here to
  // avoid it trying to load a Vitest file as a Playwright test.
  testMatch: '**/*.spec.ts',
  // Provisions a throwaway Supabase auth test user and mints a Playwright
  // storage state file (tests/e2e/.auth/user.json) that authenticated specs
  // opt into via `test.use({ storageState })`.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
