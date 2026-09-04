import type { Habit, HabitCompletion } from '@/features/habits/habit-types';

export type GoalProgressMode = 'automatic' | 'manual' | 'hybrid';

export type Goal = {
  id: string;
  userId: string;
  areaId: string | null;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  progressMode: GoalProgressMode;
  manualProgress: number;
  manualAdjustment: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateGoalInput = {
  userId: string;
  title: string;
  description?: string;
  areaId?: string | null;
  startDate: string;
  endDate: string;
  progressMode?: GoalProgressMode;
  manualProgress?: number;
  manualAdjustment?: number;
};

// `id`, `userId`, and the audit timestamps are excluded, matching
// `UpdateTaskInput`/`UpdateHabitInput`'s convention elsewhere in the codebase.
export type UpdateGoalInput = Partial<{
  title: string;
  description: string;
  areaId: string | null;
  startDate: string;
  endDate: string;
  progressMode: GoalProgressMode;
  manualProgress: number;
  manualAdjustment: number;
}>;

// Inputs to `calculateGoalProgress` - a completed-linked-task's contribution
// only needs its completion state, never its full `Task` shape.
export type GoalProgressTaskInput = { completed: boolean };
export type GoalProgressHabitInput = { habit: Habit; completions: HabitCompletion[] };

export type CalculateGoalProgressInput = {
  mode: GoalProgressMode;
  manualProgress: number;
  manualAdjustment: number;
  tasks: GoalProgressTaskInput[];
  habits: GoalProgressHabitInput[];
  /** The goal's own start_date - the lower bound of its "goal period". */
  startDate: string;
  /** The goal's own end_date - the upper bound of its "goal period". */
  endDate: string;
  /** "Today", local calendar date - the automatic habit window is capped at min(today, endDate). */
  today: string;
};

export type GoalProgressResult = {
  /** Derived-only progress from linked tasks/habits, ignoring manual input. */
  automatic: number;
  /** The goal's stored manual progress value, passed through unchanged. */
  manual: number;
  /** What the UI should actually show, per `mode`. */
  displayed: number;
  /** Completed/linked task ratio (0..100), or null if the goal has no linked tasks. */
  taskRate: number | null;
  /** Completed/expected habit-occurrence ratio (0..100), or null if the goal has no linked habits. */
  habitRate: number | null;
};
