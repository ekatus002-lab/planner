'use client';

import type { GoalWithProgress } from './use-goals';

type Props = {
  item: GoalWithProgress;
  areaColor?: string;
  onEdit?: () => void;
};

// A single goal's card: area color, title, date range, progress bar, the
// displayed percentage (per its progress_mode), and a compact explanation of
// what that percentage is made of, e.g. "Задачи 4/6 • Привычки 82%".
export function GoalCard({ item, areaColor, onEdit }: Props) {
  const { goal, progress, linkedTaskCount, completedLinkedTaskCount } = item;

  const sourceParts: string[] = [];
  if (linkedTaskCount > 0) {
    sourceParts.push(`Задачи ${completedLinkedTaskCount}/${linkedTaskCount}`);
  }
  if (progress.habitRate !== null) {
    sourceParts.push(`Привычки ${progress.habitRate}%`);
  }

  return (
    <li className="space-y-1 rounded border p-2">
      <div className="flex items-center gap-2">
        {areaColor && (
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: areaColor }}
          />
        )}
        <button type="button" onClick={onEdit} className="flex-1 text-left font-medium">
          {goal.title}
        </button>
        <span aria-label={`Прогресс: ${goal.title}`}>{progress.displayed}%</span>
      </div>
      <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded bg-muted">
        <div className="h-1 rounded bg-primary" style={{ width: `${progress.displayed}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {goal.startDate} – {goal.endDate}
        {sourceParts.length > 0 ? ` • ${sourceParts.join(' • ')}` : ''}
      </p>
    </li>
  );
}
