'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType, type HTMLAttributes } from 'react';
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  type View as RbcView,
} from 'react-big-calendar';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { useQuery } from '@powersync/react';
import { TaskForm } from '@/features/tasks/task-form';
import { tasksToCalendarEvents } from './calendar-adapter';
import { useCalendarTasks } from './use-calendar-tasks';
import { DateNavigation } from './date-navigation';
import { CalendarEventItem } from './calendar-event';
import { DraggableEventWrapper, DroppableDateCell, DroppableTimeSlot, SelectDateProvider } from './calendar-drop-targets';
import { SelectedDayList } from './selected-day-list';
import type { CalendarView, PlannerCalendarEvent } from './calendar-types';

import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = { ru };

const localizer = dateFnsLocalizer({
  format,
  startOfWeek: (date: Date) => startOfWeek(date, { locale: ru, weekStartsOn: 1 }),
  getDay,
  locales,
});

// Per the Slice B plan, the toolbar exposes exactly these views/labels
// (see `date-navigation.tsx`) - no work_week/agenda.
const CALENDAR_VIEWS: CalendarView[] = ['month', 'week', 'day'];

const TOOLBAR_MESSAGES = {
  today: 'Today',
  month: 'Month',
  week: 'Week',
  day: 'Day',
};

// Two-letter Russian weekday abbreviations (пн, вт, ...) in place of
// react-big-calendar's default 3-letter ones ('ccc'/'eee' -> "cccccc"/"eeeeee",
// date-fns' "short" weekday width) for the month grid's header row and the
// week/day view's per-column day headers.
const CALENDAR_FORMATS = {
  weekdayFormat: 'cccccc',
  dayFormat: 'dd eeeeee',
};

// The watched task range padded to full display weeks, so tasks rendered in
// a month view's leading/trailing days from adjacent months are still
// fetched. Always computed in the browser's local timezone, matching
// `scheduled_date`'s own local-day semantics (see `scheduling.ts`).
function computeVisibleRange(view: CalendarView, date: Date): { start: Date; end: Date } {
  if (view === 'month') {
    return {
      start: startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
      end: addDays(endOfWeek(endOfMonth(date), { weekStartsOn: 1 }), 1),
    };
  }
  if (view === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    return { start, end: addDays(start, 7) };
  }
  const start = startOfDay(date);
  return { start, end: addDays(start, 1) };
}

type AreaColorRow = { id: string; color: string };

// Mirrors `backlog-panel.tsx`'s own `useAreaColorById`: resolves area colors
// including *archived* areas, so a task's calendar event keeps its
// originally-assigned area color even after that area is archived.
function useAreaColorById(userId: string): Record<string, string> {
  const { data } = useQuery<AreaColorRow>('SELECT id, color FROM areas WHERE user_id = ?', [userId]);
  return useMemo(() => Object.fromEntries(data.map((area) => [area.id, area.color])), [data]);
}

type Props = { userId: string };

