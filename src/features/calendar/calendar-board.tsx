'use client';

import { useMemo, useState, type HTMLAttributes } from 'react';
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

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1">
        <BigCalendar
          localizer={localizer}
          culture="ru"
          events={events}
          view={view}
          date={date}
          views={CALENDAR_VIEWS}
          onView={(nextView: RbcView) => setView(nextView as CalendarView)}
          onNavigate={(nextDate: Date) => setDate(nextDate)}
          onSelectEvent={(event) => setEditingEvent(event)}
          messages={TOOLBAR_MESSAGES}
          components={{ toolbar: DateNavigation, event: CalendarEventItem }}
          eventPropGetter={(event: PlannerCalendarEvent) => ({
            style: {
              backgroundColor: event.areaColor,
              opacity: event.task.status === 'completed' ? 0.6 : 1,
            },
          })}
          style={{ height: '100%' }}
          elementProps={calendarElementProps}
        />
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
    </div>
  );
}
