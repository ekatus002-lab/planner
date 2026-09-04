'use client';

import { useMemo, useState } from 'react';
import { useQuery, usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { Flame, Plus, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useHabits, type HabitStats } from './use-habits';
import { setHabitCompletion } from './habit-repository';
import { HabitCard } from './habit-card';
import { HabitForm } from './habit-form';

// A small ring drawn from two stacked SVG circles (track + progress arc) -
// no charting library is in this project's dependencies, and a single
// static percentage doesn't warrant adding one.
function CompletionRing({ percent }: { percent: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);

  return (
    <svg width="52" height="52" viewBox="0 0 48 48" className="-rotate-90" aria-hidden="true">
      <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="5" className="stroke-muted" />
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="stroke-primary transition-[stroke-dashoffset]"
      />
    </svg>
  );
}

type Props = {
  userId: string;
  /** The local calendar date ("today") the panel is showing, `YYYY-MM-DD`. */
  today: string;
};

type AreaColorRow = { id: string; color: string };

// Mirrors `BacklogPanel`'s `useAreaColorById`: resolves a habit's area color
// swatch, including archived areas (a habit already assigned to an archived
// area must keep rendering its color).
function useAreaColorById(userId: string): Record<string, string> {
  const { data } = useQuery<AreaColorRow>('SELECT id, color FROM areas WHERE user_id = ?', [userId]);
  return useMemo(() => Object.fromEntries(data.map((area) => [area.id, area.color])), [data]);
}

export function HabitsPanel({ userId, today }: Props) {
  const db = usePowerSync() as CommonPowerSyncDatabase | null;
  const { habits, todaysHabits, bestCurrentStreak, weekSummary } = useHabits(userId, today);
  const areaColorById = useAreaColorById(userId);

  const [isCreating, setIsCreating] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggleCompletion(stat: HabitStats, completed: boolean, value?: number | null) {
    if (!db) {
      setError('Не удалось обновить привычку');
      return;
    }
    try {
      await setHabitCompletion(db, userId, stat.habit.id, today, completed, value ?? null);
      setError(null);
    } catch {
      setError('Не удалось обновить привычку');
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          <Repeat className="size-4 text-muted-foreground" aria-hidden="true" />
          Привычки
        </h2>

        {!isCreating && (
          <Button type="button" size="sm" variant="outline" onClick={() => setIsCreating(true)}>
            <Plus aria-hidden="true" />
            Новая привычка
          </Button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {habits.length > 0 && !isCreating && (
        <Card size="sm" className="flex-row items-center gap-3 bg-accent">
          <CardContent className="flex flex-1 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Flame className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-accent-foreground">
                streak <span className="tabular-nums">{bestCurrentStreak}</span>
              </p>
              <p className="text-xs text-muted-foreground">дней подряд</p>
            </div>
          </CardContent>
        </Card>
      )}

      {isCreating && (
        <Card size="sm">
          <CardContent>
            <HabitForm userId={userId} onSaved={() => setIsCreating(false)} onCancel={() => setIsCreating(false)} />
          </CardContent>
        </Card>
      )}

      {todaysHabits.length === 0 && !isCreating && (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          На сегодня привычек не запланировано
        </p>
      )}

      <ul className="space-y-2">
        {todaysHabits.map((stat) => {
          if (editingHabitId === stat.habit.id) {
            return (
              <li key={stat.habit.id}>
                <Card size="sm">
                  <CardContent>
                    <HabitForm
                      userId={userId}
                      habit={stat.habit}
                      onSaved={() => setEditingHabitId(null)}
                      onCancel={() => setEditingHabitId(null)}
                    />
                  </CardContent>
                </Card>
              </li>
            );
          }

          const color = stat.habit.areaId ? areaColorById[stat.habit.areaId] : undefined;

          return (
            <HabitCard
              key={stat.habit.id}
              stat={stat}
              areaColor={color}
              onToggleCompletion={(completed, value) => handleToggleCompletion(stat, completed, value)}
              onEdit={() => setEditingHabitId(stat.habit.id)}
            />
          );
        })}
      </ul>

      {habits.length > 0 && !isCreating && (
        <Card size="sm">
          <CardContent className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Выполнено привычек</p>
              <p className="text-2xl font-semibold tabular-nums">{weekSummary.rate}%</p>
              <p className="text-xs text-muted-foreground">
                {weekSummary.completed} из {weekSummary.expected} за эту неделю
              </p>
            </div>
            <CompletionRing percent={weekSummary.rate} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
