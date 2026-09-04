import type { Task } from '@/features/tasks/task-types';

// A calendar event is always a projection of a `tasks` row (see the Slice B
// plan's Global Constraints) - never a separately stored record. `task` is
// the full source row so callers (event click handlers, drag/resize
// callbacks) can call scheduling repository functions directly against it
// without a second lookup.
export type PlannerCalendarEvent = {
  id: string;
  taskId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  areaColor: string;
  task: Task;
};

export type CalendarView = 'month' | 'week' | 'day';
