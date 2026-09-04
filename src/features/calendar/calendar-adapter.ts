import { addDays, parse } from 'date-fns';
import type { Task } from '@/features/tasks/task-types';
import type { PlannerCalendarEvent } from './calendar-types';

// Only the color is needed to project a task into a calendar event - keeping
// this narrower than the full `Area` type lets callers build it from a
// simple `areaId -> color` lookup (see `tasksToCalendarEvents`) without
// fetching whole area rows.
export type CalendarArea = { color: string };

// Matches the default "Other" life area's color
// (`supabase/migrations/202608270001_foundation.sql`) - the same neutral
// gray `area-settings.tsx` offers as `DEFAULT_NEW_COLOR`. Used only when a
// task has no `areaId` at all (an archived/deleted area still resolves its
// own stored color via the caller's lookup).
export const FALLBACK_AREA_COLOR = '#9CA3AF';

// A date-only value (`scheduled_date`, e.g. "2026-08-28") always means a
// *local* calendar day, never a UTC instant - parsing it with `date-fns`'s
// `parse` (rather than `new Date('2026-08-28')`, which is UTC midnight)
// keeps that day from shifting by a timezone offset. The range is
// end-exclusive, spanning exactly the 24 hours of that local day.
export function dateOnlyToLocalRange(dateKey: string): { start: Date; end: Date } {
  const start = parse(dateKey, 'yyyy-MM-dd', new Date());
  return { start, end: addDays(start, 1) };
}

// Projects one task into a calendar event, or `null` if it does not belong
// on the calendar at all (an unscheduled Backlog task). Per the Slice B
// plan:
//   - start_at/end_at present -> timed event.
//   - scheduled_date + all_day=1 -> all-day event spanning that local day.
//   - scheduled_date + all_day=0 and no times -> still placed in the
//     all-day row (there is no time to position it at), but `task.allDay`
//     stays `false` so the rendering layer (`calendar-event.tsx`) can draw
//     a distinct "day task" marker instead of a true all-day style.
// Completed tasks are still projected (and stay visible) as long as they
// fall in the requested range, so checked-off days remain reviewable.
export function taskToCalendarEvent(task: Task, area: CalendarArea | null): PlannerCalendarEvent | null {
  const isBacklog = task.scheduledDate === null && task.startAt === null;
  if (isBacklog) return null;

  const areaColor = area?.color ?? FALLBACK_AREA_COLOR;

  if (task.startAt && task.endAt) {
    return {
      id: task.id,
      taskId: task.id,
      title: task.title,
      start: new Date(task.startAt),
      end: new Date(task.endAt),
      allDay: false,
      areaColor,
      task,
    };
  }

  if (task.scheduledDate) {
    const { start, end } = dateOnlyToLocalRange(task.scheduledDate);
    return {
      id: task.id,
      taskId: task.id,
      title: task.title,
      start,
      end,
      allDay: true,
      areaColor,
      task,
    };
  }

  return null;
}

// Projects a watched list of tasks into calendar events, resolving each
// task's area color from a plain `areaId -> color` map (see
// `useAreaColorById` in `calendar-board.tsx`) instead of full `Area` rows.
export function tasksToCalendarEvents(
  tasks: Task[],
  areaColorById: Record<string, string>,
): PlannerCalendarEvent[] {
  return tasks
    .map((task) => taskToCalendarEvent(task, task.areaId ? { color: areaColorById[task.areaId] } : null))
    .filter((event): event is PlannerCalendarEvent => event !== null);
}
