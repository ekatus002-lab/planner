import { format } from 'date-fns';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import type { Task } from './task-types';

// Domain-level scheduling operations for the unified `tasks` model (see the
// Slice B plan's Global Constraints: calendar data is a projection of
// `tasks`, never a separate events table). Each function below is the single
// place that decides how `scheduled_date`, `start_at`, `end_at`, `all_day`,
// and `reschedule_count` move together for a given gesture, so
// `calendar-board.tsx`/`backlog-panel.tsx` never assemble that column set by
// hand.

function assertEndAfterStart(startAt: string, endAt: string): void {
  if (!(new Date(endAt).getTime() > new Date(startAt).getTime())) {
    throw new Error('A timed task must end after it starts');
  }
}

// Local calendar date (YYYY-MM-DD) for an ISO instant, per the plan's rule
// that `scheduled_date` is the authoritative day for date-only/all-day tasks
// while `start_at`/`end_at` are authoritative for timed ones - i.e. the
// stored day always tracks the *local* wall-clock date the instant falls on.
// Deliberately uses `date-fns`'s `format` (reads the JS engine's local
// timezone), not a naive `iso.slice(0, 10)`: slicing would take the ISO
// string's UTC date component instead, which silently disagrees with the
// local date near midnight UTC-offset boundaries.
function dateKeyFromIso(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd');
}

async function persistTimedSchedule(
  db: CommonPowerSyncDatabase,
  taskId: string,
  startAt: string,
  endAt: string,
  rescheduleCount: number,
): Promise<void> {
  assertEndAfterStart(startAt, endAt);
  const dateKey = dateKeyFromIso(startAt);
  const now = new Date().toISOString();

  await db.execute(
    `UPDATE tasks SET scheduled_date = ?, start_at = ?, end_at = ?, all_day = 0,
     reschedule_count = ?, updated_at = ? WHERE id = ?`,
    [dateKey, startAt, endAt, rescheduleCount, now, taskId],
  );
}

// Schedules a task (typically from Backlog) onto a specific start/end
// instant. If the task was already scheduled on a different calendar day,
// `reschedule_count` increments by exactly one; scheduling for the first
// time, or re-confirming the same day, does not.
export async function scheduleTimedTask(
  db: CommonPowerSyncDatabase,
  task: Task,
  startAt: string,
  endAt: string,
): Promise<void> {
  const nextDateKey = dateKeyFromIso(startAt);
  const dayChanged = task.scheduledDate !== null && task.scheduledDate !== nextDateKey;
  const rescheduleCount = dayChanged ? task.rescheduleCount + 1 : task.rescheduleCount;
  await persistTimedSchedule(db, task.id, startAt, endAt, rescheduleCount);
}

// Moving a scheduled task to a new date/time via calendar drag. Same
// day-change rule as `scheduleTimedTask` - moving within the same calendar
// date changes the time but never increments `reschedule_count`.
export async function moveTimedTask(
  db: CommonPowerSyncDatabase,
  task: Task,
  startAt: string,
  endAt: string,
): Promise<void> {
  const nextDateKey = dateKeyFromIso(startAt);
  const dayChanged = task.scheduledDate !== nextDateKey;
  const rescheduleCount = dayChanged ? task.rescheduleCount + 1 : task.rescheduleCount;
  await persistTimedSchedule(db, task.id, startAt, endAt, rescheduleCount);
}

// Resizing a scheduled task's duration never changes its calendar day (a
// resize by definition keeps `start_at`'s date fixed), so `reschedule_count`
// is always carried through unchanged.
export async function resizeTimedTask(
  db: CommonPowerSyncDatabase,
  task: Task,
  startAt: string,
  endAt: string,
): Promise<void> {
  await persistTimedSchedule(db, task.id, startAt, endAt, task.rescheduleCount);
}

// Marks a task all-day on the given local date, clearing any specific time.
export async function scheduleAllDayTask(db: CommonPowerSyncDatabase, task: Task, date: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE tasks SET scheduled_date = ?, start_at = NULL, end_at = NULL, all_day = 1, updated_at = ?
     WHERE id = ?`,
    [date, now, task.id],
  );
}

// Assigns a task to a day without a specific time (rendered as a "day task"
// marker in the calendar's all-day row).
export async function scheduleDateOnlyTask(db: CommonPowerSyncDatabase, task: Task, date: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE tasks SET scheduled_date = ?, start_at = NULL, end_at = NULL, all_day = 0, updated_at = ?
     WHERE id = ?`,
    [date, now, task.id],
  );
}

// Drags a scheduled task back to Backlog: clears every scheduling field
// without marking it complete and without touching `reschedule_count` (per
// the plan's Global Constraints).
export async function unscheduleTask(db: CommonPowerSyncDatabase, task: Task): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE tasks SET scheduled_date = NULL, start_at = NULL, end_at = NULL, all_day = 0, updated_at = ?
     WHERE id = ?`,
    [now, task.id],
  );
}
