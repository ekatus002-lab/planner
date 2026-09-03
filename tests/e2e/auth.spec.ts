import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { USER_META_PATH } from './global-setup';

const AUTHENTICATED_STORAGE_STATE = path.join(__dirname, '.auth/user.json');
const MAILPIT_URL = 'http://127.0.0.1:54324';

// The five default life areas Postgres's `handle_new_user()` trigger seeds
// for every new user (see `supabase/migrations/202608270001_foundation.sql`).
const DEFAULT_AREA_NAMES = ['Внешность', 'Спорт и питание', 'Учёба', 'Карьера', 'Другое'];

function existingUserEmail(): string {
  const meta = JSON.parse(readFileSync(USER_META_PATH, 'utf8')) as { email: string };
  return meta.email;
}

// Polls the local Supabase Mailpit inbox (http://127.0.0.1:54324) for a
// message sent to `email`, so the "magic link sign-in" test verifies an
// email was actually queued by Supabase Auth - not just that the UI shows
// its (unconditional, pre-fix) success copy.
async function waitForMailpitMessageTo(email: string, timeoutMs = 10_000): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;

  while (Date.now() < deadline) {
    const response = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const body = (await response.json()) as { count: number; messages: unknown[] };
    lastCount = body.count;
    if (body.count > 0) {
      return body.messages[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`No Mailpit message arrived for ${email} within ${timeoutMs}ms (last count: ${lastCount})`);
}

test.describe('route protection', () => {
  test('redirects an unauthenticated visitor from /planner to /auth', async ({ page }) => {
    await page.goto('/planner');

    await expect(page).toHaveURL(/\/auth$/);
  });
});

test.describe('magic link sign-in', () => {
  test('requesting a magic link for an existing user actually queues an email', async ({ page }) => {
    const email = existingUserEmail();

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Получить ссылку' }).click();

    await expect(
      page.getByText('Мы отправили ссылку для входа на вашу почту. Проверьте письмо.'),
    ).toBeVisible();

    // Proves the backend actually accepted and processed the request (a
    // misconfigured SMTP/redirect-allowlist would show identical UI success
    // copy while queuing nothing) rather than only asserting the client-side
    // success message.
    const message = (await waitForMailpitMessageTo(email)) as { To: { Address: string }[] };
    expect(message.To.some((recipient) => recipient.Address === email)).toBe(true);
  });

  test('requesting a magic link for an unknown email shows an error, not a false success', async ({
    page,
  }) => {
    // Signups are disabled (`supabase/config.toml`'s `enable_signup = false`
    // - this is a private, single-user app), so a brand-new email must be
    // rejected by Supabase Auth instead of silently creating an account.
    const email = `unknown-${Date.now()}@example.com`;

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Получить ссылку' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByText('Мы отправили ссылку для входа на вашу почту. Проверьте письмо.'),
    ).not.toBeVisible();
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
