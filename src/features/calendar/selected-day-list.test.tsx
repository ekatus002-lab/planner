import type { ReactElement } from 'react';
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { PowerSyncTestProvider } from '@/test/powersync-test-provider';
import { createTask } from '@/features/tasks/task-repository';
import { scheduleAllDayTask, scheduleDateOnlyTask, scheduleTimedTask } from '@/features/tasks/scheduling';
import { SelectedDayList } from './selected-day-list';

const DATE = '2026-08-28';

describe('SelectedDayList', () => {
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

  it('orders timed tasks by start time, with date-only tasks last', async () => {
    const evening = await createTask(db, { userId: 'user-1', title: 'Вечерняя пробежка' });
    await scheduleTimedTask(db, evening, `${DATE}T18:00:00.000Z`, `${DATE}T19:00:00.000Z`);

    const dateOnly = await createTask(db, { userId: 'user-1', title: 'Купить продукты' });
    await scheduleDateOnlyTask(db, dateOnly, DATE);

    const morning = await createTask(db, { userId: 'user-1', title: 'Утренняя встреча' });
    await scheduleTimedTask(db, morning, `${DATE}T09:00:00.000Z`, `${DATE}T10:00:00.000Z`);

    render(<SelectedDayList userId="user-1" date={DATE} />);

    const items = await screen.findAllByRole('listitem');
    expect(items.map((item) => within(item).getByText(/./, { selector: 'span.flex-1' }).textContent)).toEqual([
      'Утренняя встреча',
      'Вечерняя пробежка',
      'Купить продукты',
    ]);
  });

  it('renders all-day tasks before timed tasks', async () => {
    const timed = await createTask(db, { userId: 'user-1', title: 'Звонок' });
    await scheduleTimedTask(db, timed, `${DATE}T09:00:00.000Z`, `${DATE}T10:00:00.000Z`);

    const allDay = await createTask(db, { userId: 'user-1', title: 'День рождения' });
    await scheduleAllDayTask(db, allDay, DATE);

    render(<SelectedDayList userId="user-1" date={DATE} />);

    const items = await screen.findAllByRole('listitem');
    expect(items.map((item) => within(item).getByText(/./, { selector: 'span.flex-1' }).textContent)).toEqual([
      'День рождения',
      'Звонок',
    ]);
  });

  it('completes a task from the list, updating it reactively', async () => {
    const user = userEvent.setup();
    const task = await createTask(db, { userId: 'user-1', title: 'Помыть окна' });
    await scheduleDateOnlyTask(db, task, DATE);

    render(<SelectedDayList userId="user-1" date={DATE} />);

    const checkbox = await screen.findByRole('checkbox', { name: 'Выполнено: Помыть окна' });
    await user.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText('Помыть окна')).toHaveClass('line-through');
    });
  });

  it('shows a placeholder when nothing is scheduled that day', async () => {
    render(<SelectedDayList userId="user-1" date={DATE} />);

    expect(await screen.findByText('На этот день ничего не запланировано')).toBeInTheDocument();
  });
});
