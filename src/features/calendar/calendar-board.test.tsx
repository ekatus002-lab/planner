import type { ReactElement } from 'react';
import { format } from 'date-fns';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { PowerSyncTestProvider } from '@/test/powersync-test-provider';
import { createTask } from '@/features/tasks/task-repository';
import { scheduleTimedTask } from '@/features/tasks/scheduling';
import { CalendarBoard } from './calendar-board';
import { PlannerDndContext } from './planner-dnd-context';

// A day solidly in the middle of the current month, so the seeded event
// always falls inside the initial month view's visible range regardless of
// which day "today" actually is when the suite runs. Built from local wall
// clock components and converted with `toISOString()` (not a hand-rolled
// "Z" suffix), so it is a genuine UTC instant matching what
// `scheduleTimedTask` would receive from real calendar UI.
function midMonthStartAt(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 15, 9, 0, 0).toISOString();
}

describe('CalendarBoard', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  function render(ui: ReactElement) {
    return rtlRender(ui, {
      wrapper: ({ children }) => (
        <PowerSyncTestProvider db={db}>
          <PlannerDndContext onScheduleFromBacklog={vi.fn()} onUnschedule={vi.fn()} onMoveScheduledTask={vi.fn()}>
            {children}
          </PlannerDndContext>
        </PowerSyncTestProvider>
      ),
    });
  }

  it('switches between Month, Week, and Day views', async () => {
    const user = userEvent.setup();
    render(<CalendarBoard userId="user-1" />);

    expect(screen.getByTestId('planner-calendar')).toHaveAttribute('data-view', 'month');

    await user.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByTestId('planner-calendar')).toHaveAttribute('data-view', 'week');

    await user.click(screen.getByRole('button', { name: 'Day' }));
    expect(screen.getByTestId('planner-calendar')).toHaveAttribute('data-view', 'day');

    await user.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByTestId('planner-calendar')).toHaveAttribute('data-view', 'month');
  });

  it('opens the unified task editor, prefilled with time, when a calendar event is clicked', async () => {
    const user = userEvent.setup();
    const startAt = midMonthStartAt();
    const endAtDate = new Date(new Date(startAt).getTime() + 60 * 60 * 1000);
    const task = await createTask(db, { userId: 'user-1', title: 'Работа над проектом', areaId: null });
    await scheduleTimedTask(db, task, startAt, endAtDate.toISOString());

    render(<CalendarBoard userId="user-1" />);

    await user.click(await screen.findByText('Работа над проектом'));

    const dialog = await screen.findByRole('dialog', { name: 'Редактировать задачу' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveValue('Работа над проектом');
    expect(screen.getByLabelText('Начало')).toHaveValue(format(new Date(startAt), 'HH:mm'));
    expect(screen.getByLabelText('Конец')).toHaveValue(format(endAtDate, 'HH:mm'));
  });
});
