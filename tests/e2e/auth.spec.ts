import { expect, test } from '@playwright/test';
import path from 'node:path';

const AUTHENTICATED_STORAGE_STATE = path.join(__dirname, '.auth/user.json');

// The five default life areas Postgres's `handle_new_user()` trigger seeds
// for every new user (see `supabase/migrations/202608270001_foundation.sql`).
const DEFAULT_AREA_NAMES = ['Внешность', 'Спорт и питание', 'Учёба', 'Карьера', 'Другое'];

// The local dev/test-only PIN for `NEXT_PUBLIC_OWNER_EMAIL` (see
// `.env.local`) - a throwaway value, distinct from the real production PIN,
// safe to commit. The sign-in screen has no email field: it always signs in
// as this one fixed, pre-provisioned account via a real Supabase password
// grant (`supabase.auth.signInWithPassword`).
const TEST_PIN = '111111';

test.describe('route protection', () => {
  test('redirects an unauthenticated visitor from /planner to /auth', async ({ page }) => {
    await page.goto('/planner');

    await expect(page).toHaveURL(/\/auth$/);
  });
});

test.describe('PIN sign-in', () => {
  test('never asks for an email, and shows a numeric-only code field', async ({ page }) => {
    await page.goto('/auth');

    await expect(page.getByLabel('Email')).toHaveCount(0);
    const pinField = page.getByLabel('PIN-код');
    await expect(pinField).toBeVisible();
    await expect(pinField).toHaveAttribute('inputmode', 'numeric');
  });

  test('the correct PIN reaches the planner', async ({ page }) => {
    await page.goto('/auth');
    await page.getByLabel('PIN-код').fill(TEST_PIN);
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page).toHaveURL(/\/planner$/);
    await expect(page.getByRole('heading', { name: 'Мой планер' })).toBeVisible();
  });

  test('the wrong PIN shows an error and stays on /auth', async ({ page }) => {
    await page.goto('/auth');
    await page.getByLabel('PIN-код').fill('000000');
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page.getByText(/неверный pin/i)).toBeVisible();
    await expect(page).toHaveURL(/\/auth$/);
  });
});

test.describe('authenticated session', () => {
  test.use({ storageState: AUTHENTICATED_STORAGE_STATE });

  test('an authenticated visitor reaches the planner instead of being redirected', async ({ page }) => {
    await page.goto('/planner');

    await expect(page).toHaveURL(/\/planner$/);
    await expect(page.getByRole('heading', { name: 'Мой планер' })).toBeVisible();
  });

  test('the five default life areas seeded server-side arrive over sync', async ({ page }) => {
    // The storage-state user was freshly created by `global-setup.ts` via the
    // admin API, so Postgres's `handle_new_user()` trigger seeded these 5
    // areas server-side - the client never wrote them locally. Seeing them
    // here proves the full download path: Postgres -> PowerSync Sync Stream
    // -> local SQLite -> UI (a broken sync-streams.yaml auth.user_id() claim
    // or RLS policy would leave this list empty).
    await page.goto('/planner');
    await page.getByRole('button', { name: 'Сферы жизни' }).click();

    const areaSection = page.getByRole('region', { name: 'Сферы жизни' });
    for (const name of DEFAULT_AREA_NAMES) {
      // Area names render as the value of an editable name input
      // (`aria-label="Название: <name>"` in `area-settings.tsx`), not as
      // plain text, so match on that label rather than `getByText`.
      await expect(areaSection.getByLabel(`Название: ${name}`, { exact: true })).toBeVisible({
        timeout: 15_000,
      });
    }
  });
});
