'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

// A drag only "activates" (and dnd-kit only then starts suppressing the
// resulting native `click` - see dnd-kit's `AbstractPointerSensor.handleStart`)
// once the pointer has moved this many pixels. Without this constraint,
// *every* pointerdown on a draggable - including a plain click with zero
// movement - would immediately activate and swallow the click, breaking
// "click a calendar event to edit it" and "click a Backlog row to edit it"
// alike.
const ACTIVATION_DISTANCE_PX = 8;

// Shared drag-payload identity for every cross-panel gesture this slice
// supports. Backlog rows carry `BacklogTaskDragPayload`; calendar event
// pills (Task 5's move gesture, and Task 4's "drag back to Backlog" gesture)
// carry `ScheduledEventDragPayload`. Both are plain, serializable data - the
// scheduling decision itself always happens in `resolvePlannerDrop` below,
// never inside a component's drag handler, so it stays independently
// testable without simulating real pointer geometry in jsdom.
export type BacklogTaskDragPayload = { type: 'task'; source: 'backlog'; taskId: string };
export type ScheduledEventDragPayload = { type: 'scheduled-event'; taskId: string; durationMs: number };
export type PlannerDragPayload = BacklogTaskDragPayload | ScheduledEventDragPayload;

export type CalendarSlotDropPayload = {
  type: 'calendar-slot';
  /** Local "yyyy-MM-dd" day this cell/slot belongs to. */
  date: string;
  /** Present only for a timed (week/day time-grid) slot - a UTC instant. */
  startAt?: string;
};
export type BacklogDropPayload = { type: 'backlog' };
export type PlannerDropPayload = CalendarSlotDropPayload | BacklogDropPayload;

export type ScheduleFromBacklogSlot = { date: string; startAt?: string; endAt?: string };

// A backlog task dropped onto a bare timed slot (a single instant, no
// explicit end) gets this default duration - matches the plan's Task 4
// Step 5 requirement.
export const DEFAULT_TIMED_DROP_DURATION_MS = 60 * 60 * 1000;

export type PlannerDndHandlers = {
  onScheduleFromBacklog: (taskId: string, slot: ScheduleFromBacklogSlot) => void | Promise<void>;
  onUnschedule: (taskId: string) => void | Promise<void>;
  onMoveScheduledTask: (taskId: string, startAt: string, endAt: string) => void | Promise<void>;
};

// Pure decision logic for one cross-panel drag-end gesture. Intentionally
// takes only the plain `active`/`over` identity data dnd-kit reports -
// never the live DOM/pointer state - so it can be exercised directly with
// constructed payloads (see `backlog-calendar-dnd.test.tsx`) instead of
// simulating real pointer geometry, which react-big-calendar's rendered DOM
// does not reproduce meaningfully under jsdom.
//
// Backlog-internal reorder drags (both `active` and `over` are
// `BacklogTaskDragPayload`s) are deliberately ignored here -
// `backlog-panel.tsx` handles those itself via `useDndMonitor`, using the
// live-ordered task list this function has no access to.
export async function resolvePlannerDrop(
  event: { active: { data: { current?: unknown } }; over: { data: { current?: unknown } } | null },
  handlers: PlannerDndHandlers,
): Promise<void> {
  const { active, over } = event;
  if (!over) return;

  const activeData = active.data.current as PlannerDragPayload | undefined;
  const overData = over.data.current as PlannerDropPayload | undefined;
  if (!activeData || !overData) return;

  if (activeData.type === 'task') {
    if (overData.type !== 'calendar-slot') return;
    if (overData.startAt) {
      const endAt = new Date(new Date(overData.startAt).getTime() + DEFAULT_TIMED_DROP_DURATION_MS).toISOString();
      await handlers.onScheduleFromBacklog(activeData.taskId, {
        date: overData.date,
        startAt: overData.startAt,
        endAt,
      });
    } else {
      await handlers.onScheduleFromBacklog(activeData.taskId, { date: overData.date });
    }
    return;
  }

  if (activeData.type === 'scheduled-event') {
    if (overData.type === 'backlog') {
      await handlers.onUnschedule(activeData.taskId);
      return;
    }
    if (overData.type === 'calendar-slot' && overData.startAt) {
      const newStart = overData.startAt;
      const newEnd = new Date(new Date(newStart).getTime() + activeData.durationMs).toISOString();
      await handlers.onMoveScheduledTask(activeData.taskId, newStart, newEnd);
    }
  }
}

type PlannerDndState = {
  /** The task id currently being dragged, or null - drives visual feedback
   * (e.g. "Переместить в Backlog" on the Backlog drop zone) without every
   * consumer re-deriving it from raw dnd-kit state. */
  activeTaskId: string | null;
  /** True while a *scheduled* event (not a fresh Backlog row) is being
   * dragged - the only case where the Backlog panel should present itself
   * as an unschedule target. */
  isDraggingScheduledEvent: boolean;
};

const PlannerDndStateContext = createContext<PlannerDndState>({
  activeTaskId: null,
  isDraggingScheduledEvent: false,
});

export function usePlannerDndState(): PlannerDndState {
  return useContext(PlannerDndStateContext);
}

type Props = PlannerDndHandlers & { children: ReactNode };

// Wraps the shared ancestor of Backlog and the calendar (see
// `app-shell.tsx`) in a single dnd-kit `DndContext`, so a drag started in
// one panel can be recognized as `over` a droppable rendered by the other -
// dnd-kit correlates `active`/`over` only within one `DndContext` instance.
export function PlannerDndContext({ children, onScheduleFromBacklog, onUnschedule, onMoveScheduledTask }: Props) {
  const [dragState, setDragState] = useState<PlannerDndState>({
    activeTaskId: null,
    isDraggingScheduledEvent: false,
  });
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: ACTIVATION_DISTANCE_PX } }),
  );

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as PlannerDragPayload | undefined;
    setDragState({
      activeTaskId: data ? data.taskId : null,
      isDraggingScheduledEvent: data?.type === 'scheduled-event',
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDragState({ activeTaskId: null, isDraggingScheduledEvent: false });
    try {
      await resolvePlannerDrop(event, { onScheduleFromBacklog, onUnschedule, onMoveScheduledTask });
      setError(null);
    } catch {
      setError('Не удалось переместить задачу');
    }
  }

  function handleDragCancel() {
    setDragState({ activeTaskId: null, isDraggingScheduledEvent: false });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <PlannerDndStateContext.Provider value={dragState}>
        {error && <p role="alert">{error}</p>}
        {children}
      </PlannerDndStateContext.Provider>
    </DndContext>
  );
}
