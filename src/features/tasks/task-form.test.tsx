import type { ReactElement } from 'react';
import { format } from 'date-fns';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { PowerSyncTestProvider } from '@/test/powersync-test-provider';
import { TaskForm } from './task-form';
import { createTask, listBacklogTasks, mapTaskRow, TASK_COLUMNS, type TaskRow } from './task-repository';
import { scheduleTimedTask } from './scheduling';
import type { Task } from './task-types';

async function getTask(db: TestDatabase, id: string): Promise<Task | null> {
  const row = await db.getOptional<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`, [id]);
  return row ? mapTaskRow(row) : null;
}

describe('TaskForm', () => {
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

  it('creates a task with the entered fields and reports success', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<TaskForm userId="user-1" onSaved={onSaved} />);

    await user.type(screen.getByLabelText('Название'), 'Позвонить маме');
    await user.selectOptions(screen.getByLabelText('Приоритет'), 'high');
    await user.type(screen.getByLabelText('Описание'), 'Уточнить планы на выходные');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    const tasks = await listBacklogTasks(db, 'user-1');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Позвонить маме');
    expect(tasks[0].priority).toBe('high');
    expect(tasks[0].description).toBe('Уточнить планы на выходные');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the form open and shows a blocking error when the local write fails', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const executeSpy = vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('disk full'));

    render(<TaskForm userId="user-1" onSaved={onSaved} />);

    await user.type(screen.getByLabelText('Название'), 'Проверка ошибки записи');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось сохранить задачу');

    // The form stays open with the entered value intact - no optimistic
    // success state, and `onSaved` (which BacklogPanel uses to close/collapse
    // the form) must never fire for a failed write.
    expect(screen.getByLabelText('Название')).toHaveValue('Проверка ошибки записи');
    expect(onSaved).not.toHaveBeenCalled();
    expect(await listBacklogTasks(db, 'user-1')).toHaveLength(0);

    executeSpy.mockRestore();
  });

  it('does not render scheduling fields unless showScheduling is set', () => {
    render(<TaskForm userId="user-1" onSaved={vi.fn()} />);

    expect(screen.queryByLabelText('Дата')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Весь день')).not.toBeInTheDocument();
  });

  it('prefills scheduling fields from a scheduled task and edits its time via scheduling functions', async () => {
    const user = userEvent.setup();
    const task = await createTask(db, { userId: 'user-1', title: 'Совещание' });
    const originalStart = '2026-09-10T09:00:00.000Z';
    const originalEnd = '2026-09-10T10:00:00.000Z';
    await scheduleTimedTask(db, task, originalStart, originalEnd);
    const scheduled = (await getTask(db, task.id))!;

    render(<TaskForm userId="user-1" task={scheduled} showScheduling onSaved={vi.fn()} />);

    expect(screen.getByLabelText('Дата')).toHaveValue(scheduled.scheduledDate);
    expect(screen.getByLabelText('Начало')).toHaveValue(format(new Date(originalStart), 'HH:mm'));
    expect(screen.getByLabelText('Конец')).toHaveValue(format(new Date(originalEnd), 'HH:mm'));

    // Same calendar day, new local time (matches whatever local timezone the
    // suite runs under - built from local Date components, not a hardcoded
    // offset).
    const newStartLocal = new Date(2026, 8, 10, 4, 0, 0);
    const newEndLocal = new Date(2026, 8, 10, 5, 0, 0);

    await user.clear(screen.getByLabelText('Начало'));
    await user.type(screen.getByLabelText('Начало'), format(newStartLocal, 'HH:mm'));
    await user.clear(screen.getByLabelText('Конец'));
    await user.type(screen.getByLabelText('Конец'), format(newEndLocal, 'HH:mm'));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(async () => {
      const saved = await getTask(db, task.id);
      expect(saved?.startAt).toBe(newStartLocal.toISOString());
      expect(saved?.endAt).toBe(newEndLocal.toISOString());
    });
    // Same calendar day - reschedule_count must not move.
    expect((await getTask(db, task.id))?.rescheduleCount).toBe(0);
  });

  it('switches a scheduled task to all-day via the scheduling checkbox', async () => {
    const user = userEvent.setup();
    const task = await createTask(db, { userId: 'user-1', title: 'Отпуск' });
    await scheduleTimedTask(db, task, '2026-09-10T09:00:00.000Z', '2026-09-10T10:00:00.000Z');
    const scheduled = (await getTask(db, task.id))!;

    render(<TaskForm userId="user-1" task={scheduled} showScheduling onSaved={vi.fn()} />);

    await user.click(screen.getByLabelText('Весь день'));
    expect(screen.queryByLabelText('Начало')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(async () => {
      const saved = await getTask(db, task.id);
      expect(saved?.allDay).toBe(true);
      expect(saved?.startAt).toBeNull();
      expect(saved?.endAt).toBeNull();
    });
  });
});
