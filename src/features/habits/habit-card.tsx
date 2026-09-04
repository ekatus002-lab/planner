'use client';

import { useState } from 'react';
import { Flame, Trophy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { HabitStats } from './use-habits';

type Props = {
  stat: HabitStats;
  areaColor?: string;
  onToggleCompletion: (completed: boolean, value?: number | null) => Promise<void> | void;
  onEdit?: () => void;
};

// A single habit's daily card: category color, title, today's
// checkbox/quantitative value, current streak, and this week's completion
// rate. Completing it writes through `onToggleCompletion` immediately - the
// caller (`HabitsPanel`) persists locally and the card re-renders from the
// watched query, never from local optimistic state.
export function HabitCard({ stat, areaColor, onToggleCompletion, onEdit }: Props) {
  const { habit, todayCompletion, currentStreak, bestStreak, weekRate } = stat;
  const [value, setValue] = useState(todayCompletion?.value?.toString() ?? '');

  const isCompleted = todayCompletion?.completed ?? false;

  async function handleToggle() {
    const parsedValue = habit.targetValue !== null && value.trim() !== '' ? Number(value) : null;
    await onToggleCompletion(!isCompleted, parsedValue);
  }

  return (
    <li>
      <Card
        size="sm"
        className={cn(
          'flex-row items-center gap-2.5 px-3 py-2 transition-colors',
          isCompleted && 'bg-primary/5 ring-primary/25',
        )}
      >
        <Checkbox
          aria-label={`Выполнено сегодня: ${habit.title}`}
          checked={isCompleted}
          onCheckedChange={handleToggle}
          className="shrink-0"
        />

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
          className={cn(
            'min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline',
            isCompleted && 'text-muted-foreground line-through',
          )}
        >
          {habit.title}
        </button>

        <div className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
          <span
            aria-label={`Текущая серия: ${habit.title}`}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 font-medium text-foreground tabular-nums"
          >
            <Flame className="size-3" aria-hidden="true" />
            Серия {currentStreak}
          </span>
          <span
            aria-label={`Лучшая серия: ${habit.title}`}
            className="hidden items-center gap-1 tabular-nums sm:inline-flex"
          >
            <Trophy className="size-3" aria-hidden="true" />
            Рекорд {bestStreak}
          </span>
          <span aria-label={`Неделя: ${habit.title}`} className="tabular-nums">
            {weekRate}%
          </span>
        </div>

        {habit.targetValue !== null && (
          <Input
            type="number"
            aria-label={`Значение: ${habit.title}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-7 w-14 shrink-0 px-1.5 text-right text-xs"
          />
        )}
      </Card>
    </li>
  );
}
