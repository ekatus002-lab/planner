import type { CommonPowerSyncDatabase } from '@powersync/web';
import type { CreateTaskInput, Task, TaskPriority, TaskStatus, UpdateTaskInput } from './task-types';

// Column names mirror the local SQLite `tasks` table (and, in turn,
// `supabase/migrations/202608270001_foundation.sql`) exactly. Exported so
// `use-backlog-tasks.ts` can type its watched query's raw rows without
// redeclaring the shape.
export type TaskRow = {
  id: string;
  user_id: string;
  area_id: string | null;
  goal_id: string | null;
  title: string;
  description: string;
  status: string;
  scheduled_date: string | null;
  start_at: string | null;
  end_at: string | null;
  all_day: number;
  priority: string;
  completed_at: string | null;
  reschedule_count: number;
  sort_order: number;
  field_versions: string;
  created_at: string;
  updated_at: string;
};

// Exported so `use-backlog-tasks.ts` can build its watched query against the
// exact same column list the one-off `listBacklogTasks` query below uses.
export const TASK_COLUMNS = `id, user_id, area_id, goal_id, title, description, status, scheduled_date,
       start_at, end_at, all_day, priority, completed_at, reschedule_count,
       sort_order, field_versions, created_at, updated_at`;

// Single mapper used by every task query - converts SQLite's integer boolean
// representation and JSON text column to real TypeScript booleans/objects.
// Exported so `use-backlog-tasks.ts` maps rows identically to the one-off
// queries below, instead of maintaining a second mapping.
export function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    userId: row.user_id,
    areaId: row.area_id,
    goalId: row.goal_id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    scheduledDate: row.scheduled_date,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day === 1,
    priority: row.priority as TaskPriority,
    completedAt: row.completed_at,
    rescheduleCount: row.reschedule_count,
    sortOrder: row.sort_order,
    fieldVersions: JSON.parse(row.field_versions) as Record<string, number>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Unscheduled, open tasks - the "backlog" a user has not yet placed on the
// calendar (Task 6's backlog panel).
export async function listBacklogTasks(db: CommonPowerSyncDatabase, userId: string): Promise<Task[]> {
  const rows = await db.getAll<TaskRow>(
    `SELECT ${TASK_COLUMNS}
     FROM tasks
     WHERE user_id = ? AND scheduled_date IS NULL AND start_at IS NULL AND status = 'open'
     ORDER BY sort_order ASC, created_at ASC`,
    [userId],
  );

  return rows.map(mapTaskRow);
}

export async function createTask(db: CommonPowerSyncDatabase, input: CreateTaskInput): Promise<Task> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = input.title.trim();
  if (!title) throw new Error('Task title is required');

  const areaId = input.areaId ?? null;
  const description = input.description ?? '';
  const priority = input.priority ?? 'normal';
  const sortOrder = Date.now();

  await db.execute(
    `INSERT INTO tasks (
      id, user_id, area_id, goal_id, title, description, status,
      scheduled_date, start_at, end_at, all_day, priority,
      completed_at, reschedule_count, sort_order, field_versions,
      created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, 'open', NULL, NULL, NULL, 0, ?, NULL, 0, ?, '{}', ?, ?)`,
    [id, input.userId, areaId, title, description, priority, sortOrder, now, now],
  );

  return {
    id,
    userId: input.userId,
    areaId,
    goalId: null,
    title,
    description,
    status: 'open',
    scheduledDate: null,
    startAt: null,
    endAt: null,
    allDay: false,
    priority,
    completedAt: null,
    rescheduleCount: 0,
    sortOrder,
    fieldVersions: {},
    createdAt: now,
    updatedAt: now,
  };
}

// Column name -> patch key mapping, applied in a single dynamic UPDATE built
// entirely from parameterized placeholders (never interpolated values).
export async function updateTask(db: CommonPowerSyncDatabase, id: string, patch: UpdateTaskInput): Promise<void> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error('Task title is required');
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
  if (patch.goalId !== undefined) {
    assignments.push('goal_id = ?');
    values.push(patch.goalId);
  }
  if (patch.priority !== undefined) {
    assignments.push('priority = ?');
    values.push(patch.priority);
  }
  if (patch.scheduledDate !== undefined) {
    assignments.push('scheduled_date = ?');
    values.push(patch.scheduledDate);
  }
  if (patch.startAt !== undefined) {
    assignments.push('start_at = ?');
    values.push(patch.startAt);
  }
  if (patch.endAt !== undefined) {
    assignments.push('end_at = ?');
    values.push(patch.endAt);
  }
  if (patch.allDay !== undefined) {
    assignments.push('all_day = ?');
    values.push(patch.allDay ? 1 : 0);
  }
  if (patch.rescheduleCount !== undefined) {
    assignments.push('reschedule_count = ?');
    values.push(patch.rescheduleCount);
  }
  if (patch.sortOrder !== undefined) {
    assignments.push('sort_order = ?');
    values.push(patch.sortOrder);
  }

  if (assignments.length === 0) {
    return;
  }

  assignments.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  await db.execute(`UPDATE tasks SET ${assignments.join(', ')} WHERE id = ?`, values);
}

export async function setTaskCompleted(
  db: CommonPowerSyncDatabase,
  id: string,
  completed: boolean,
  now: string,
): Promise<void> {
  await db.execute(`UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`, [
    completed ? 'completed' : 'open',
    completed ? now : null,
    now,
    id,
  ]);
}

export async function deleteTask(db: CommonPowerSyncDatabase, id: string): Promise<void> {
  await db.execute('DELETE FROM tasks WHERE id = ?', [id]);
}

// Single-row lookup by id - used by drag/drop's by-id scheduling wrappers
// (`scheduling.ts`) and by the calendar editor, which each only have a task
// *id* available (a dnd-kit drag payload, a clicked event's `taskId`) and
// need the full row to run the reschedule-count diffing logic.
export async function getTaskById(db: CommonPowerSyncDatabase, id: string): Promise<Task | null> {
  const row = await db.getOptional<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`, [id]);
  return row ? mapTaskRow(row) : null;
}

// Persists a new relative order for the given backlog task ids, assigning
// sequential `sort_order` values in increments of 10 (mirrors
// `reorderAreas` in `area-repository.ts`). Runs as a single
// `writeTransaction` so a mid-loop failure rolls back every UPDATE instead
// of leaving `sort_order` half-renumbered. Deliberately touches only
// `sort_order`/`updated_at` - never `scheduled_date`/`start_at`/`end_at`/
// `reschedule_count` - so a pure reorder drag can never look like a
// reschedule.
export async function reorderBacklogTasks(db: CommonPowerSyncDatabase, orderedTaskIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    for (let index = 0; index < orderedTaskIds.length; index += 1) {
      await tx.execute('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?', [
        (index + 1) * 10,
        now,
        orderedTaskIds[index],
      ]);
    }
  });
}
