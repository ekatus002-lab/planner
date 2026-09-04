import type { ReactElement } from 'react';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { PowerSyncTestProvider } from '@/test/powersync-test-provider';
import { BacklogPanel } from './backlog-panel';
import { createTask } from './task-repository';

describe('BacklogPanel', () => {
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

  it('creates a backlog task and renders it immediately', async () => {
    const user = userEvent.setup();
    render(<BacklogPanel userId="user-1" />);

    await user.click(screen.getByRole('button', { name: 'Новая задача' }));
    await user.type(screen.getByLabelText('Название'), 'Купить шампунь');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Купить шампунь')).toBeInTheDocument();
  });

  it('completes a task via its checkbox, removing it from the open backlog', async () => {
    const user = userEvent.setup();
    await createTask(db, { userId: 'user-1', title: 'Помыть машину' });
    render(<BacklogPanel userId="user-1" />);

    const checkbox = await screen.findByRole('checkbox', { name: 'Выполнено: Помыть машину' });
    await user.click(checkbox);

    await waitFor(() => {
      expect(screen.queryByText('Помыть машину')).not.toBeInTheDocument();
    });
  });

  it('edits a task title via the row menu', async () => {
    const user = userEvent.setup();
    await createTask(db, { userId: 'user-1', title: 'Старое название' });
    render(<BacklogPanel userId="user-1" />);

    await screen.findByText('Старое название');
    await user.click(screen.getByRole('button', { name: 'Меню: Старое название' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Редактировать' }));

    const titleInput = screen.getByLabelText('Название');
    await user.clear(titleInput);
    await user.type(titleInput, 'Новое название');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Новое название')).toBeInTheDocument();
    expect(screen.queryByText('Старое название')).not.toBeInTheDocument();
  });

  it('closes the row menu on Escape without triggering any action', async () => {
    const user = userEvent.setup();
    await createTask(db, { userId: 'user-1', title: 'Задача с меню' });
    render(<BacklogPanel userId="user-1" />);

    await screen.findByText('Задача с меню');
    await user.click(screen.getByRole('button', { name: 'Меню: Задача с меню' }));
    expect(await screen.findByRole('menuitem', { name: 'Редактировать' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Редактировать' })).not.toBeInTheDocument();
    });
    // Still just viewing the row - editing was not opened.
    expect(screen.queryByLabelText('Название')).not.toBeInTheDocument();
    expect(screen.getByText('Задача с меню')).toBeInTheDocument();
  });

  it('closes the row menu when clicking outside of it', async () => {
    const user = userEvent.setup();
    await createTask(db, { userId: 'user-1', title: 'Ещё одна задача' });
    render(<BacklogPanel userId="user-1" />);

    await screen.findByText('Ещё одна задача');
    await user.click(screen.getByRole('button', { name: 'Меню: Ещё одна задача' }));
    expect(await screen.findByRole('menuitem', { name: 'Редактировать' })).toBeInTheDocument();

    await user.click(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Редактировать' })).not.toBeInTheDocument();
    });
  });

  it('deletes a task via the row menu', async () => {
    const user = userEvent.setup();
    await createTask(db, { userId: 'user-1', title: 'Удалить меня' });
    render(<BacklogPanel userId="user-1" />);

    await screen.findByText('Удалить меня');
    await user.click(screen.getByRole('button', { name: 'Меню: Удалить меня' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));

    await waitFor(() => {
      expect(screen.queryByText('Удалить меня')).not.toBeInTheDocument();
    });
  });

  it('shows a blocking error when completing a task fails, without marking it completed', async () => {
    const user = userEvent.setup();
    await createTask(db, { userId: 'user-1', title: 'Сломанная галочка' });
    render(<BacklogPanel userId="user-1" />);

    const checkbox = await screen.findByRole('checkbox', { name: 'Выполнено: Сломанная галочка' });
    const executeSpy = vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('disk full'));

    await user.click(checkbox);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось обновить задачу');
    // The watched query never saw a completed row - no optimistic
    // "looks completed" state, and the task is still in the open backlog.
    expect(screen.getByRole('checkbox', { name: 'Выполнено: Сломанная галочка' })).not.toBeChecked();
    expect(screen.getByText('Сломанная галочка')).toBeInTheDocument();

    executeSpy.mockRestore();
  });

  it('shows a blocking error when deleting a task fails, without removing it', async () => {
    const user = userEvent.setup();
    await createTask(db, { userId: 'user-1', title: 'Не удаляется' });
    render(<BacklogPanel userId="user-1" />);

    await screen.findByText('Не удаляется');
    const executeSpy = vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('disk full'));

    await user.click(screen.getByRole('button', { name: 'Меню: Не удаляется' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось удалить задачу');
    // No optimistic removal - the task is still rendered.
    expect(screen.getByText('Не удаляется')).toBeInTheDocument();

    executeSpy.mockRestore();
  });
});
