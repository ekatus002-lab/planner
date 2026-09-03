import { expect, test } from '@playwright/test';
import path from 'node:path';

const AUTHENTICATED_STORAGE_STATE = path.join(__dirname, '.auth/user.json');

test.describe('route protection', () => {
  test('redirects an unauthenticated visitor from /planner to /auth', async ({ page }) => {
    await page.goto('/planner');

    await expect(page).toHaveURL(/\/auth$/);
  });
});

test.describe('magic link sign-in', () => {
  test('requesting a magic link confirms the email was sent', async ({ page }) => {
    await page.goto('/auth');

    const email = `magic-link-${Date.now()}@example.com`;
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Получить ссылку' }).click();

    await expect(
      page.getByText('Мы отправили ссылку для входа на вашу почту. Проверьте письмо.'),
    ).toBeVisible();
  });
});

test.describe('authenticated session', () => {
  test.use({ storageState: AUTHENTICATED_STORAGE_STATE });

  test('an authenticated visitor reaches the planner instead of being redirected', async ({ page }) => {
    await page.goto('/planner');

    await expect(page).toHaveURL(/\/planner$/);
    await expect(page.getByRole('heading', { name: 'Мой планер' })).toBeVisible();
  });
});
