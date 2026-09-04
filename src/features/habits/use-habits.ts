'use client';

import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import {
  HABIT_COLUMNS,
  HABIT_COMPLETION_COLUMNS,
  isHabitScheduledOn,
  mapHabitCompletionRow,
  mapHabitRow,
  type HabitCompletionRow,
  type HabitRow,
} from './habit-repository';
import {
  calculateBestStreak,
  calculateCurrentStreak,
  calculateHabitCompletionRate,
  isoMonthRange,
  isoWeekRange,
} from './habit-metrics';
import type { Habit, HabitCompletion } from './habit-types';

// Mirrors `listHabitsWithCompletions`/`listHabitCompletions`, but as *watched*
// queries: re-run (and re-emit) whenever a write touches `habits` or
// `habit_completions`. Completions are fetched unfiltered by date - a single
// user's full habit history is small, and streak/best-streak math needs an
// unbounded backward window anyway (bounded only by each habit's own
// `start_date`).
const ACTIVE_HABITS_QUERY = `SELECT ${HABIT_COLUMNS}
  FROM habits
  WHERE user_id = ? AND active = 1
  ORDER BY created_at ASC`;

const ALL_COMPLETIONS_QUERY = `SELECT ${HABIT_COMPLETION_COLUMNS}
  FROM habit_completions
  WHERE user_id = ?`;

export type HabitStats = {
  habit: Habit;
  completions: HabitCompletion[];
  isDueToday: boolean;
  todayCompletion: HabitCompletion | null;
  currentStreak: number;
  bestStreak: number;
  weekRate: number;
  monthRate: number;
};

export type UseHabitsResult = {
  /** Every active habit, with its stats computed relative to `today`. */
  habits: HabitStats[];
  /** The subset of `habits` actually scheduled on `today`. */
  todaysHabits: HabitStats[];
  isLoading: boolean;
};

export function useHabits(userId: string, today: string): UseHabitsResult {
  const { data: habitRows, isLoading: habitsLoading } = useQuery<HabitRow>(ACTIVE_HABITS_QUERY, [userId]);
  const { data: completionRows, isLoading: completionsLoading } = useQuery<HabitCompletionRow>(
    ALL_COMPLETIONS_QUERY,
    [userId],
  );

  const habits = useMemo(() => {
    const mappedHabits = habitRows.map(mapHabitRow);
    const mappedCompletions = completionRows.map(mapHabitCompletionRow);

    const completionsByHabitId = new Map<string, HabitCompletion[]>();
    for (const completion of mappedCompletions) {
      const list = completionsByHabitId.get(completion.habitId) ?? [];
      list.push(completion);
      completionsByHabitId.set(completion.habitId, list);
    }

    const week = isoWeekRange(today);
    const month = isoMonthRange(today);

    return mappedHabits.map((habit): HabitStats => {
      const habitCompletions = completionsByHabitId.get(habit.id) ?? [];
      return {
        habit,
        completions: habitCompletions,
        isDueToday: isHabitScheduledOn(habit, today),
        todayCompletion: habitCompletions.find((completion) => completion.date === today) ?? null,
        currentStreak: calculateCurrentStreak(habit, habitCompletions, today),
        bestStreak: calculateBestStreak(habit, habitCompletions, today),
        weekRate: calculateHabitCompletionRate(habit, habitCompletions, week.start, week.end),
        monthRate: calculateHabitCompletionRate(habit, habitCompletions, month.start, month.end),
      };
    });
  }, [habitRows, completionRows, today]);

  const todaysHabits = useMemo(() => habits.filter((stat) => stat.isDueToday), [habits]);

  return { habits, todaysHabits, isLoading: habitsLoading || completionsLoading };
}
