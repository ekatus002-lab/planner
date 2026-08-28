import type { ReactElement } from 'react';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { PowerSyncTestProvider } from '@/test/powersync-test-provider';
import { TaskForm } from './task-form';
import { listBacklogTasks } from './task-repository';

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
});
