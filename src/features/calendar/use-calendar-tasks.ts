'use client';

import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import { mapTaskRow, TASK_COLUMNS, type TaskRow } from '@/features/tasks/task-repository';
import type { Task } from '@/features/tasks/task-types';

// Watches every scheduled task - open *or* completed, so checked-off tasks
// stay visible for historical review (Slice B plan, Task 2) - whose
// `scheduled_date` falls within [rangeStart, rangeEndExclusive) in the
// caller's local calendar. Callers pass the visible range reported by
// `react-big-calendar` for the active Month/Week/Day view, formatted as
// "yyyy-MM-dd" date keys.
const CALENDAR_RANGE_QUERY = `SELECT ${TASK_COLUMNS}
  FROM tasks
  WHERE user_id = ? AND scheduled_date IS NOT NULL AND scheduled_date >= ? AND scheduled_date < ?
  ORDER BY start_at ASC, created_at ASC`;

export type UseCalendarTasksResult = {
  tasks: Task[];
  isLoading: boolean;
};

export function useCalendarTasks(
  userId: string,
  rangeStart: string,
  rangeEndExclusive: string,
): UseCalendarTasksResult {
  const { data, isLoading } = useQuery<TaskRow>(CALENDAR_RANGE_QUERY, [userId, rangeStart, rangeEndExclusive]);
  const tasks = useMemo(() => data.map(mapTaskRow), [data]);

  return { tasks, isLoading };
}