export function CalendarBoard({ userId }: Props) {
  const [view, setView] = useState<CalendarView>('month');
  const [date, setDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [editingEvent, setEditingEvent] = useState<PlannerCalendarEvent | null>(null);

  const { start, end } = useMemo(() => computeVisibleRange(view, date), [view, date]);
  const rangeStart = useMemo(() => format(start, 'yyyy-MM-dd'), [start]);
  const rangeEndExclusive = useMemo(() => format(end, 'yyyy-MM-dd'), [end]);

  const { tasks } = useCalendarTasks(userId, rangeStart, rangeEndExclusive);
  const areaColorById = useAreaColorById(userId);
  const events = useMemo(() => tasksToCalendarEvents(tasks, areaColorById), [tasks, areaColorById]);

  // `elementProps` is typed as `React.HTMLAttributes<HTMLElement>`, which
  // has no index signature for arbitrary `data-*` attributes when assigned
  // as an object literal - going through a pre-typed `const` (rather than an
  // inline literal) sidesteps TypeScript's excess-property check for
  // exactly this one, deliberate case.
  const calendarElementProps: HTMLAttributes<HTMLElement> = {
    'data-testid': 'planner-calendar',
    'data-view': view,
  } as HTMLAttributes<HTMLElement>;

  // The week view's time grid (7 day columns + a time gutter) has no room to
  // breathe on a narrow phone screen - shrinking each column to fit leaves
  // times/events unreadable. `rbc-week-scroll` (see globals.css) forces each
  // column to a comfortable minimum width below `md` and makes `.rbc-time-view`
  // itself (not this component, and not the toolbar above it) the scrolling
  // element - so the Month/Week/Day toolbar, which is a sibling of
  // `.rbc-time-view` inside react-big-calendar's own root, never scrolls
  // with it, and the time-of-day gutter can be pinned to the scroll edge via
  // `position: sticky`. Month/day views are unaffected: the class only
  // targets `.rbc-time-view`, which month view doesn't render.
  const calendarClassName = view === 'week' ? 'rbc-week-scroll' : undefined;

  const calendarContainerRef = useRef<HTMLDivElement>(null);

  // `.rbc-time-gutter` (the hour-labels column) sits inside `.rbc-time-content`,
  // which has its own `overflow-y: auto` for vertical scrolling - CSS
  // `position: sticky` can only pin an element relative to its *nearest*
  // scrolling ancestor, so the gutter's `left: 0` sticky (see globals.css)
  // resolves against `.rbc-time-content` - which never scrolls
  // horizontally itself - rather than `.rbc-time-view` two levels up, which
  // actually owns the horizontal scroll, and so has no visible effect; the
  // gutter still slides out of view with the rest of the grid.
  // `.rbc-time-header-gutter` (the empty corner above it, aligned with the
  // day-of-week header) has no such intermediate scrolling ancestor, so its
  // own sticky positioning already works with plain CSS.
  // Pin the content gutter with a scroll-driven transform instead: as
  // `.rbc-time-view` scrolls right by `scrollLeft`, the gutter (a normal-flow
  // descendant of that scrolled ancestor) naturally moves left by that same
  // amount - translating it back by `+scrollLeft` cancels that out, keeping
  // it visually fixed without disturbing its own independent vertical scroll.
  useEffect(() => {
    if (view !== 'week') return;
    const root = calendarContainerRef.current;
    if (!root) return;
    const timeView = root.querySelector<HTMLElement>('.rbc-time-view');
    if (!timeView) return;

    function syncGutterPosition() {
      const gutter = root!.querySelector<HTMLElement>('.rbc-time-gutter');
      if (gutter) {
        gutter.style.transform = timeView!.scrollLeft ? `translateX(${timeView!.scrollLeft}px)` : '';
      }
    }

    timeView.addEventListener('scroll', syncGutterPosition);
    syncGutterPosition();
    return () => {
      timeView.removeEventListener('scroll', syncGutterPosition);
    };
  }, [view]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div ref={calendarContainerRef} className="min-h-0 min-w-0 flex-1">
        <SelectDateProvider value={setSelectedDate}>
          <BigCalendar
            localizer={localizer}
            culture="ru"
            events={events}
            view={view}
            date={date}
            views={CALENDAR_VIEWS}
            onView={(nextView: RbcView) => setView(nextView as CalendarView)}
            onNavigate={(nextDate: Date) => setDate(nextDate)}
            onSelectEvent={(event) => {
              setEditingEvent(event);
              setSelectedDate(event.start);
            }}
            messages={TOOLBAR_MESSAGES}
            formats={CALENDAR_FORMATS}
            className={calendarClassName}
            components={{
              toolbar: DateNavigation,
              event: CalendarEventItem,
              eventWrapper: DraggableEventWrapper,
              dateCellWrapper: DroppableDateCell,
              // See `TimeSlotWrapperProps`'s own comment in
              // `calendar-drop-targets.tsx` for why this cast is needed:
              // `@types/react-big-calendar` types `timeSlotWrapper` as a bare
              // `React.ComponentType` even though it always receives
              // `{ value, resource, children }` at runtime.
              timeSlotWrapper: DroppableTimeSlot as unknown as ComponentType,
            }}
            eventPropGetter={(event: PlannerCalendarEvent) => ({
              style: {
                backgroundColor: event.areaColor,
                opacity: event.task.status === 'completed' ? 0.6 : 1,
              },
            })}
            style={{ height: '100%' }}
            elementProps={calendarElementProps}
          />
        </SelectDateProvider>
      </div>

      {editingEvent && (
        <div role="dialog" aria-label="Редактировать задачу" className="border-t p-3">
          <TaskForm
            userId={userId}
            task={editingEvent.task}
            showScheduling
            onSaved={() => setEditingEvent(null)}
            onCancel={() => setEditingEvent(null)}
          />
        </div>
      )}

      <div className="max-h-[40%] shrink-0 overflow-y-auto border-t pt-3">
        <SelectedDayList userId={userId} date={format(selectedDate, 'yyyy-MM-dd')} />
      </div>
    </div>
  );
}
