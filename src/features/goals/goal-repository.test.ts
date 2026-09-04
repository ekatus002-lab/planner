import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { createTask } from '@/features/tasks/task-repository';
import { createHabit } from '@/features/habits/habit-repository';
import {
  createGoal,
  deleteGoal,
  linkHabitToGoal,
  linkTaskToGoal,
  listGoalHabitIds,
  listGoals,
  listGoalTaskIds,
  unlinkHabitFromGoal,
  unlinkTaskFromGoal,
  updateGoal,
} from './goal-repository';
import type { CreateGoalInput } from './goal-types';

describe('goal-repository', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  function seedGoal(overrides: Partial<CreateGoalInput> = {}) {
    return createGoal(db, {
      userId: 'user-1',
      title: 'English B2',
      startDate: '2026-08-01',
      endDate: '2026-12-31',
      ...overrides,
    });
  }

  it('creates a goal with hybrid-mode defaults', async () => {
    const goal = await seedGoal();

    expect(goal.title).toBe('English B2');
    expect(goal.progressMode).toBe('hybrid');
    expect(goal.manualProgress).toBe(0);
    expect(goal.manualAdjustment).toBe(0);
    expect(goal.description).toBe('');
    expect(goal.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('trims the title and rejects a blank one', async () => {
    const goal = await seedGoal({ title: '  Portfolio  ' });
    expect(goal.title).toBe('Portfolio');

    await expect(seedGoal({ title: '   ' })).rejects.toThrow('Goal title is required');
  });

  it('rejects an end_date before start_date', async () => {
    await expect(
      seedGoal({ startDate: '2026-08-10', endDate: '2026-08-01' }),
    ).rejects.toThrow('Goal end date must not be before its start date');
  });

  it('creates an open-ended goal with no start or end date at all', async () => {
    const goal = await createGoal(db, { userId: 'user-1', title: 'Someday' });

    expect(goal.startDate).toBeNull();
    expect(goal.endDate).toBeNull();

    const [stored] = await listGoals(db, 'user-1');
    expect(stored.startDate).toBeNull();
    expect(stored.endDate).toBeNull();
  });

  it('creates a goal with only a start date set', async () => {
    const goal = await createGoal(db, {
      userId: 'user-1',
      title: 'Only a start',
      startDate: '2026-08-01',
    });

    expect(goal.startDate).toBe('2026-08-01');
    expect(goal.endDate).toBeNull();
  });

  it('creates a goal with only an end date set', async () => {
    const goal = await createGoal(db, {
      userId: 'user-1',
      title: 'Only an end',
      endDate: '2026-12-31',
    });

    expect(goal.startDate).toBeNull();
    expect(goal.endDate).toBe('2026-12-31');
  });

  it('does not reject a missing date against a present one - only compares when both are set', async () => {
    await expect(createGoal(db, { userId: 'user-1', title: 'Start only', startDate: '2026-08-10' })).resolves
      .toBeTruthy();
    await expect(createGoal(db, { userId: 'user-1', title: 'End only', endDate: '2026-01-01' })).resolves
      .toBeTruthy();
  });

  it('clamps manual_progress and manual_adjustment to their valid ranges on create', async () => {
    const goal = await seedGoal({ manualProgress: 150, manualAdjustment: -500 });
    expect(goal.manualProgress).toBe(100);
    expect(goal.manualAdjustment).toBe(-100);
  });

  it('updates mutable fields', async () => {
    const goal = await seedGoal();

    await updateGoal(db, goal.id, { title: '  English C1  ', progressMode: 'manual', manualProgress: 40 });

    const [updated] = await listGoals(db, 'user-1');
    expect(updated.title).toBe('English C1');
    expect(updated.progressMode).toBe('manual');
    expect(updated.manualProgress).toBe(40);
  });

  it('clears a previously-set date when patched with null, and leaves it alone when the key is absent', async () => {
    const goal = await seedGoal();

    await updateGoal(db, goal.id, { startDate: null });
    let [updated] = await listGoals(db, 'user-1');
    expect(updated.startDate).toBeNull();
    expect(updated.endDate).toBe('2026-12-31'); // untouched: key absent from the patch

    await updateGoal(db, goal.id, { endDate: null });
    [updated] = await listGoals(db, 'user-1');
    expect(updated.startDate).toBeNull();
    expect(updated.endDate).toBeNull();
  });

  it('lists goals for the given user only', async () => {
    await seedGoal({ title: 'Mine' });
    await createGoal(db, {
      userId: 'user-2',
      title: 'Someone else',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    const goals = await listGoals(db, 'user-1');
    expect(goals.map((g) => g.title)).toEqual(['Mine']);
  });

  it('deletes a goal along with its task/habit links', async () => {
    const goal = await seedGoal();
    const task = await createTask(db, { userId: 'user-1', title: 'Write essay' });
    const habit = await createHabit(db, { userId: 'user-1', title: 'Practice' });
    await linkTaskToGoal(db, 'user-1', goal.id, task.id);
    await linkHabitToGoal(db, 'user-1', goal.id, habit.id);

    await deleteGoal(db, goal.id);

    expect(await listGoals(db, 'user-1')).toHaveLength(0);
    expect(await listGoalTaskIds(db, goal.id)).toHaveLength(0);
    expect(await listGoalHabitIds(db, goal.id)).toHaveLength(0);
  });

  describe('task links', () => {
    it('links a task to a goal and mirrors it onto tasks.goal_id', async () => {
      const goal = await seedGoal();
      const task = await createTask(db, { userId: 'user-1', title: 'Write essay' });

      await linkTaskToGoal(db, 'user-1', goal.id, task.id);

      expect(await listGoalTaskIds(db, goal.id)).toEqual([task.id]);
      const row = await db.getOptional<{ goal_id: string | null }>('SELECT goal_id FROM tasks WHERE id = ?', [
        task.id,
      ]);
      expect(row?.goal_id).toBe(goal.id);
    });

    it('replaces a task’s existing goal link rather than creating a second one', async () => {
      const goalA = await seedGoal({ title: 'Goal A' });
      const goalB = await seedGoal({ title: 'Goal B' });
      const task = await createTask(db, { userId: 'user-1', title: 'Write essay' });

      await linkTaskToGoal(db, 'user-1', goalA.id, task.id);
      await linkTaskToGoal(db, 'user-1', goalB.id, task.id);

      expect(await listGoalTaskIds(db, goalA.id)).toEqual([]);
      expect(await listGoalTaskIds(db, goalB.id)).toEqual([task.id]);
    });

    it('unlinks a task from a goal and clears tasks.goal_id', async () => {
      const goal = await seedGoal();
      const task = await createTask(db, { userId: 'user-1', title: 'Write essay' });
      await linkTaskToGoal(db, 'user-1', goal.id, task.id);

      await unlinkTaskFromGoal(db, task.id);

      expect(await listGoalTaskIds(db, goal.id)).toEqual([]);
      const row = await db.getOptional<{ goal_id: string | null }>('SELECT goal_id FROM tasks WHERE id = ?', [
        task.id,
      ]);
      expect(row?.goal_id).toBeNull();
    });
  });

  describe('habit links', () => {
    it('links a habit to a goal without duplicating the relation row', async () => {
      const goal = await seedGoal();
      const habit = await createHabit(db, { userId: 'user-1', title: 'Practice' });

      await linkHabitToGoal(db, 'user-1', goal.id, habit.id);
      await linkHabitToGoal(db, 'user-1', goal.id, habit.id);

      expect(await listGoalHabitIds(db, goal.id)).toEqual([habit.id]);
    });

    it('supports linking multiple habits to one goal', async () => {
      const goal = await seedGoal();
      const habitA = await createHabit(db, { userId: 'user-1', title: 'Practice speaking' });
      const habitB = await createHabit(db, { userId: 'user-1', title: 'Practice writing' });

      await linkHabitToGoal(db, 'user-1', goal.id, habitA.id);
      await linkHabitToGoal(db, 'user-1', goal.id, habitB.id);

      expect(await listGoalHabitIds(db, goal.id)).toEqual(
        expect.arrayContaining([habitA.id, habitB.id]),
      );
    });

    it('unlinks a habit from a goal', async () => {
      const goal = await seedGoal();
      const habit = await createHabit(db, { userId: 'user-1', title: 'Practice' });
      await linkHabitToGoal(db, 'user-1', goal.id, habit.id);

      await unlinkHabitFromGoal(db, goal.id, habit.id);

      expect(await listGoalHabitIds(db, goal.id)).toEqual([]);
    });
  });
});
