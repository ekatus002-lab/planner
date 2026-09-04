import type { ReactElement } from 'react';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { PowerSyncTestProvider } from '@/test/powersync-test-provider';
import { createTask, setTaskCompleted } from '@/features/tasks/task-repository';
import { GoalsPanel } from './goals-panel';
import { createGoal, linkTaskToGoal } from './goal-repository';

const TODAY = '2026-08-27';

describe('GoalsPanel', () => {
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

  it('recalculates displayed progress the instant a linked task is completed', async () => {
    const goal = await createGoal(db, {
      userId: 'user-1',
      title: 'English B2',
      startDate: '2026-08-01',
      endDate: '2026-12-31',
      progressMode: 'automatic',
    });
    const taskA = await createTask(db, { userId: 'user-1', title: 'Task A' });
    const taskB = await createTask(db, { userId: 'user-1', title: 'Task B' });
    await linkTaskToGoal(db, 'user-1', goal.id, taskA.id);
    await linkTaskToGoal(db, 'user-1', goal.id, taskB.id);
    await setTaskCompleted(db, taskA.id, true, '2026-08-20T00:00:00.000Z');

    render(<GoalsPanel userId="user-1" today={TODAY} />);

    expect(await screen.findByText('50%')).toBeInTheDocument();

    await setTaskCompleted(db, taskB.id, true, '2026-08-27T00:00:00.000Z');

    expect(await screen.findByText('100%')).toBeInTheDocument();
  });

  it('creates a new goal via the form and shows it immediately', async () => {
    const user = userEvent.setup();
    render(<GoalsPanel userId="user-1" today={TODAY} />);

    await user.click(screen.getByRole('button', { name: 'Новая цель' }));
    await user.type(screen.getByLabelText('Название'), 'Portfolio');
    await user.type(screen.getByLabelText('Начало'), '2026-08-01');
    await user.type(screen.getByLabelText('Окончание'), '2026-12-31');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Portfolio')).toBeInTheDocument();
  });

  it('shows a compact source explanation with task and habit contributions', async () => {
    const goal = await createGoal(db, {
      userId: 'user-1',
      title: 'English B2',
      startDate: '2026-08-01',
      endDate: '2026-12-31',
      progressMode: 'automatic',
    });
    const task = await createTask(db, { userId: 'user-1', title: 'Task A' });
    await linkTaskToGoal(db, 'user-1', goal.id, task.id);

    render(<GoalsPanel userId="user-1" today={TODAY} />);

    expect(await screen.findByText(/Задачи 0\/1/)).toBeInTheDocument();
  });

  it('edits a goal via its title', async () => {
    const user = userEvent.setup();
    await createGoal(db, {
      userId: 'user-1',
      title: 'Old title',
      startDate: '2026-08-01',
      endDate: '2026-12-31',
    });
    render(<GoalsPanel userId="user-1" today={TODAY} />);

    await user.click(await screen.findByText('Old title'));
    const titleInput = screen.getByLabelText('Название');
    await user.clear(titleInput);
    await user.type(titleInput, 'New title');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(screen.getByText('New title')).toBeInTheDocument();
      expect(screen.queryByText('Old title')).not.toBeInTheDocument();
    });
  });
});
