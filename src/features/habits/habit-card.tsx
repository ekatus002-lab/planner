'use client';

import { useState } from 'react';
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
    <li className="flex items-center gap-2">
      <input
        type="checkbox"
        aria-label={`Выполнено сегодня: ${habit.title}`}
        checked={isCompleted}
        onChange={handleToggle}
      />
      {areaColor && (
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: areaColor }}
        />
      )}
      <button type="button" onClick={onEdit} className="flex-1 text-left">
        {habit.title}
      </button>
      {habit.targetValue !== null && (
        <input
          type="number"
          aria-label={`Значение: ${habit.title}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-16"
        />
      )}
      <span aria-label={`Текущая серия: ${habit.title}`}>Серия {currentStreak}</span>
      <span aria-label={`Лучшая серия: ${habit.title}`}>Рекорд {bestStreak}</span>
      <span aria-label={`Неделя: ${habit.title}`}>{weekRate}%</span>
    </li>
  );
}
