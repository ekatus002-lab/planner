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
// message sent to `email`, so the sign-in tests verify an email was
// actually queued by Supabase Auth - not just that the UI shows its
// (unconditional, pre-fix) success copy.
async function waitForMailpitMessageTo(
  email: string,
  timeoutMs = 10_000,
): Promise<{ ID: string; To: { Address: string }[] }> {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;

  while (Date.now() < deadline) {
    const response = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const body = (await response.json()) as {
      count: number;
      messages: { ID: string; To: { Address: string }[] }[];
    };
    lastCount = body.count;
    if (body.count > 0) {
      return body.messages[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`No Mailpit message arrived for ${email} within ${timeoutMs}ms (last count: ${lastCount})`);
}

// Extracts the 6-digit sign-in code from the email body (see
// `supabase/templates/magic_link.html`'s `{{ .Token }}`), so the "sign in
// with a code" test proves the digits shown to the user actually work,
// rather than only that some email arrived.
async function readOtpCode(messageId: string): Promise<string> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`);
  const body = (await response.json()) as { Text?: string; HTML?: string };
  const match = (body.Text ?? body.HTML ?? '').match(/\b\d{6}\b/);
  if (!match) {
    throw new Error(`No 6-digit code found in Mailpit message ${messageId}`);
  }
  return match[0];
}

test.describe('route protection', () => {
  test('redirects an unauthenticated visitor from /planner to /auth', async ({ page }) => {
    await page.goto('/planner');

    await expect(page).toHaveURL(/\/auth$/);
  });
});

// Serial: these tests share one fixed email (`existingUserEmail()`), and
// Supabase invalidates a user's prior OTP when a new one is requested -
// running them concurrently would race two codes against the same address
// and could pick up the wrong (superseded) one from Mailpit.
test.describe.serial('code sign-in', () => {
  test('an existing user can request a code, enter it, and reach the planner', async ({ page }) => {
    const email = existingUserEmail();

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Получить код' }).click();

    // Proves the backend actually accepted and processed the request (a
    // misconfigured SMTP setup would show identical UI success copy while
    // queuing nothing) rather than only asserting the client-side transition.
    const message = await waitForMailpitMessageTo(email);
    expect(message.To.some((recipient) => recipient.Address === email)).toBe(true);
    const code = await readOtpCode(message.ID);

    await page.getByLabel('Код из письма').fill(code);
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page).toHaveURL(/\/planner$/);
    await expect(page.getByRole('heading', { name: 'Мой планер' })).toBeVisible();
  });

  test('requesting a code for an unknown email shows an error, not a false success', async ({
    page,
  }) => {
    // Signups are disabled (`supabase/config.toml`'s `enable_signup = false`
    // - this is a private, single-user app), so a brand-new email must be
    // rejected by Supabase Auth instead of silently creating an account.
    const email = `unknown-${Date.now()}@example.com`;

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Получить код' }).click();

    // Scoped to the request-error copy specifically: Next.js's own route
    // announcer (`#__next-route-announcer__`) also carries `role="alert"`,
    // so an unscoped `getByRole('alert')` matches both.
    await expect(page.getByText(/не удалось отправить код/i)).toBeVisible();
    await expect(page.getByLabel('Код из письма')).not.toBeVisible();
  });

  test('entering the wrong code shows an error and stays on /auth', async ({ page }) => {
    const email = existingUserEmail();

    await page.goto('/auth');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Получить код' }).click();
    await page.getByLabel('Код из письма').fill('000000');
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page.getByText(/неверный или устаревший код/i)).toBeVisible();
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
