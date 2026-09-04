'use client';

import { useMemo, useState } from 'react';
import { useQuery, usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBacklogTasks } from './use-backlog-tasks';
import { deleteTask, setTaskCompleted } from './task-repository';
import { TaskForm } from './task-form';
import type { Task } from './task-types';

type Props = { userId: string };

type AreaColorRow = { id: string; color: string };

// Resolves the color swatch for a task's area, including *archived* areas:
// `useAreas` (used by TaskForm's selector) deliberately excludes archived
// areas, but an already-assigned archived area must keep rendering on the
// task rows that reference it (see `setAreaArchived` in
// `area-repository.ts`). A dedicated, unfiltered watched query keeps that
// concern out of `useAreas`.
function useAreaColorById(userId: string): Record<string, string> {
  const { data } = useQuery<AreaColorRow>('SELECT id, color FROM areas WHERE user_id = ?', [userId]);
  return useMemo(() => Object.fromEntries(data.map((area) => [area.id, area.color])), [data]);
}

export function BacklogPanel({ userId }: Props) {
  const db = usePowerSync() as CommonPowerSyncDatabase | null;
  const { tasks } = useBacklogTasks(userId);
  const areaColorById = useAreaColorById(userId);

  const [isCreating, setIsCreating] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The checkbox/list below are entirely driven by `useBacklogTasks`'s
  // watched query, never by local optimistic state - so a rejected write
  // here simply leaves the task exactly as it was persisted (no stale
  // "looks completed"/"looks deleted" UI to roll back), and we only need to
  // surface the failure.
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

  async function handleDelete(task: Task) {
    if (!db) {
      setError('Не удалось удалить задачу');
      return;
    }
    try {
      await deleteTask(db, task.id);
      setError(null);
    } catch {
      setError('Не удалось удалить задачу');
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Backlog</h2>

      {error && <p role="alert">{error}</p>}

      {!isCreating && (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="flex min-h-11 w-full items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          <span aria-hidden="true">+ </span>
          Новая задача
        </button>
      )}

      {isCreating && (
        <TaskForm
          userId={userId}
          onSaved={() => setIsCreating(false)}
          onCancel={() => setIsCreating(false)}
        />
      )}

      <ul className="space-y-1">
        {tasks.map((task) => {
          if (editingTaskId === task.id) {
            return (
              <li key={task.id}>
                <TaskForm
                  userId={userId}
                  task={task}
                  onSaved={() => setEditingTaskId(null)}
                  onCancel={() => setEditingTaskId(null)}
                />
              </li>
            );
          }

          const color = task.areaId ? areaColorById[task.areaId] : undefined;

          return (
            <li key={task.id} className="flex items-center gap-1">
              <label className="flex h-11 w-11 shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  aria-label={`Выполнено: ${task.title}`}
                  checked={task.status === 'completed'}
                  onChange={() => handleToggleCompleted(task)}
                  className="size-5"
                />
              </label>
              <button
                type="button"
                onClick={() => setEditingTaskId(task.id)}
                className="min-h-11 flex-1 py-2 text-left"
              >
                {task.title}
              </button>
              {color && (
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`Меню: ${task.title}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-lg"
                >
                  ⋮
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" aria-label={`Действия: ${task.title}`}>
                  <DropdownMenuItem
                    className="min-h-11"
                    onClick={() => setEditingTaskId(task.id)}
                  >
                    Редактировать
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="min-h-11"
                    variant="destructive"
                    onClick={() => handleDelete(task)}
                  >
                    Удалить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
