'use client';

import { cloneElement, isValidElement, useRef, type CSSProperties, type PointerEvent, type ReactElement, type ReactNode } from 'react';
import { format } from 'date-fns';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import type { DateCellWrapperProps, EventWrapperProps } from 'react-big-calendar';
import { resizeScheduledTaskById } from '@/features/tasks/scheduling';
import type { CalendarSlotDropPayload, ScheduledEventDragPayload } from './planner-dnd-context';
import type { PlannerCalendarEvent } from './calendar-types';

// A month-view day cell as a dnd-kit drop target - a Backlog task dropped
// here becomes date-only (no specific time to position it at). Wraps
// react-big-calendar's own cell content unchanged; only adds the drop
// target and a highlight while something is dragged over it.
export function DroppableDateCell({ value, children }: DateCellWrapperProps) {
  const dateKey = format(value, 'yyyy-MM-dd');
  const { setNodeRef, isOver } = useDroppable({
    id: `date-cell-${dateKey}`,
    data: { type: 'calendar-slot', date: dateKey } satisfies CalendarSlotDropPayload,
  });

  return (
    <div ref={setNodeRef} className={isOver ? 'h-full bg-primary/10' : 'h-full'}>
      {children}
    </div>
  );
}

// react-big-calendar's `timeSlotWrapper` component is typed loosely
// (`React.ComponentType` with no declared props) in `@types/react-big-calendar`,
// but at runtime it always receives `{ value, resource, children }`
// (`TimeSlotGroup.js`) - declared here so this component stays fully typed
// internally; the mismatch is bridged with a single cast where it's wired
// into `Calendar`'s `components` prop in `calendar-board.tsx`.
export type TimeSlotWrapperProps = { value: Date; resource?: unknown; children?: ReactNode };

// A week/day time-grid slot as a dnd-kit drop target - carries the slot's
// exact instant, so a Backlog task dropped here becomes a timed task
// (`resolvePlannerDrop` fills in the default 60-minute duration).
export function DroppableTimeSlot({ value, children }: TimeSlotWrapperProps) {
  const startAt = value.toISOString();
  const { setNodeRef, isOver } = useDroppable({
    id: `time-slot-${startAt}`,
    data: { type: 'calendar-slot', date: format(value, 'yyyy-MM-dd'), startAt } satisfies CalendarSlotDropPayload,
  });

  return (
    <div ref={setNodeRef} className={isOver ? 'h-full bg-primary/10' : 'h-full'}>
      {children}
    </div>
  );
}

// One minute of duration change per this many vertical pixels dragged,
// snapped to the nearest 15 minutes so a resize always lands on a sensible
// boundary. Calibrated to (not pixel-identical with) react-big-calendar's
// default time-grid row height - real-world resize feel is verified in the
// browser/E2E, not asserted down to the pixel here.
const MINUTES_PER_PIXEL = 1 / 3;
const SNAP_MINUTES = 15;

// Pure duration-resize math, independently testable without simulating real
// pointer geometry: given the event's current start/end and a vertical
// pointer delta (positive = dragged down = longer), returns the new
// `end_at`, snapped to a 15-minute boundary and never allowed to reach or
// pass `start_at`.
export function computeResizedEndAt(startAt: string, endAt: string, deltaY: number): string {
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  const snappedDeltaMinutes = Math.round((deltaY * MINUTES_PER_PIXEL) / SNAP_MINUTES) * SNAP_MINUTES;
  const minEndMs = startMs + SNAP_MINUTES * 60 * 1000;
  const newEndMs = Math.max(endMs + snappedDeltaMinutes * 60 * 1000, minEndMs);
  return new Date(newEndMs).toISOString();
}

// A drag handle at the bottom edge of a timed event, resizing its duration
// via plain pointer events - deliberately *not* dnd-kit, so it doesn't
// compete with `DraggableEventWrapper`'s own dnd-kit drag source on the same
// element (`stopPropagation` below keeps a pointerdown here from also
// bubbling into that ancestor's drag-start tracking).
function EventResizeHandle({ taskId, startAt, endAt }: { taskId: string; startAt: string; endAt: string }) {
  const db = usePowerSync() as CommonPowerSyncDatabase | null;
  const startYRef = useRef<number | null>(null);

  function handlePointerDown(event: PointerEvent<HTMLSpanElement>) {
    event.stopPropagation();
    startYRef.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event: PointerEvent<HTMLSpanElement>) {
    event.stopPropagation();
    const startY = startYRef.current;
    startYRef.current = null;
    if (startY === null || !db) return;

    const deltaY = event.clientY - startY;
    if (deltaY === 0) return;
    void resizeScheduledTaskById(db, taskId, startAt, computeResizedEndAt(startAt, endAt, deltaY));
  }

  return (
    <span
      role="separator"
      aria-orientation="horizontal"
      aria-label="Изменить длительность"
      className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    />
  );
}

// Wraps react-big-calendar's own rendered event cell (already carrying its
// click handler, absolute position/size, and color - see `EventCell.js`)
// with a dnd-kit drag source, so an already-scheduled event can be dragged
// back to Backlog or onto a new slot to move it, and appends a resize
// handle for timed events. Uses `cloneElement` (merging dnd-kit's ref/style/
// listeners into the *actual* `.rbc-event` div) rather than introducing an
// extra wrapping element: the resize handle is positioned `absolute` against
// that div's own real height, which a plain non-positioned wrapper around it
// would not provide. Completed tasks are neither draggable nor resizable.
export function DraggableEventWrapper(props: EventWrapperProps<PlannerCalendarEvent> & { children?: ReactNode }) {
  const { event, children } = props;
  const durationMs = event.end.getTime() - event.start.getTime();
  const isCompleted = event.task.status === 'completed';
  const isResizable = !event.allDay && !isCompleted && Boolean(event.task.startAt) && Boolean(event.task.endAt);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `event-${event.taskId}`,
    data: { type: 'scheduled-event', taskId: event.taskId, durationMs } satisfies ScheduledEventDragPayload,
    disabled: isCompleted,
  });

  if (!isValidElement(children)) return children ?? null;

  const elementProps = children.props as { style?: CSSProperties; children?: ReactNode };
  const dragStyle: CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: isDragging ? 20 : undefined }
    : {};

  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    ref: setNodeRef,
    style: { ...elementProps.style, ...dragStyle },
    ...attributes,
    ...listeners,
    children: isResizable ? (
      <>
        {elementProps.children}
        <EventResizeHandle taskId={event.taskId} startAt={event.task.startAt!} endAt={event.task.endAt!} />
      </>
    ) : (
      elementProps.children
    ),
  });
}
