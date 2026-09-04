'use client';

import { useMemo, useState } from 'react';
import { useQuery, usePowerSync } from '@powersync/react';
import type { CommonPowerSyncDatabase } from '@powersync/web';
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
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Привычки</h2>

      {error && <p role="alert">{error}</p>}

      {!isCreating && (
        <button type="button" onClick={() => setIsCreating(true)}>
          <span aria-hidden="true">+ </span>
          Новая привычка
        </button>
      )}

      {isCreating && (
        <HabitForm userId={userId} onSaved={() => setIsCreating(false)} onCancel={() => setIsCreating(false)} />
      )}

      {todaysHabits.length === 0 && !isCreating && (
        <p className="text-muted-foreground">На сегодня привычек не запланировано</p>
      )}

      <ul className="space-y-1">
        {todaysHabits.map((stat) => {
          if (editingHabitId === stat.habit.id) {
            return (
              <li key={stat.habit.id}>
                <HabitForm
                  userId={userId}
                  habit={stat.habit}
                  onSaved={() => setEditingHabitId(null)}
                  onCancel={() => setEditingHabitId(null)}
                />
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
