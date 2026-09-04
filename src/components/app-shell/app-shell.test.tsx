import type { ReactElement } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { PowerSyncTestProvider } from '@/test/powersync-test-provider';
import { AppShell } from './app-shell';

// `AppShell`'s mobile/desktop split is CSS-driven (Tailwind's `hidden`/
// `md:block`), which jsdom never evaluates (no layout engine, no media
// queries) - so these tests assert the underlying class toggling directly
// rather than actual computed visibility. Real cross-viewport rendering is
// covered by the Playwright mobile-viewport spec in `tests/e2e/`.
function isMobileHidden(element: Element) {
  const section = element.closest('section');
  if (!section) throw new Error('Expected element to be inside a <section>');
  return section.className.split(/\s+/).includes('hidden');
}

describe('AppShell mobile tab bar', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  function render(ui: ReactElement) {
    return rtlRender(ui, {
      wrapper: ({ children }) => <PowerSyncTestProvider db={db}>{children}</PowerSyncTestProvider>,
    });
  }

  it('shows the bottom tab bar with the three available sections', () => {
    render(<AppShell userId="user-1" />);

    const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Задачи' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Календарь' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Привычки' })).toBeInTheDocument();
  });

  it('shows only the Backlog (Задачи) section by default, marked as the current tab', () => {
    render(<AppShell userId="user-1" />);

    expect(screen.getByRole('button', { name: 'Задачи' })).toHaveAttribute('aria-current', 'page');
    expect(isMobileHidden(screen.getByText('Backlog'))).toBe(false);
    expect(isMobileHidden(screen.getByText('Календарь появится на следующем этапе'))).toBe(true);
    expect(isMobileHidden(screen.getByText('Привычки появятся позже'))).toBe(true);
  });

  it('switches to the Calendar section when its tab is tapped, hiding the others', async () => {
    const user = userEvent.setup();
    render(<AppShell userId="user-1" />);

    await user.click(screen.getByRole('button', { name: 'Календарь' }));

    expect(screen.getByRole('button', { name: 'Календарь' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Задачи' })).not.toHaveAttribute('aria-current');
    expect(isMobileHidden(screen.getByText('Календарь появится на следующем этапе'))).toBe(false);
    expect(isMobileHidden(screen.getByText('Backlog'))).toBe(true);
    expect(isMobileHidden(screen.getByText('Привычки появятся позже'))).toBe(true);
  });

  it('switches to the Habits section when its tab is tapped', async () => {
    const user = userEvent.setup();
    render(<AppShell userId="user-1" />);

    await user.click(screen.getByRole('button', { name: 'Привычки' }));

    expect(screen.getByRole('button', { name: 'Привычки' })).toHaveAttribute('aria-current', 'page');
    expect(isMobileHidden(screen.getByText('Привычки появятся позже'))).toBe(false);
    expect(isMobileHidden(screen.getByText('Backlog'))).toBe(true);
  });

  it('hides the bottom tab bar while area settings is open', async () => {
    const user = userEvent.setup();
    render(<AppShell userId="user-1" />);

    await user.click(screen.getByRole('button', { name: 'Сферы жизни' }));

    expect(screen.queryByRole('navigation', { name: 'Основная навигация' })).not.toBeInTheDocument();
  });

  it('every section stays visible (not mobile-hidden) at the desktop breakpoint', () => {
    // The two currently-inactive sections carry `hidden` plus a matching
    // `md:*` display override, so at `md` and above all three are shown
    // side-by-side regardless of which mobile tab is active.
    render(<AppShell userId="user-1" />);

    const calendarSection = screen.getByText('Календарь появится на следующем этапе');
    const habitsSection = screen.getByText('Привычки появятся позже');
    expect(calendarSection.className).toMatch(/\bhidden\b/);
    expect(calendarSection.className).toMatch(/md:flex/);
    expect(habitsSection.className).toMatch(/\bhidden\b/);
    expect(habitsSection.className).toMatch(/md:flex/);
  });
});
