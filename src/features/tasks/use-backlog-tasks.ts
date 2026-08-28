'use client';

import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import { mapTaskRow, TASK_COLUMNS, type TaskRow } from './task-repository';
import type { Task } from './task-types';

// Mirrors `listBacklogTasks` in `task-repository.ts`, but as a *watched*
// query: re-runs (and re-emits) whenever a write touches the `tasks` table,
// giving the Backlog panel a live list of unscheduled, open tasks instead of
// a one-off snapshot.
const BACKLOG_QUERY = `SELECT ${TASK_COLUMNS}
  FROM tasks
  WHERE user_id = ? AND scheduled_date IS NULL AND start_at IS NULL AND status = 'open'
  ORDER BY sort_order ASC, created_at ASC`;

export type UseBacklogTasksResult = {
  tasks: Task[];
  isLoading: boolean;
};

export function useBacklogTasks(userId: string): UseBacklogTasksResult {
  const { data, isLoading } = useQuery<TaskRow>(BACKLOG_QUERY, [userId]);
  const tasks = useMemo(() => data.map(mapTaskRow), [data]);

  return { tasks, isLoading };
}
