'use client';

import { useMemo, useState } from 'react';
import { useQuery, usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { useDndMonitor, useDroppable } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  usePlannerDndState,
  type BacklogDropPayload,
  type BacklogTaskDragPayload,
} from '@/features/calendar/planner-dnd-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBacklogTasks } from './use-backlog-tasks';
import { deleteTask, reorderBacklogTasks, setTaskCompleted } from './task-repository';
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
  const { isDraggingScheduledEvent } = usePlannerDndState();

  const [isCreating, setIsCreating] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);

  // The whole panel is a drop target for a scheduled calendar event being
  // dragged back to Backlog (see `planner-dnd-context.tsx`'s
  // `resolvePlannerDrop`), independent of the per-row sortable drag below.
  const { setNodeRef: setDropZoneRef, isOver: isDropZoneOver } = useDroppable({
    id: 'backlog-dropzone',
    data: { type: 'backlog' } satisfies BacklogDropPayload,
  });

  // Backlog-internal reordering is handled here, via `useDndMonitor`,
  // rather than in the shared `resolvePlannerDrop` - that function has no
  // access to the *live*, currently-displayed task order this needs to
  // compute a new one from.
  useDndMonitor({
    onDragEnd(event) {
      if (!db) return;
      const activeData = event.active.data.current as BacklogTaskDragPayload | undefined;
      const overData = event.over?.data.current as BacklogTaskDragPayload | undefined;
      if (activeData?.type !== 'task' || activeData.source !== 'backlog') return;
      if (overData?.type !== 'task' || overData.source !== 'backlog') return;
      if (activeData.taskId === overData.taskId) return;

      const oldIndex = taskIds.indexOf(activeData.taskId);
      const newIndex = taskIds.indexOf(overData.taskId);
      if (oldIndex === -1 || newIndex === -1) return;

      reorderBacklogTasks(db, arrayMove(taskIds, oldIndex, newIndex)).catch(() => {
        setError('Не удалось изменить порядок задач');
      });
    },
  });

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
    <div ref={setDropZoneRef} className="space-y-3">
      <h2 className="text-base font-semibold">Backlog</h2>

      {error && <p role="alert">{error}</p>}

      {isDraggingScheduledEvent && (
        <div
          className={
            isDropZoneOver
              ? 'rounded border-2 border-dashed border-primary p-2 text-center text-sm'
              : 'rounded border-2 border-dashed p-2 text-center text-sm text-muted-foreground'
          }
        >
          Переместить в Backlog
        </div>
      )}

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
          showScheduling
          onSaved={() => setIsCreating(false)}
          onCancel={() => setIsCreating(false)}
        />
      )}

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1">
          {tasks.map((task) => {
            if (editingTaskId === task.id) {
              return (
                <li key={task.id}>
                  <TaskForm
                    userId={userId}
                    task={task}
                    showScheduling
                    onSaved={() => setEditingTaskId(null)}
                    onCancel={() => setEditingTaskId(null)}
                  />
                </li>
              );
            }

            const color = task.areaId ? areaColorById[task.areaId] : undefined;

            return (
              <BacklogTaskRow key={task.id} taskId={task.id} title={task.title}>
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
                    <DropdownMenuItem className="min-h-11" onClick={() => setEditingTaskId(task.id)}>
                      Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuItem className="min-h-11" variant="destructive" onClick={() => handleDelete(task)}>
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </BacklogTaskRow>
            );
          })}
        </ul>
      </SortableContext>
    </div>
  );
}

// One draggable/sortable Backlog row. Split out so `useSortable` (which must
// run per-item) doesn't have to be called conditionally inside the list's
// `.map()`. Purely a drag-identity wrapper - `BacklogPanel` still owns every
// row's actual content/behavior via `children`.
//
// dnd-kit's drag `listeners` are attached only to a dedicated grip handle,
// never to the whole `<li>`: spreading them onto the row itself would let
// the pointer-down handler intercept clicks meant for the checkbox/title/
// menu buttons nested inside it.
function BacklogTaskRow({
  taskId,
  title,
  children,
}: {
  taskId: string;
  title: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: taskId,
    data: { type: 'task', source: 'backlog', taskId } satisfies BacklogTaskDragPayload,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2">
      <span
        aria-label={`Перетащить: ${title}`}
        className="cursor-grab select-none"
        {...attributes}
        {...listeners}
      >
        {'⠿'}
      </span>
      {children}
    </li>
  );
}
