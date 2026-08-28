import type { ReactElement } from 'react';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    await user.click(screen.getByRole('menuitem', { name: 'Редактировать' }));

    const titleInput = screen.getByLabelText('Название');
    await user.clear(titleInput);
    await user.type(titleInput, 'Новое название');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Новое название')).toBeInTheDocument();
    expect(screen.queryByText('Старое название')).not.toBeInTheDocument();
  });

  it('deletes a task via the row menu', async () => {
    const user = userEvent.setup();
    await createTask(db, { userId: 'user-1', title: 'Удалить меня' });
    render(<BacklogPanel userId="user-1" />);

    await screen.findByText('Удалить меня');
    await user.click(screen.getByRole('button', { name: 'Меню: Удалить меня' }));
    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }));

    await waitFor(() => {
      expect(screen.queryByText('Удалить меня')).not.toBeInTheDocument();
    });
  });
});
