import { expect, test } from '@playwright/test';
import path from 'node:path';

const AUTHENTICATED_STORAGE_STATE = path.join(__dirname, '.auth/user.json');

// Every other spec only ever displays data the client itself created
// locally, so a broken PowerSync Sync Stream / RLS / JWT-claim mismatch
// (e.g. sync-streams.yaml's auth.user_id() not matching the token's claims)
// would go completely undetected. This test uses two separate browser
// contexts - each with its own storage partition (IndexedDB/OPFS), so each
// gets its own independent local PowerSync database, exactly like two
// physical devices - both authenticated as the *same* user (same storage
// state / session token). Creating a task in context A and seeing it in a
// freshly-opened context B proves both halves of the Slice A Exit Gate line
// "reconnect uploads queued changes to Supabase and another device receives
// them": A's local write reaching Supabase (upload), and B's Sync Stream
// download bringing it back down into a different local database.
test('a task created online in one browser context is downloaded into a second, independent context', async ({
  browser,
}) => {
  const contextA = await browser.newContext({ storageState: AUTHENTICATED_STORAGE_STATE });
  const contextB = await browser.newContext({ storageState: AUTHENTICATED_STORAGE_STATE });

  try {
    const pageA = await contextA.newPage();
    const title = `Cross-device sync check ${Date.now()}`;

    await pageA.goto('/planner');
    await expect(pageA.getByRole('button', { name: 'Новая задача' })).toBeVisible();

    await pageA.getByRole('button', { name: 'Новая задача' }).click();
    await pageA.getByLabel('Название').fill(title);
    await pageA.getByRole('button', { name: 'Сохранить' }).click();
    await expect(pageA.getByText(title)).toBeVisible();
    // Wait for A to actually finish uploading before involving B at all -
    // otherwise a slow/failed upload and a slow/failed download would be
    // indistinguishable if B just never saw the task in time.
    await expect(pageA.getByText('Synced', { exact: true })).toBeVisible({ timeout: 15_000 });

    // B opens the planner - and starts its `useBacklogTasks` watch query -
    // only *after* the task already exists in Supabase, so what follows
    // specifically exercises the download path (Supabase -> PowerSync Sync
    // Stream -> B's own local SQLite -> UI), not a page that had the row
    // cached from before.
    const pageB = await contextB.newPage();
    await pageB.goto('/planner');
    await expect(pageB.getByText(title)).toBeVisible({ timeout: 20_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
