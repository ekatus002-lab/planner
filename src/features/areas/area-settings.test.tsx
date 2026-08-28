import type { ReactElement } from 'react';
import { randomUUID } from 'node:crypto';
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { PowerSyncTestProvider } from '@/test/powersync-test-provider';
import { AreaSettings } from './area-settings';
import { listAreas } from './area-repository';

const USER_ID = 'user-1';

// Mirrors the default areas `handle_new_user()` seeds in
// `supabase/migrations/202608270001_foundation.sql` (sort_order 10..50),
// since that trigger only runs against Supabase/Postgres, not this local
// SQLite test database.
const DEFAULT_AREAS: Array<[name: string, color: string, sortOrder: number]> = [
  ['Внешность', '#EC8FB6', 10],
  ['Спорт и питание', '#70B96E', 20],
  ['Учёба', '#6B9EEB', 30],
  ['Карьера', '#9B75E8', 40],
  ['Другое', '#9CA3AF', 50],
];

async function seedDefaultAreas(db: TestDatabase) {
  const now = new Date().toISOString();
  for (const [name, color, sortOrder] of DEFAULT_AREAS) {
    await db.execute(
      `INSERT INTO areas (id, user_id, name, color, sort_order, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [randomUUID(), USER_ID, name, color, sortOrder, now, now],
    );
  }
}

describe('AreaSettings', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
    await seedDefaultAreas(db);
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  function render(ui: ReactElement) {
    return rtlRender(ui, {
      wrapper: ({ children }) => <PowerSyncTestProvider db={db}>{children}</PowerSyncTestProvider>,
    });
  }

  function getAreaNameOrder(): string[] {
    return screen.getAllByRole('listitem').map((row) => {
      const input = within(row).getByLabelText(/^Название: /) as HTMLInputElement;
      return input.value;
    });
  }

  async function createTvorchestvo(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Название сферы'), 'Творчество');
    await user.click(screen.getByRole('button', { name: 'Добавить сферу' }));
    await screen.findByLabelText('Название: Творчество');
  }

  it('creates a new life area', async () => {
    const user = userEvent.setup();
    render(<AreaSettings userId={USER_ID} />);

    await screen.findByLabelText('Название: Другое');
    await createTvorchestvo(user);

    const areas = await listAreas(db, USER_ID);
    expect(areas.some((area) => area.name === 'Творчество')).toBe(true);
  });

  it('recolors a life area', async () => {
    const user = userEvent.setup();
    render(<AreaSettings userId={USER_ID} />);
    await createTvorchestvo(user);

    const hexInput = screen.getByLabelText('Hex: Творчество');
    await user.clear(hexInput);
    await user.type(hexInput, '#112233');
    await user.tab();

    await waitFor(async () => {
      const areas = await listAreas(db, USER_ID);
      expect(areas.find((area) => area.name === 'Творчество')?.color).toBe('#112233');
    });
  });

  it('moves a life area above another', async () => {
    const user = userEvent.setup();
    render(<AreaSettings userId={USER_ID} />);
    await createTvorchestvo(user);

    // Newly created, so it sorts after the seeded "Другое" (sort_order 50).
    expect(getAreaNameOrder().indexOf('Творчество')).toBeGreaterThan(getAreaNameOrder().indexOf('Другое'));

    await user.click(screen.getByRole('button', { name: 'Переместить вверх: Творчество' }));

    await waitFor(() => {
      expect(getAreaNameOrder().indexOf('Творчество')).toBeLessThan(getAreaNameOrder().indexOf('Другое'));
    });

    const areas = await listAreas(db, USER_ID);
    const sortOrders = Object.fromEntries(areas.map((area) => [area.name, area.sortOrder]));
    expect(sortOrders['Творчество']).toBeLessThan(sortOrders['Другое']);
    // Reordering renumbers in increments of 10.
    expect(areas.every((area) => Number.isInteger(area.sortOrder) && area.sortOrder % 10 === 0)).toBe(true);
  });

  it('archives a life area so it disappears from the settings list and new-task selectors', async () => {
    const user = userEvent.setup();
    render(<AreaSettings userId={USER_ID} />);
    await createTvorchestvo(user);

    await user.click(screen.getByRole('button', { name: 'Архивировать: Творчество' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Название: Творчество')).not.toBeInTheDocument();
    });

    // `listAreas` is the same non-archived query new-task selectors use.
    const areas = await listAreas(db, USER_ID);
    expect(areas.some((area) => area.name === 'Творчество')).toBe(false);
  });

  it('shows a blocking error when archiving fails, keeping the area listed', async () => {
    const user = userEvent.setup();
    render(<AreaSettings userId={USER_ID} />);
    await createTvorchestvo(user);

    const executeSpy = vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('disk full'));

    await user.click(screen.getByRole('button', { name: 'Архивировать: Творчество' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось архивировать сферу жизни');
    // No optimistic archive - the area is still listed and still non-archived.
    expect(screen.getByLabelText('Название: Творчество')).toBeInTheDocument();
    expect((await listAreas(db, USER_ID)).some((area) => area.name === 'Творчество')).toBe(true);

    executeSpy.mockRestore();
  });
});
