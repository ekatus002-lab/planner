import { expect, test } from '@playwright/test';
import path from 'node:path';

const AUTHENTICATED_STORAGE_STATE = path.join(__dirname, '.auth/user.json');

test.use({ storageState: AUTHENTICATED_STORAGE_STATE });

test('a task created while offline persists locally and syncs after reconnect', async ({
  page,
  context,
}) => {
  await page.goto('/planner');

  // Opening the local PowerSync database loads a worker bundle (WASM SQLite
  // + VFS chunks) over the network on first use. Wait for that to finish -
  // i.e. for the backlog UI to actually be interactive - before cutting the
  // network, otherwise `setOffline` can race an in-flight worker fetch and
  // wedge database initialization instead of exercising the local-write path
  // this test is about.
  await expect(page.getByRole('button', { name: 'Новая задача' })).toBeVisible();

  await context.setOffline(true);

  await page.getByRole('button', { name: 'Новая задача' }).click();
  await page.getByLabel('Название').fill('Offline task');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await expect(page.getByText('Offline task')).toBeVisible();
  // `exact: true` disambiguates the sync status label from the "Offline
  // task" title itself (`getByText` otherwise substring-matches both).
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();

  // `context.setOffline(true)` blocks *every* request from the browser,
  // including this Playwright test's own connection to the Next.js dev
  // server hosting the app shell on `localhost:3000` - there's no service
  // worker caching the app shell (out of scope for this local-first-data
  // slice), so a literal reload with zero network would just fail to load
  // at all. Briefly restore connectivity around the reload itself (the app
  // shell's document fetch) and cut it again immediately after, so what's
  // actually being proved - that the task written to the local SQLite
  // database survives a fresh page load while the sync backend is
  // unreachable - stays intact.
  await context.setOffline(false);
  await page.reload();
  // As on the first load, wait for the local database (and its worker
  // bundle) to finish (re)initializing while still online before cutting
  // the network again - otherwise this reload's own worker fetch can race
  // `setOffline` the same way the very first one would have.
  await expect(page.getByRole('button', { name: 'Новая задача' })).toBeVisible();
  await context.setOffline(true);

  await expect(page.getByText('Offline task')).toBeVisible();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('Synced', { exact: true })).toBeVisible({ timeout: 15_000 });
});
