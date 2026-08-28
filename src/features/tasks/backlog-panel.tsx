'use client';

import { useMemo, useState } from 'react';
import { useQuery, usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
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
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);
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
    setOpenMenuTaskId(null);
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
        <button type="button" onClick={() => setIsCreating(true)}>
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
            <li key={task.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={`Выполнено: ${task.title}`}
                checked={task.status === 'completed'}
                onChange={() => handleToggleCompleted(task)}
              />
              <button
                type="button"
                onClick={() => setEditingTaskId(task.id)}
                className="flex-1 text-left"
              >
                {task.title}
              </button>
              {color && (
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
              <div className="relative">
                <button
                  type="button"
                  aria-label={`Меню: ${task.title}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenuTaskId === task.id}
                  onClick={() => setOpenMenuTaskId((current) => (current === task.id ? null : task.id))}
                >
                  ⋮
                </button>
                {openMenuTaskId === task.id && (
                  <div role="menu" aria-label={`Действия: ${task.title}`}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuTaskId(null);
                        setEditingTaskId(task.id);
                      }}
                    >
                      Редактировать
                    </button>
                    <button type="button" role="menuitem" onClick={() => handleDelete(task)}>
                      Удалить
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
