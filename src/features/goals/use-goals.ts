'use client';

import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import {
  HABIT_COLUMNS,
  HABIT_COMPLETION_COLUMNS,
  mapHabitCompletionRow,
  mapHabitRow,
  type HabitCompletionRow,
  type HabitRow,
} from '@/features/habits/habit-repository';
import type { Habit, HabitCompletion } from '@/features/habits/habit-types';
import { GOAL_COLUMNS, mapGoalRow, type GoalRow } from './goal-repository';
import { calculateGoalProgress } from './goal-progress';
import type { Goal, GoalProgressResult } from './goal-types';

const GOALS_QUERY = `SELECT ${GOAL_COLUMNS} FROM goals WHERE user_id = ? ORDER BY created_at ASC`;
const GOAL_TASK_LINKS_QUERY = `SELECT goal_id, task_id FROM goal_tasks WHERE user_id = ?`;
const GOAL_HABIT_LINKS_QUERY = `SELECT goal_id, habit_id FROM goal_habits WHERE user_id = ?`;
const TASK_STATUS_QUERY = `SELECT id, status FROM tasks WHERE user_id = ?`;
const HABITS_QUERY = `SELECT ${HABIT_COLUMNS} FROM habits WHERE user_id = ?`;
const HABIT_COMPLETIONS_QUERY = `SELECT ${HABIT_COMPLETION_COLUMNS} FROM habit_completions WHERE user_id = ?`;

type GoalTaskLinkRow = { goal_id: string; task_id: string };
type GoalHabitLinkRow = { goal_id: string; habit_id: string };
type TaskStatusRow = { id: string; status: string };

export type GoalWithProgress = {
  goal: Goal;
  progress: GoalProgressResult;
  linkedTaskCount: number;
  completedLinkedTaskCount: number;
  linkedHabitCount: number;
};

export type UseGoalsResult = {
  goals: GoalWithProgress[];
  isLoading: boolean;
};

// Watches goals plus every table their automatic progress depends on
// (goal_tasks/goal_habits links, linked tasks' status, linked habits and
// their completions) so a goal card's displayed percentage recalculates the
// moment any of those local rows change - never a stale snapshot.
export function useGoals(userId: string, today: string): UseGoalsResult {
  const { data: goalRows, isLoading: goalsLoading } = useQuery<GoalRow>(GOALS_QUERY, [userId]);
  const { data: goalTaskLinks, isLoading: taskLinksLoading } = useQuery<GoalTaskLinkRow>(
    GOAL_TASK_LINKS_QUERY,
    [userId],
  );
  const { data: goalHabitLinks, isLoading: habitLinksLoading } = useQuery<GoalHabitLinkRow>(
    GOAL_HABIT_LINKS_QUERY,
    [userId],
  );
  const { data: taskStatusRows, isLoading: tasksLoading } = useQuery<TaskStatusRow>(TASK_STATUS_QUERY, [
    userId,
  ]);
  const { data: habitRows, isLoading: habitsLoading } = useQuery<HabitRow>(HABITS_QUERY, [userId]);
  const { data: completionRows, isLoading: completionsLoading } = useQuery<HabitCompletionRow>(
    HABIT_COMPLETIONS_QUERY,
    [userId],
  );

  const goals = useMemo(() => {
    const mappedGoals = goalRows.map(mapGoalRow);
    const taskStatusById = new Map(taskStatusRows.map((row) => [row.id, row.status]));
    const habitsById = new Map(habitRows.map((row) => [row.id, mapHabitRow(row)] as const));

    const completionsByHabitId = new Map<string, HabitCompletion[]>();
    for (const row of completionRows) {
      const completion = mapHabitCompletionRow(row);
      const list = completionsByHabitId.get(completion.habitId) ?? [];
      list.push(completion);
      completionsByHabitId.set(completion.habitId, list);
    }

    return mappedGoals.map((goal): GoalWithProgress => {
      const taskIds = goalTaskLinks.filter((link) => link.goal_id === goal.id).map((link) => link.task_id);
      const habitIds = goalHabitLinks
        .filter((link) => link.goal_id === goal.id)
        .map((link) => link.habit_id);

      const tasks = taskIds
        .map((id) => taskStatusById.get(id))
        .filter((status): status is string => status !== undefined)
        .map((status) => ({ completed: status === 'completed' }));

      const habits = habitIds
        .map((id) => habitsById.get(id))
        .filter((habit): habit is Habit => habit !== undefined)
        .map((habit) => ({ habit, completions: completionsByHabitId.get(habit.id) ?? [] }));

      const progress = calculateGoalProgress({
        mode: goal.progressMode,
        manualProgress: goal.manualProgress,
        manualAdjustment: goal.manualAdjustment,
        tasks,
        habits,
        startDate: goal.startDate,
        endDate: goal.endDate,
        today,
      });

      return {
        goal,
        progress,
        linkedTaskCount: tasks.length,
        completedLinkedTaskCount: tasks.filter((task) => task.completed).length,
        linkedHabitCount: habits.length,
      };
    });
  }, [goalRows, goalTaskLinks, goalHabitLinks, taskStatusRows, habitRows, completionRows, today]);

  return {
    goals,
    isLoading:
      goalsLoading || taskLinksLoading || habitLinksLoading || tasksLoading || habitsLoading || completionsLoading,
  };
}

export type GoalOption = { id: string; title: string };

const GOAL_OPTIONS_QUERY = `SELECT id, title FROM goals WHERE user_id = ? ORDER BY created_at ASC`;

// A lightweight id/title listing for goal-selector dropdowns (habit form,
// and eventually the task form) - deliberately separate from `useGoals`
// above so a selector doesn't pay for progress recalculation it never
// displays.
export function useGoalOptions(userId: string): GoalOption[] {
  const { data } = useQuery<GoalOption>(GOAL_OPTIONS_QUERY, [userId]);
  return data;
}

const GOAL_IDS_FOR_HABIT_QUERY = `SELECT goal_id FROM goal_habits WHERE habit_id = ?`;

// Watched list of goal ids a given habit is currently linked to - lets
// `HabitForm` pre-check the right boxes in its goal-link selector when
// editing an existing habit. `habitId` is undefined while creating a new
// habit (nothing to link yet); the hook is still called unconditionally
// (rules of hooks) with an empty-string param that matches no real habit.
export function useLinkedGoalIdsForHabit(habitId: string | undefined): string[] {
  const { data } = useQuery<{ goal_id: string }>(GOAL_IDS_FOR_HABIT_QUERY, [habitId ?? '']);
  return useMemo(() => (habitId ? data.map((row) => row.goal_id) : []), [habitId, data]);
}
