import { expect, test } from '@playwright/test';
import path from 'node:path';

const AUTHENTICATED_STORAGE_STATE = path.join(__dirname, '.auth/user.json');

test.use({ storageState: AUTHENTICATED_STORAGE_STATE });

// Local calendar "today" as `YYYY-MM-DD`, matching `AppShell`'s own
// `todayLocalDate` - the goal/habit created below are deliberately scheduled
// to start "today" so the automatic progress formula has a single,
// deterministic expected occurrence (today itself) to reason about, instead
// of depending on whatever day this suite happens to run on.
function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test('a habit completion updates its linked goal progress immediately, offline, and survives reload/reconnect/second device', async ({
  page,
  context,
  browser,
}) => {
  const today = todayLocalDate();
  const runId = Date.now();
  const goalTitle = `English B2 ${runId}`;
  const habitTitle = `English 30 min ${runId}`;

  await page.goto('/planner');
  // Wait for the local PowerSync database (worker bundle) to finish loading
  // before doing anything network-sensitive below.
  await expect(page.getByRole('button', { name: 'Новая цель' })).toBeVisible();

  // 1. Create a hybrid-mode goal, "today" through a year out, with adjustment 0.
  await page.getByRole('button', { name: 'Новая цель' }).click();
  await page.getByLabel('Название').fill(goalTitle);
  await page.getByLabel('Начало').fill(today);
  await page.getByLabel('Окончание').fill('2027-12-31');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText(goalTitle)).toBeVisible();

  // 2. Create a daily habit starting "today", linked to that goal.
  await page.getByRole('button', { name: 'Новая привычка' }).click();
  await page.getByLabel('Название').fill(habitTitle);
  await page.getByLabel('Дата начала').fill(today);
  await page.getByLabel(`Цель: ${goalTitle}`).check();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText(habitTitle)).toBeVisible();

  // 3./4. With one linked habit and zero linked tasks, habits get 100% of
  // the weight; before completing today's occurrence the expected/completed
  // ratio for the goal's single expected day so far is 0/1.
  const goalProgress = page.getByLabel(`Прогресс: ${goalTitle}`);
  await expect(goalProgress).toHaveText('0%');

  // 5. Go offline.
  await context.setOffline(true);

  // 6./7. Complete today's habit while offline - streak and goal progress
  // must update immediately from local data, with Offline status visible.
  // Deliberately `.click()` + a polling `toBeChecked()` assertion rather
  // than `.check()`: the checkbox is a controlled component that only
  // reflects the new state once the local write round-trips through the
  // watched PowerSync query, so `.check()`'s one-shot post-click
  // verification fails even though the click itself (and the write it
  // triggers) succeeds.
  const habitCheckbox = page.getByRole('checkbox', { name: `Выполнено сегодня: ${habitTitle}` });
  await habitCheckbox.click();
  await expect(habitCheckbox).toBeChecked();

  await expect(page.getByLabel(`Текущая серия: ${habitTitle}`)).toHaveText('Серия 1');
  await expect(goalProgress).toHaveText('100%');
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();

  // 8. Reload while offline - completion and progress must survive from the
  // local database alone. (Briefly restore connectivity around the reload
  // itself, exactly like offline-backlog.spec.ts: there is no service
  // worker caching the app shell yet, so a literal zero-network reload
  // would fail to load the page at all.)
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Новая цель' })).toBeVisible();
  await context.setOffline(true);

  await expect(page.getByRole('checkbox', { name: `Выполнено сегодня: ${habitTitle}` })).toBeChecked();
  await expect(page.getByLabel(`Прогресс: ${goalTitle}`)).toHaveText('100%');

  // 9. Reconnect and wait for the queued writes to actually sync.
  await context.setOffline(false);
  await expect(page.getByText('Synced', { exact: true })).toBeVisible({ timeout: 15_000 });

  // 10. A second, independent browser context (same account) must converge
  // on the same habit completion and goal progress once its own Sync
  // Stream download catches up.
  const secondContext = await browser.newContext({ storageState: AUTHENTICATED_STORAGE_STATE });
  try {
    const secondPage = await secondContext.newPage();
    await secondPage.goto('/planner');

    await expect(secondPage.getByText(habitTitle)).toBeVisible({ timeout: 20_000 });
    await expect(
      secondPage.getByRole('checkbox', { name: `Выполнено сегодня: ${habitTitle}` }),
    ).toBeChecked();
    await expect(secondPage.getByLabel(`Прогресс: ${goalTitle}`)).toHaveText('100%', { timeout: 20_000 });
  } finally {
    await secondContext.close();
  }
});
