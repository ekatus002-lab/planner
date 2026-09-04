import type { ReactElement } from 'react';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { PowerSyncTestProvider } from '@/test/powersync-test-provider';
import { HabitsPanel } from './habits-panel';
import { createHabit, setHabitCompletion } from './habit-repository';

// 2026-08-27 is a Thursday; 2026-08-24 is the preceding Monday.
const TODAY = '2026-08-27';

describe('HabitsPanel', () => {
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

  it("shows only today's scheduled habits", async () => {
    await createHabit(db, { userId: 'user-1', title: 'Английский' }); // every day
    await createHabit(db, {
      userId: 'user-1',
      title: 'Тренировка Пн/Ср/Пт',
      weekdays: [1, 3, 5], // Thursday is not scheduled
    });

    render(<HabitsPanel userId="user-1" today={TODAY} />);

    expect(await screen.findByText('Английский')).toBeInTheDocument();
    expect(screen.queryByText('Тренировка Пн/Ср/Пт')).not.toBeInTheDocument();
  });

  it('creates a new habit and shows it immediately if due today', async () => {
    const user = userEvent.setup();
    render(<HabitsPanel userId="user-1" today={TODAY} />);

    await user.click(screen.getByRole('button', { name: 'Новая привычка' }));
    await user.type(screen.getByLabelText('Название'), 'Медитация');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Медитация')).toBeInTheDocument();
  });

  it('rejects creating a habit with no weekdays selected', async () => {
    const user = userEvent.setup();
    render(<HabitsPanel userId="user-1" today={TODAY} />);

    await user.click(screen.getByRole('button', { name: 'Новая привычка' }));
    await user.type(screen.getByLabelText('Название'), 'Без дней');
    for (const label of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']) {
      await user.click(screen.getByLabelText(label));
    }
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Выберите хотя бы один день недели');
    expect(screen.queryByText('Без дней')).not.toBeInTheDocument();
  });

  it("toggles today's completion via the checkbox, updating the streak immediately", async () => {
    const user = userEvent.setup();
    await createHabit(db, { userId: 'user-1', title: 'Английский' });
    render(<HabitsPanel userId="user-1" today={TODAY} />);

    const checkbox = await screen.findByRole('checkbox', { name: 'Выполнено сегодня: Английский' });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByLabelText('Текущая серия: Английский')).toHaveTextContent('Серия 0');

    await user.click(checkbox);

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Выполнено сегодня: Английский' })).toBeChecked();
    });
    expect(screen.getByLabelText('Текущая серия: Английский')).toHaveTextContent('Серия 1');
  });

  it('un-completes an already-completed habit', async () => {
    const user = userEvent.setup();
    const habit = await createHabit(db, { userId: 'user-1', title: 'Английский' });
    await setHabitCompletion(db, 'user-1', habit.id, TODAY, true);
    render(<HabitsPanel userId="user-1" today={TODAY} />);

    const checkbox = await screen.findByRole('checkbox', { name: 'Выполнено сегодня: Английский' });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Выполнено сегодня: Английский' })).not.toBeChecked();
    });
  });

  it('shows a blocking error when completing a habit fails, without marking it completed', async () => {
    const user = userEvent.setup();
    await createHabit(db, { userId: 'user-1', title: 'Английский' });
    render(<HabitsPanel userId="user-1" today={TODAY} />);

    const checkbox = await screen.findByRole('checkbox', { name: 'Выполнено сегодня: Английский' });
    const executeSpy = vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('disk full'));

    await user.click(checkbox);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось обновить привычку');
    expect(screen.getByRole('checkbox', { name: 'Выполнено сегодня: Английский' })).not.toBeChecked();

    executeSpy.mockRestore();
  });

  it('edits a habit via its title', async () => {
    const user = userEvent.setup();
    await createHabit(db, { userId: 'user-1', title: 'Старое название' });
    render(<HabitsPanel userId="user-1" today={TODAY} />);

    await user.click(await screen.findByText('Старое название'));
    const titleInput = screen.getByLabelText('Название');
    await user.clear(titleInput);
    await user.type(titleInput, 'Новое название');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Новое название')).toBeInTheDocument();
    expect(screen.queryByText('Старое название')).not.toBeInTheDocument();
  });
});
