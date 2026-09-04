'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { GoalWithProgress } from './use-goals';

type Props = {
  item: GoalWithProgress;
  areaColor?: string;
  onEdit?: () => void;
};

// Renders the goal's date range as "start – end" when both are set, just
// the one date that is set when only one is, or "" when neither is - an
// open-ended goal simply has no date range text to show.
function dateRangeText(startDate: string | null, endDate: string | null): string {
  if (startDate && endDate) return `${startDate} – ${endDate}`;
  return startDate ?? endDate ?? '';
}

// A single goal's card: area color, title, date range, progress bar, the
// displayed percentage (per its progress_mode), and a compact explanation of
// what that percentage is made of, e.g. "Задачи 4/6 • Привычки 82%".
//
// Built on the shared `Card`/`Progress` primitives so it matches the rest of
// the app's theme (light/dark via CSS variables) instead of hand-rolled
// colors. The percentage span keeps its own `aria-label`/text content
// exactly as before (tests read progress off it); the visual `Progress` bar
// underneath is purely decorative (`aria-hidden`) to avoid announcing the
// same value twice.
export function GoalCard({ item, areaColor, onEdit }: Props) {
  const { goal, progress, linkedTaskCount, completedLinkedTaskCount } = item;

  const sourceParts: string[] = [];
  if (linkedTaskCount > 0) {
    sourceParts.push(`Задачи ${completedLinkedTaskCount}/${linkedTaskCount}`);
  }
  if (progress.habitRate !== null) {
    sourceParts.push(`Привычки ${progress.habitRate}%`);
  }

  const dateText = dateRangeText(goal.startDate, goal.endDate);
  const sourceText = sourceParts.join(' • ');
  const detailText = dateText && sourceText ? `${dateText} • ${sourceText}` : dateText || sourceText;

  return (
    <li>
      <Card size="sm" className="gap-2 transition-colors hover:ring-foreground/20">
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            {areaColor && (
              <span
                aria-hidden="true"
                className="inline-block size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: areaColor }}
              />
            )}
            <button
              type="button"
              onClick={onEdit}
              className="min-w-0 flex-1 truncate rounded-sm text-left text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {goal.title}
            </button>
            <span
              aria-label={`Прогресс: ${goal.title}`}
              className="shrink-0 text-xs font-semibold tabular-nums text-foreground"
            >
              {progress.displayed}%
            </span>
          </div>

          <Progress value={progress.displayed} aria-hidden="true" />

          <p className="text-xs text-muted-foreground">{detailText}</p>
        </CardContent>
      </Card>
    </li>
  );
}
