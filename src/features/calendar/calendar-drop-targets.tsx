'use client';

import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { DateCellWrapperProps, EventWrapperProps } from 'react-big-calendar';
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

// Wraps react-big-calendar's own rendered event cell (already carrying its
// click handler, color, and selection state - see `EventCell.js`) with a
// dnd-kit drag source, so an already-scheduled event can be dragged back to
// Backlog (Task 4) or onto a new slot to move it (Task 5). Completed tasks
// are not draggable (matches the plan's `draggableAccessor` requirement for
// Task 5, implemented here instead of via react-big-calendar's own DnD
// addon - see the Slice B report for why).
export function DraggableEventWrapper(props: EventWrapperProps<PlannerCalendarEvent> & { children?: ReactNode }) {
  const { event, children } = props;
  const durationMs = event.end.getTime() - event.start.getTime();

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `event-${event.taskId}`,
    data: { type: 'scheduled-event', taskId: event.taskId, durationMs } satisfies ScheduledEventDragPayload,
    disabled: event.task.status === 'completed',
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: isDragging ? 20 : undefined }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}
