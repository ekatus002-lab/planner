import type { EventProps } from 'react-big-calendar';
import type { PlannerCalendarEvent } from './calendar-types';

// Renders one calendar cell's event content. Color coding by area happens
// via `eventPropGetter` in `calendar-board.tsx` (it needs to set the whole
// cell's background, which this inner component can't reach); this
// component only owns the completed-task treatment (line-through, reduced
// opacity) and the "day task" marker for date-only tasks that have no time
// to be positioned at but still render in the all-day row.
export function CalendarEventItem({ event }: EventProps<PlannerCalendarEvent>) {
  const isCompleted = event.task.status === 'completed';
  const isDateOnly = event.allDay && !event.task.allDay;

  return (
    <span className={isCompleted ? 'line-through opacity-60' : undefined}>
      {isDateOnly && <span aria-hidden="true">{'\u{1F4CC} '}</span>}
      {event.title}
    </span>
  );
}
