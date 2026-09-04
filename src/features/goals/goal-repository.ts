import type { CommonPowerSyncDatabase } from '@powersync/web';
import type { CreateGoalInput, Goal, GoalProgressMode, UpdateGoalInput } from './goal-types';

// Column names mirror the local SQLite `goals` table (and, in turn,
// `supabase/migrations/202609040001_habits_goals.sql`) exactly.
export type GoalRow = {
  id: string;
  user_id: string;
  area_id: string | null;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  progress_mode: string;
  manual_progress: number;
  manual_adjustment: number;
  created_at: string;
  updated_at: string;
};

export const GOAL_COLUMNS = `id, user_id, area_id, title, description, start_date, end_date,
       progress_mode, manual_progress, manual_adjustment, created_at, updated_at`;

export function mapGoalRow(row: GoalRow): Goal {
  return {
    id: row.id,
    userId: row.user_id,
    areaId: row.area_id,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    progressMode: row.progress_mode as GoalProgressMode,
    manualProgress: row.manual_progress,
    manualAdjustment: row.manual_adjustment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function listGoals(db: CommonPowerSyncDatabase, userId: string): Promise<Goal[]> {
  const rows = await db.getAll<GoalRow>(
    `SELECT ${GOAL_COLUMNS} FROM goals WHERE user_id = ? ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map(mapGoalRow);
}

export async function createGoal(db: CommonPowerSyncDatabase, input: CreateGoalInput): Promise<Goal> {
  const title = input.title.trim();
  if (!title) throw new Error('Goal title is required');
  const startDate = input.startDate ?? null;
  const endDate = input.endDate ?? null;
  if (startDate && endDate && endDate < startDate) {
    throw new Error('Goal end date must not be before its start date');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const areaId = input.areaId ?? null;
  const description = input.description ?? '';
  const progressMode = input.progressMode ?? 'hybrid';
  const manualProgress = clamp(input.manualProgress ?? 0, 0, 100);
  const manualAdjustment = clamp(input.manualAdjustment ?? 0, -100, 100);

  await db.execute(
    `INSERT INTO goals (
      id, user_id, area_id, title, description, start_date, end_date,
      progress_mode, manual_progress, manual_adjustment, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      areaId,
      title,
      description,
      startDate,
      endDate,
      progressMode,
      manualProgress,
      manualAdjustment,
      now,
      now,
    ],
  );

  return {
    id,
    userId: input.userId,
    areaId,
    title,
    description,
    startDate,
    endDate,
    progressMode,
    manualProgress,
    manualAdjustment,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateGoal(db: CommonPowerSyncDatabase, id: string, patch: UpdateGoalInput): Promise<void> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error('Goal title is required');
    assignments.push('title = ?');
    values.push(title);
  }
  if (patch.description !== undefined) {
    assignments.push('description = ?');
    values.push(patch.description);
  }
  if (patch.areaId !== undefined) {
    assignments.push('area_id = ?');
    values.push(patch.areaId);
  }
  if (patch.startDate !== undefined) {
    assignments.push('start_date = ?');
    values.push(patch.startDate);
  }
  if (patch.endDate !== undefined) {
    assignments.push('end_date = ?');
    values.push(patch.endDate);
  }
  if (patch.progressMode !== undefined) {
    assignments.push('progress_mode = ?');
    values.push(patch.progressMode);
  }
  if (patch.manualProgress !== undefined) {
    assignments.push('manual_progress = ?');
    values.push(clamp(patch.manualProgress, 0, 100));
  }
  if (patch.manualAdjustment !== undefined) {
    assignments.push('manual_adjustment = ?');
    values.push(clamp(patch.manualAdjustment, -100, 100));
  }

  if (assignments.length === 0) return;

  assignments.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  await db.execute(`UPDATE goals SET ${assignments.join(', ')} WHERE id = ?`, values);
}

// Deletes a goal along with its relation rows. Local SQLite tables built
// from `AppSchema` do not enforce the Postgres `on delete cascade`
// constraints, so `goal_tasks`/`goal_habits` rows are cleaned up explicitly
// here rather than relying on a cascade that only exists server-side.
export async function deleteGoal(db: CommonPowerSyncDatabase, id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM goal_tasks WHERE goal_id = ?', [id]);
    await tx.execute('DELETE FROM goal_habits WHERE goal_id = ?', [id]);
    await tx.execute('UPDATE tasks SET goal_id = NULL WHERE goal_id = ?', [id]);
    await tx.execute('DELETE FROM goals WHERE id = ?', [id]);
  });
}

