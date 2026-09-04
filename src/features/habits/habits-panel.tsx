'use client';

import { useMemo, useState } from 'react';
import { useQuery, usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
import { Plus, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useHabits, type HabitStats } from './use-habits';
import { setHabitCompletion } from './habit-repository';
import { HabitCard } from './habit-card';
import { HabitForm } from './habit-form';

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
  const { todaysHabits } = useHabits(userId, today);
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
    </div>
  );
}
