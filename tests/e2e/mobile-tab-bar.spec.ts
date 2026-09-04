import { expect, test } from '@playwright/test';
import path from 'node:path';

const AUTHENTICATED_STORAGE_STATE = path.join(__dirname, '.auth/user.json');

// A real Chromium viewport (unlike jsdom in the Vitest component test for
// `AppShell`) actually applies the app's CSS, including the media query
// behind Tailwind's `md:` variants - so this is the only place the
// mobile/desktop breakpoint switch itself gets verified against real layout,
// not just against which classes got attached to which element.
test.describe('mobile app shell', () => {
  test.use({ storageState: AUTHENTICATED_STORAGE_STATE, viewport: { width: 390, height: 844 } });

  test('shows a bottom tab bar with all three sections below the desktop breakpoint', async ({ page }) => {
    await page.goto('/planner');

    const nav = page.getByRole('navigation', { name: 'Основная навигация' });
    await expect(nav).toBeVisible();
    await expect(page.getByRole('button', { name: 'Задачи' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Календарь' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Привычки' })).toBeVisible();
  });

  test('shows only the Backlog section until a different tab is tapped, then switches', async ({ page }) => {
    await page.goto('/planner');

    // Задачи (Backlog) is the default tab.
    await expect(page.getByRole('heading', { name: 'Backlog' })).toBeVisible();
    await expect(page.getByText('Календарь появится на следующем этапе')).toBeHidden();
    await expect(page.getByText('Привычки появятся позже')).toBeHidden();

    await page.getByRole('button', { name: 'Календарь' }).click();

    await expect(page.getByText('Календарь появится на следующем этапе')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Backlog' })).toBeHidden();
    await expect(page.getByText('Привычки появятся позже')).toBeHidden();

    await page.getByRole('button', { name: 'Привычки' }).click();

    await expect(page.getByText('Привычки появятся позже')).toBeVisible();
    await expect(page.getByText('Календарь появится на следующем этапе')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Backlog' })).toBeHidden();

    await page.getByRole('button', { name: 'Задачи' }).click();
    await expect(page.getByRole('heading', { name: 'Backlog' })).toBeVisible();
  });

  test('hides the tab bar while the area-settings screen is open', async ({ page }) => {
    await page.goto('/planner');

    await page.getByRole('button', { name: 'Сферы жизни' }).click();

    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).not.toBeAttached();
    await expect(page.getByRole('region', { name: 'Сферы жизни' })).toBeVisible();
  });

  test('does not require horizontal scrolling at a 375px-wide viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/planner');
    await expect(page.getByRole('button', { name: 'Новая задача' })).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

test.describe('desktop app shell', () => {
  test.use({ storageState: AUTHENTICATED_STORAGE_STATE, viewport: { width: 1280, height: 800 } });

  test('shows all three columns at once, with no bottom tab bar', async ({ page }) => {
    await page.goto('/planner');

    await expect(page.getByRole('navigation', { name: 'Основная навигация' })).not.toBeAttached();
    await expect(page.getByRole('heading', { name: 'Backlog' })).toBeVisible();
    await expect(page.getByText('Календарь появится на следующем этапе')).toBeVisible();
    await expect(page.getByText('Привычки появятся позже')).toBeVisible();
  });
});
