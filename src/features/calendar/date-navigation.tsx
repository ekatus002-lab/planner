import type { ToolbarProps, View } from 'react-big-calendar';
import { Button } from '@/components/ui/button';
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
        <Button type="button" variant="outline" size="icon-sm" aria-label="Назад" onClick={() => onNavigate('PREV')}>
          {'←'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onNavigate('TODAY')}>
          Today
        </Button>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Вперёд" onClick={() => onNavigate('NEXT')}>
          {'→'}
        </Button>
      </div>
      <span className="font-medium">{label}</span>
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5">
        {viewList.map((v) => (
          <Button
            key={v}
            type="button"
            variant={view === v ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={view === v}
            className="rounded-md"
            onClick={() => onView(v)}
          >
            {VIEW_LABELS[v] ?? v}
          </Button>
        ))}
      </div>
    </div>
  );
}