export async function listGoalTaskIds(db: CommonPowerSyncDatabase, goalId: string): Promise<string[]> {
  const rows = await db.getAll<{ task_id: string }>('SELECT task_id FROM goal_tasks WHERE goal_id = ?', [goalId]);
  return rows.map((row) => row.task_id);
}

export async function listGoalHabitIds(db: CommonPowerSyncDatabase, goalId: string): Promise<string[]> {
  const rows = await db.getAll<{ habit_id: string }>('SELECT habit_id FROM goal_habits WHERE goal_id = ?', [
    goalId,
  ]);
  return rows.map((row) => row.habit_id);
}

// A task links to at most one goal at a time (the design spec's "optional
// single goal selector"): linking replaces any prior `goal_tasks` row for
// this task and mirrors the link onto `tasks.goal_id` so task forms can
// render the relationship without joining through `goal_tasks` - which
// remains the normalized relation progress calculations read from.
export async function linkTaskToGoal(
  db: CommonPowerSyncDatabase,
  userId: string,
  goalId: string,
  taskId: string,
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM goal_tasks WHERE task_id = ?', [taskId]);
    await tx.execute(
      'INSERT INTO goal_tasks (id, user_id, goal_id, task_id) VALUES (?, ?, ?, ?)',
      [crypto.randomUUID(), userId, goalId, taskId],
    );
    await tx.execute('UPDATE tasks SET goal_id = ?, updated_at = ? WHERE id = ?', [
      goalId,
      new Date().toISOString(),
      taskId,
    ]);
  });
}

export async function unlinkTaskFromGoal(db: CommonPowerSyncDatabase, taskId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM goal_tasks WHERE task_id = ?', [taskId]);
    await tx.execute('UPDATE tasks SET goal_id = NULL, updated_at = ? WHERE id = ?', [
      new Date().toISOString(),
      taskId,
    ]);
  });
}

// A goal may link to many habits, and a habit may link to many goals, so
// linking is idempotent rather than replacing a prior row the way
// `linkTaskToGoal` does. The (goal_id, habit_id) uniqueness constraint from
// `supabase/migrations/202609040001_habits_goals.sql` only exists in
// Postgres - PowerSync's local SQLite tables (built from `AppSchema`'s plain
// column definitions) have no equivalent unique index to make `INSERT OR
// IGNORE` conflict-safe locally, so the existence check happens here
// explicitly instead.
export async function linkHabitToGoal(
  db: CommonPowerSyncDatabase,
  userId: string,
  goalId: string,
  habitId: string,
): Promise<void> {
  const existing = await db.getOptional<{ id: string }>(
    'SELECT id FROM goal_habits WHERE goal_id = ? AND habit_id = ?',
    [goalId, habitId],
  );
  if (existing) return;

  await db.execute('INSERT INTO goal_habits (id, user_id, goal_id, habit_id) VALUES (?, ?, ?, ?)', [
    crypto.randomUUID(),
    userId,
    goalId,
    habitId,
  ]);
}

export async function unlinkHabitFromGoal(
  db: CommonPowerSyncDatabase,
  goalId: string,
  habitId: string,
): Promise<void> {
  await db.execute('DELETE FROM goal_habits WHERE goal_id = ? AND habit_id = ?', [goalId, habitId]);
}
