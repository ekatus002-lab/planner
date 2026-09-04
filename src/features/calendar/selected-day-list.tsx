'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useQuery, usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { mapTaskRow, setTaskCompleted, TASK_COLUMNS, type TaskRow } from '@/features/tasks/task-repository';
import type { Task } from '@/features/tasks/task-types';

type Props = { userId: string; date: string };

// Every task scheduled on the given local day - open and completed alike,
// so a completed task stays visible for the rest of the day (mirrors
// `use-calendar-tasks.ts`'s own "completed tasks stay visible" rule).
// Ordering is finished in JS (`sortSelectedDayTasks`) rather than SQL: the
// "all-day, then timed by start time, then date-only" ordering the plan
// requires isn't expressible as a single ORDER BY without a CASE
// expression duplicating that same rank logic anyway.
const SELECTED_DAY_QUERY = `SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? AND scheduled_date = ?`;

function rank(task: Task): 0 | 1 | 2 {
  if (task.allDay) return 0;
  if (task.startAt) return 1;
  return 2;
}

// All-day tasks first, then timed tasks in start-time order, then date-only
// "day tasks" last (they have no time to sort by).
export function sortSelectedDayTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    if (rank(a) === 1) return (a.startAt as string).localeCompare(b.startAt as string);
    return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
  });
}

function useSelectedDayTasks(userId: string, date: string): Task[] {
  const { data } = useQuery<TaskRow>(SELECTED_DAY_QUERY, [userId, date]);
  return useMemo(() => sortSelectedDayTasks(data.map(mapTaskRow)), [data]);
}

type AreaRow = { id: string; name: string; color: string };

function useAreasById(userId: string): Record<string, { name: string; color: string }> {
  const { data } = useQuery<AreaRow>('SELECT id, name, color FROM areas WHERE user_id = ?', [userId]);
  return useMemo(
    () => Object.fromEntries(data.map((area) => [area.id, { name: area.name, color: area.color }])),
    [data],
  );
}

function timeMarker(task: Task): string {
  if (task.allDay) return 'Весь день';
  if (task.startAt) return format(new Date(task.startAt), 'HH:mm');
  return '—'; // em dash - a date-only task has no specific time.
}

export function SelectedDayList({ userId, date }: Props) {
  const db = usePowerSync() as CommonPowerSyncDatabase | null;
  const tasks = useSelectedDayTasks(userId, date);
  const areasById = useAreasById(userId);
  const [error, setError] = useState<string | null>(null);

  async function handleToggleCompleted(task: Task) {
    if (!db) {
      setError('Не удалось обновить задачу');
      return;
    }
    try {
      await setTaskCompleted(db, task.id, task.status !== 'completed', new Date().toISOString());
      setError(null);
    } catch {
      setError('Не удалось обновить задачу');
    }
  }

  return (
    <div className="space-y-2" data-testid="selected-day-list">
      <h2 className="text-base font-semibold">Дела на день</h2>

      {error && <p role="alert">{error}</p>}

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">На этот день ничего не запланировано</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task) => {
            const area = task.areaId ? areasById[task.areaId] : undefined;
            return (
              <li key={task.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Выполнено: ${task.title}`}
                  checked={task.status === 'completed'}
                  onChange={() => handleToggleCompleted(task)}
                />
                <span className="w-14 shrink-0 text-sm text-muted-foreground">{timeMarker(task)}</span>
                <span className={task.status === 'completed' ? 'flex-1 line-through opacity-60' : 'flex-1'}>
                  {task.title}
                </span>
                {area && (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: area.color }}
                    />
                    <span className="text-sm text-muted-foreground">{area.name}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
