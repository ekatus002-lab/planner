import type { ToolbarProps, View } from 'react-big-calendar';
import type { PlannerCalendarEvent } from './calendar-types';

// react-big-calendar's default toolbar renders icon-only prev/next buttons
// and locale-dependent view labels, neither of which gives stable
// `getByRole('button', { name })` targets. This custom toolbar replaces it
// with the exact labels the Slice B plan requires ("Today", "Month",
// "Week", "Day") plus plain-text navigation arrows.
const VIEW_LABELS: Partial<Record<View, string>> = {
  month: 'Month',
  week: 'Week',
  day: 'Day',
};

export function DateNavigation({ view, views, label, onNavigate, onView }: ToolbarProps<PlannerCalendarEvent>) {
  const viewList = Array.isArray(views) ? views : (Object.keys(views) as View[]);

  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2" role="toolbar" aria-label="Навигация по календарю">
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Назад" onClick={() => onNavigate('PREV')}>
          {'←'}
        </button>
        <button type="button" onClick={() => onNavigate('TODAY')}>
          Today
        </button>
        <button type="button" aria-label="Вперёд" onClick={() => onNavigate('NEXT')}>
          {'→'}
        </button>
      </div>
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-1">
        {viewList.map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)}>
            {VIEW_LABELS[v] ?? v}
          </button>
        ))}
      </div>
    </div>
  );
}
