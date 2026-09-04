'use client';

import { useState } from 'react';
import { BookOpen, Brain, Dumbbell, Droplet, Flame, Footprints, Moon, Pill, Repeat } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { IsoWeekday } from './habit-types';
import type { HabitStats } from './use-habits';

type Props = {
  stat: HabitStats;
  areaColor?: string;
  onToggleCompletion: (completed: boolean, value?: number | null) => Promise<void> | void;
  onEdit?: () => void;
};

// A small purely-cosmetic keyword match, `title` -> icon category: there is
// no `icon` field on `Habit` (adding one is a real feature - a picker UI, a
// migration - not something this display-only card should invent), so this
// just makes the common cases from the app's own seed/example data
// (vitamins, water, reading, exercise, sleep, meditation) look intentional
// instead of every habit rendering the same generic mark.
type HabitIconCategory = 'pill' | 'droplet' | 'book' | 'footprints' | 'moon' | 'brain' | 'dumbbell' | 'default';

const TITLE_ICON_RULES: { keywords: string[]; category: HabitIconCategory }[] = [
  { keywords: ['витамин', 'таблет', 'лекарств'], category: 'pill' },
  { keywords: ['вода', 'пить', 'гидра'], category: 'droplet' },
  { keywords: ['книг', 'читат', 'чтени', 'английск', 'язык', 'учеб'], category: 'book' },
  { keywords: ['шаг', 'бег', 'пробеж', 'трениров', 'спорт', 'зал', 'фитнес'], category: 'footprints' },
  { keywords: ['сон', 'спать', 'высыпат'], category: 'moon' },
  { keywords: ['медита', 'дыхан', 'осознан'], category: 'brain' },
  { keywords: ['растяж', 'зарядк', 'йога'], category: 'dumbbell' },
];

function pickHabitIconCategory(title: string): HabitIconCategory {
  const normalized = title.toLowerCase();
  for (const rule of TITLE_ICON_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) return rule.category;
  }
  return 'default';
}

// Renders one of a fixed set of statically-referenced icons by category -
// deliberately not "look up a component reference and render `<Icon/>`",
// since selecting *which component* to render from a variable computed
// during render defeats static analysis of component identity.
function HabitIcon({ category, className }: { category: HabitIconCategory; className?: string }) {
  switch (category) {
    case 'pill':
      return <Pill className={className} />;
    case 'droplet':
      return <Droplet className={className} />;
    case 'book':
      return <BookOpen className={className} />;
    case 'footprints':
      return <Footprints className={className} />;
    case 'moon':
      return <Moon className={className} />;
    case 'brain':
      return <Brain className={className} />;
    case 'dumbbell':
      return <Dumbbell className={className} />;
    default:
      return <Repeat className={className} />;
  }
}

const WEEKDAY_ABBREVIATIONS: Record<IsoWeekday, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Вс',
};

// A short human description of when a habit is due, shown as the card's
// subtitle under its title - mirrors how often/how-much language reads in
// the reference design ("Каждый день", "30 мин в день").
function describeSchedule(habit: HabitStats['habit']): string {
  if (habit.targetValue !== null) {
    return `${habit.targetValue}${habit.targetUnit ? ` ${habit.targetUnit}` : ''} в день`;
  }
  const days = habit.weekdays;
  if (days.length === 7) return 'Каждый день';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d as IsoWeekday))) return 'По будням';
  if (days.length === 2 && [6, 7].every((d) => days.includes(d as IsoWeekday))) return 'По выходным';
  return days.map((d) => WEEKDAY_ABBREVIATIONS[d]).join(', ');
}

// A single habit's daily card: category-colored icon, title/schedule,
// today's checkbox/quantitative value, and current streak. Best streak and
// week-rate are still available on `stat` (and covered by the panel-level
// weekly summary card) but aren't repeated per-card - showing all three
// alongside an icon, title, and checkbox left no room to breathe and
// overflowed the card on any but the widest habit names. Completing it
// writes through `onToggleCompletion` immediately - the caller
// (`HabitsPanel`) persists locally and the card re-renders from the watched
// query, never from local optimistic state.
export function HabitCard({ stat, areaColor, onToggleCompletion, onEdit }: Props) {
  const { habit, todayCompletion, currentStreak } = stat;
  const [value, setValue] = useState(todayCompletion?.value?.toString() ?? '');

  const isCompleted = todayCompletion?.completed ?? false;
  const iconCategory = pickHabitIconCategory(habit.title);
  const tintColor = areaColor ?? 'var(--primary)';

  async function handleToggle() {
    const parsedValue = habit.targetValue !== null && value.trim() !== '' ? Number(value) : null;
    await onToggleCompletion(!isCompleted, parsedValue);
  }

  return (
    <li>
      <Card
        size="sm"
        className={cn(
          'flex-row items-center gap-3 px-3 py-2.5 transition-colors',
          isCompleted && 'bg-primary/5 ring-primary/25',
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `color-mix(in oklch, ${tintColor}, transparent 85%)`, color: tintColor }}
        >
          <HabitIcon category={iconCategory} className="size-5" />
        </span>

        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <span
            className={cn(
              'block truncate text-sm font-medium hover:underline',
              isCompleted && 'text-muted-foreground line-through',
            )}
          >
            {habit.title}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="truncate">{describeSchedule(habit)}</span>
            <span
              aria-label={`Текущая серия: ${habit.title}`}
              className="inline-flex shrink-0 items-center gap-0.5 tabular-nums before:mr-1 before:content-['•']"
            >
              <Flame className="size-3" aria-hidden="true" />
              Серия {currentStreak}
            </span>
          </span>
        </button>

        {habit.targetValue !== null && (
          <Input
            type="number"
            aria-label={`Значение: ${habit.title}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-7 w-14 shrink-0 px-1.5 text-right text-xs"
          />
        )}

        <Checkbox
          aria-label={`Выполнено сегодня: ${habit.title}`}
          checked={isCompleted}
          onCheckedChange={handleToggle}
          className="size-7 shrink-0 rounded-full [&_svg]:size-4"
        />
      </Card>
    </li>
  );
}
