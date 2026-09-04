'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { useGoals } from './use-goals';
import { GoalCard } from './goal-card';
import { GoalForm } from './goal-form';

type Props = {
  userId: string;
  /** The local calendar date ("today") progress is calculated against, `YYYY-MM-DD`. */
  today: string;
};

type AreaColorRow = { id: string; color: string };

// Mirrors `BacklogPanel`/`HabitsPanel`'s `useAreaColorById`: resolves a
// goal's area color swatch, including archived areas.
function useAreaColorById(userId: string): Record<string, string> {
  const { data } = useQuery<AreaColorRow>('SELECT id, color FROM areas WHERE user_id = ?', [userId]);
  return useMemo(() => Object.fromEntries(data.map((area) => [area.id, area.color])), [data]);
}

// The left-column Goals panel (see the design spec: Backlog and Goals share
// the left column even though this is a Slice C feature). Every card's
// progress is a watched, recalculated-on-write derivation - never a stored
// value read back as-is.
export function GoalsPanel({ userId, today }: Props) {
  const { goals } = useGoals(userId, today);
  const areaColorById = useAreaColorById(userId);

  const [isCreating, setIsCreating] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Цели</h2>

      {!isCreating && (
        <button type="button" onClick={() => setIsCreating(true)}>
          <span aria-hidden="true">+ </span>
          Новая цель
        </button>
      )}

      {isCreating && (
        <GoalForm userId={userId} onSaved={() => setIsCreating(false)} onCancel={() => setIsCreating(false)} />
      )}

      <ul className="space-y-2">
        {goals.map((item) => {
          if (editingGoalId === item.goal.id) {
            return (
              <li key={item.goal.id}>
                <GoalForm
                  userId={userId}
                  goal={item.goal}
                  onSaved={() => setEditingGoalId(null)}
                  onCancel={() => setEditingGoalId(null)}
                />
              </li>
            );
          }

          const color = item.goal.areaId ? areaColorById[item.goal.areaId] : undefined;

          return (
            <GoalCard
              key={item.goal.id}
              item={item}
              areaColor={color}
              onEdit={() => setEditingGoalId(item.goal.id)}
            />
          );
        })}
      </ul>
    </div>
  );
}
