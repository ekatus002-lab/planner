import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import {
  createTask,
  deleteTask,
  getTaskById,
  listBacklogTasks,
  reorderBacklogTasks,
  setTaskCompleted,
  updateTask,
} from './task-repository';
import type { CreateTaskInput, Task } from './task-types';

type TaskRow = {
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

// Test-only helper that reads a task straight back out of SQLite and maps it
// independently of the repository's own (private) mapper, so assertions
// verify what was actually persisted rather than re-trusting the code under
// test.
async function getTask(db: TestDatabase, id: string): Promise<Task | null> {
  const row = await db.getOptional<TaskRow>(
    `SELECT id, user_id, area_id, goal_id, title, description, status, scheduled_date,
            start_at, end_at, all_day, priority, completed_at, reschedule_count,
            sort_order, field_versions, created_at, updated_at
     FROM tasks WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    areaId: row.area_id,
    goalId: row.goal_id,
    title: row.title,
    description: row.description,
    status: row.status as Task['status'],
    scheduledDate: row.scheduled_date,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day === 1,
    priority: row.priority as Task['priority'],
    completedAt: row.completed_at,
    rescheduleCount: row.reschedule_count,
    sortOrder: row.sort_order,
    fieldVersions: JSON.parse(row.field_versions) as Record<string, number>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function seedTask(db: TestDatabase, overrides: Partial<CreateTaskInput> = {}): Promise<Task> {
  return createTask(db, {
    userId: 'user-1',
    title: 'Seed task',
    ...overrides,
  });
}

describe('task-repository', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  it('creates an unscheduled open task in backlog', async () => {
    const task = await createTask(db, {
      userId: 'user-1',
      title: '  Обновить CV  ',
      areaId: 'career',
    });

    expect(task.title).toBe('Обновить CV');
    expect(task.scheduledDate).toBeNull();
    expect(task.status).toBe('open');
  });

  it('applies default description, priority, and areaId when omitted', async () => {
    const task = await createTask(db, { userId: 'user-1', title: 'Bare task' });

    expect(task.description).toBe('');
    expect(task.priority).toBe('normal');
    expect(task.areaId).toBeNull();
    expect(task.goalId).toBeNull();
    expect(task.allDay).toBe(false);
    expect(task.completedAt).toBeNull();
    expect(task.rescheduleCount).toBe(0);
    expect(task.fieldVersions).toEqual({});
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a blank title', async () => {
    await expect(createTask(db, { userId: 'user-1', title: '   ' })).rejects.toThrow(
      'Task title is required',
    );
  });

  it('marks a task completed and uncompleted', async () => {
    const task = await seedTask(db);

    await setTaskCompleted(db, task.id, true, '2026-08-27T10:00:00.000Z');
    expect((await getTask(db, task.id))?.completedAt).toBe('2026-08-27T10:00:00.000Z');
    expect((await getTask(db, task.id))?.status).toBe('completed');

    await setTaskCompleted(db, task.id, false, '2026-08-27T10:01:00.000Z');
    expect((await getTask(db, task.id))?.completedAt).toBeNull();
    expect((await getTask(db, task.id))?.status).toBe('open');
  });

  it('updates mutable fields, trimming the title, without touching status', async () => {
    const task = await seedTask(db, { title: 'Original' });

    await updateTask(db, task.id, { title: '  Renamed  ', priority: 'high', areaId: 'career' });

    const updated = await getTask(db, task.id);
    expect(updated?.title).toBe('Renamed');
    expect(updated?.priority).toBe('high');
    expect(updated?.areaId).toBe('career');
    expect(updated?.status).toBe('open');
    expect(updated?.updatedAt).not.toBe(task.updatedAt);
  });

  it('deletes a task', async () => {
    const task = await seedTask(db);

    await deleteTask(db, task.id);

    expect(await getTask(db, task.id)).toBeNull();
  });

  it('lists only unscheduled open tasks for the given user, ordered by sort_order then created_at', async () => {
    const a = await seedTask(db, { title: 'A' });
    await db.execute('UPDATE tasks SET sort_order = 5 WHERE id = ?', [a.id]);
    const b = await seedTask(db, { title: 'B' });
    await db.execute('UPDATE tasks SET sort_order = 1 WHERE id = ?', [b.id]);

    const scheduled = await seedTask(db, { title: 'Scheduled' });
    await db.execute('UPDATE tasks SET scheduled_date = ? WHERE id = ?', ['2026-09-01', scheduled.id]);

    const timed = await seedTask(db, { title: 'Timed' });
    await db.execute('UPDATE tasks SET start_at = ?, end_at = ? WHERE id = ?', [
      '2026-09-01T10:00:00.000Z',
      '2026-09-01T11:00:00.000Z',
      timed.id,
    ]);

    const completed = await seedTask(db, { title: 'Completed' });
    await setTaskCompleted(db, completed.id, true, '2026-08-27T00:00:00.000Z');

    const otherUser = await createTask(db, { userId: 'user-2', title: 'Other user backlog task' });

    const backlog = await listBacklogTasks(db, 'user-1');

    expect(backlog.map((t) => t.title)).toEqual(['B', 'A']);
    expect(backlog.every((t) => t.userId === 'user-1')).toBe(true);
    expect(backlog.some((t) => t.id === otherUser.id)).toBe(false);
  });

  it('gets a task by id, or null when it does not exist', async () => {
    const task = await seedTask(db, { title: 'Findable' });

    expect((await getTaskById(db, task.id))?.title).toBe('Findable');
    expect(await getTaskById(db, 'does-not-exist')).toBeNull();
  });

  it('reorders backlog tasks, persisting sort_order in increments of 10, surviving reload', async () => {
    const a = await seedTask(db, { title: 'A' });
    const b = await seedTask(db, { title: 'B' });
    const c = await seedTask(db, { title: 'C' });

    await reorderBacklogTasks(db, [c.id, a.id, b.id]);

    const reloaded = await listBacklogTasks(db, 'user-1');
    expect(reloaded.map((t) => t.title)).toEqual(['C', 'A', 'B']);
    expect((await getTaskById(db, c.id))?.sortOrder).toBe(10);
    expect((await getTaskById(db, a.id))?.sortOrder).toBe(20);
    expect((await getTaskById(db, b.id))?.sortOrder).toBe(30);
  });

  it('does not touch scheduling fields or reschedule_count when reordering', async () => {
    const task = await seedTask(db, { title: 'Untouched' });
    await db.execute(
      `UPDATE tasks SET scheduled_date = ?, start_at = ?, end_at = ?, reschedule_count = ? WHERE id = ?`,
      ['2026-09-01', '2026-09-01T09:00:00.000Z', '2026-09-01T10:00:00.000Z', 2, task.id],
    );

    await reorderBacklogTasks(db, [task.id]);

    const saved = await getTaskById(db, task.id);
    expect(saved?.scheduledDate).toBe('2026-09-01');
    expect(saved?.startAt).toBe('2026-09-01T09:00:00.000Z');
    expect(saved?.endAt).toBe('2026-09-01T10:00:00.000Z');
    expect(saved?.rescheduleCount).toBe(2);
  });
});
