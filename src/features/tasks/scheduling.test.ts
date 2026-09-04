import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, createTestDb, type TestDatabase } from '@/test/sqlite-test-db';
import { createTask, mapTaskRow, TASK_COLUMNS, type TaskRow } from './task-repository';
import {
  moveTimedTask,
  resizeTimedTask,
  scheduleAllDayTask,
  scheduleDateOnlyTask,
  scheduleTimedTask,
  unscheduleTask,
} from './scheduling';
import type { CreateTaskInput, Task } from './task-types';

// Test-only helper that reads a task straight back out of SQLite,
// independent of the repository's own mapper, so assertions verify what was
// actually persisted rather than re-trusting the code under test.
async function getTask(db: TestDatabase, id: string): Promise<Task | null> {
  const row = await db.getOptional<TaskRow>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`, [id]);
  return row ? mapTaskRow(row) : null;
}

async function seedTask(db: TestDatabase, overrides: Partial<CreateTaskInput> = {}): Promise<Task> {
  return createTask(db, {
    userId: 'user-1',
    title: 'Seed task',
    ...overrides,
  });
}

// Seeds a task and immediately schedules it as a timed task with the given
// start/end and reschedule count, mirroring the shape most scheduling tests
// operate on.
async function seedTimedTask(
  db: TestDatabase,
  overrides: { startAt: string; endAt: string; rescheduleCount?: number; status?: Task['status'] },
): Promise<Task> {
  const task = await seedTask(db);
  await db.execute(
    `UPDATE tasks SET scheduled_date = ?, start_at = ?, end_at = ?, all_day = 0, reschedule_count = ?, status = ?
     WHERE id = ?`,
    [
      overrides.startAt.slice(0, 10),
      overrides.startAt,
      overrides.endAt,
      overrides.rescheduleCount ?? 0,
      overrides.status ?? 'open',
      task.id,
    ],
  );
  return (await getTask(db, task.id))!;
}

describe('scheduling', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  describe('scheduleTimedTask', () => {
    it('schedules a backlog task onto a specific start/end instant', async () => {
      const task = await seedTask(db);

      await scheduleTimedTask(db, task, '2026-08-28T09:00:00.000Z', '2026-08-28T10:00:00.000Z');

      const saved = await getTask(db, task.id);
      expect(saved?.scheduledDate).toBe('2026-08-28');
      expect(saved?.startAt).toBe('2026-08-28T09:00:00.000Z');
      expect(saved?.endAt).toBe('2026-08-28T10:00:00.000Z');
      expect(saved?.allDay).toBe(false);
    });

    it('increments reschedule_count by one when scheduling a previously scheduled task onto a new day', async () => {
      const task = await seedTimedTask(db, {
        startAt: '2026-08-27T09:00:00.000Z',
        endAt: '2026-08-27T10:00:00.000Z',
        rescheduleCount: 2,
      });

      await scheduleTimedTask(db, task, '2026-08-28T09:00:00.000Z', '2026-08-28T10:00:00.000Z');

      expect((await getTask(db, task.id))?.rescheduleCount).toBe(3);
    });

    it('rejects a start/end pair where end is not after start', async () => {
      const task = await seedTask(db);

      await expect(
        scheduleTimedTask(db, task, '2026-08-28T10:00:00.000Z', '2026-08-28T09:00:00.000Z'),
      ).rejects.toThrow();
    });
  });

  describe('scheduleAllDayTask', () => {
    it('marks the task all-day with no start/end times', async () => {
      const task = await seedTask(db);

      await scheduleAllDayTask(db, task, '2026-08-28');

      const saved = await getTask(db, task.id);
      expect(saved?.scheduledDate).toBe('2026-08-28');
      expect(saved?.startAt).toBeNull();
      expect(saved?.endAt).toBeNull();
      expect(saved?.allDay).toBe(true);
    });
  });

  describe('scheduleDateOnlyTask', () => {
    it('assigns a day without a specific time', async () => {
      const task = await seedTask(db);

      await scheduleDateOnlyTask(db, task, '2026-08-28');

      const saved = await getTask(db, task.id);
      expect(saved?.scheduledDate).toBe('2026-08-28');
      expect(saved?.startAt).toBeNull();
      expect(saved?.endAt).toBeNull();
      expect(saved?.allDay).toBe(false);
    });
  });

  describe('unscheduleTask', () => {
    it('unschedules a task without completing it', async () => {
      const task = await seedTimedTask(db, {
        startAt: '2026-08-27T09:00:00.000Z',
        endAt: '2026-08-27T10:00:00.000Z',
        status: 'open',
      });

      await unscheduleTask(db, task);

      const saved = await getTask(db, task.id);
      expect(saved?.scheduledDate).toBeNull();
      expect(saved?.startAt).toBeNull();
      expect(saved?.endAt).toBeNull();
      expect(saved?.allDay).toBe(false);
      expect(saved?.status).toBe('open');
    });

    it('does not change reschedule_count when unscheduling', async () => {
      const task = await seedTimedTask(db, {
        startAt: '2026-08-27T09:00:00.000Z',
        endAt: '2026-08-27T10:00:00.000Z',
        rescheduleCount: 4,
      });

      await unscheduleTask(db, task);

      expect((await getTask(db, task.id))?.rescheduleCount).toBe(4);
    });
  });

  describe('moveTimedTask', () => {
    it('increments reschedule count only when the calendar day changes', async () => {
      const task = await seedTimedTask(db, {
        startAt: '2026-08-27T09:00:00.000Z',
        endAt: '2026-08-27T10:00:00.000Z',
        rescheduleCount: 2,
      });

      await moveTimedTask(db, task, '2026-08-27T11:00:00.000Z', '2026-08-27T12:00:00.000Z');
      expect((await getTask(db, task.id))?.rescheduleCount).toBe(2);

      const moved = (await getTask(db, task.id))!;
      await moveTimedTask(db, moved, '2026-08-28T11:00:00.000Z', '2026-08-28T12:00:00.000Z');
      expect((await getTask(db, task.id))?.rescheduleCount).toBe(3);
    });

    it('updates scheduled_date to match the new local day', async () => {
      const task = await seedTimedTask(db, {
        startAt: '2026-08-27T09:00:00.000Z',
        endAt: '2026-08-27T10:00:00.000Z',
      });

      await moveTimedTask(db, task, '2026-08-29T13:00:00.000Z', '2026-08-29T14:00:00.000Z');

      const saved = await getTask(db, task.id);
      expect(saved?.scheduledDate).toBe('2026-08-29');
      expect(saved?.startAt).toBe('2026-08-29T13:00:00.000Z');
      expect(saved?.endAt).toBe('2026-08-29T14:00:00.000Z');
    });
  });

  describe('resizeTimedTask', () => {
    it('changes end_at without touching reschedule_count', async () => {
      const task = await seedTimedTask(db, {
        startAt: '2026-08-27T09:00:00.000Z',
        endAt: '2026-08-27T10:00:00.000Z',
        rescheduleCount: 1,
      });

      await resizeTimedTask(db, task, '2026-08-27T09:00:00.000Z', '2026-08-27T11:30:00.000Z');

      const saved = await getTask(db, task.id);
      expect(saved?.startAt).toBe('2026-08-27T09:00:00.000Z');
      expect(saved?.endAt).toBe('2026-08-27T11:30:00.000Z');
      expect(saved?.rescheduleCount).toBe(1);
    });

    it('rejects a resize where end is not after start', async () => {
      const task = await seedTimedTask(db, {
        startAt: '2026-08-27T09:00:00.000Z',
        endAt: '2026-08-27T10:00:00.000Z',
      });

      await expect(
        resizeTimedTask(db, task, '2026-08-27T09:00:00.000Z', '2026-08-27T09:00:00.000Z'),
      ).rejects.toThrow();
    });
  });
});
