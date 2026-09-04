import { expectedHabitDates } from '@/features/habits/habit-repository';
import type { CalculateGoalProgressInput, GoalProgressResult } from './goal-types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function taskRateOf(tasks: CalculateGoalProgressInput['tasks']): number | null {
  if (tasks.length === 0) return null;
  const completedCount = tasks.filter((task) => task.completed).length;
  return Math.round((completedCount / tasks.length) * 100);
}

// Aggregates expected/completed occurrence counts across every linked habit
// (not an average of per-habit rates), over the goal period clipped to
// min(today, goal.end_date) - exactly the Slice C plan's Global Constraint
// for automatic habit contribution.
function habitRateOf(
  habits: CalculateGoalProgressInput['habits'],
  startDate: string | null,
  endDate: string | null,
  today: string,
): number | null {
  if (habits.length === 0) return null;
  // Without both ends of the goal's own date range there is no window to
  // count expected habit occurrences over - automatic habit-based progress
  // is simply unavailable for an open-ended goal (same as "no linked
  // habits"), while task-based progress and manual mode are unaffected.
  if (startDate === null || endDate === null) return null;

  const windowEnd = today < endDate ? today : endDate; // min(today, endDate)
  let totalExpected = 0;
  let totalCompleted = 0;

  for (const { habit, completions } of habits) {
    const expected = expectedHabitDates(habit, startDate, windowEnd);
    const completedDates = new Set(completions.filter((c) => c.completed).map((c) => c.date));
    totalExpected += expected.length;
    totalCompleted += expected.filter((date) => completedDates.has(date)).length;
  }

  if (totalExpected === 0) return 0;
  return Math.round((totalCompleted / totalExpected) * 100);
}

// `automatic` progress is derived only; `manual` is stored as-is; `hybrid` =
// automatic + manual_adjustment, clamped to [0, 100] (Global Constraints).
export function calculateGoalProgress(input: CalculateGoalProgressInput): GoalProgressResult {
  const { mode, manualProgress, manualAdjustment, tasks, habits, startDate, endDate, today } = input;

  const taskRate = taskRateOf(tasks);
  const habitRate = habitRateOf(habits, startDate, endDate, today);

  const hasTasks = taskRate !== null;
  const hasHabits = habitRate !== null;

  const automatic =
    hasTasks && hasHabits
      ? Math.round((taskRate + habitRate) / 2)
      : hasTasks
        ? taskRate
        : hasHabits
          ? habitRate
          : 0;

  const displayed =
    mode === 'manual'
      ? clamp(manualProgress, 0, 100)
      : mode === 'hybrid'
        ? clamp(automatic + manualAdjustment, 0, 100)
        : clamp(automatic, 0, 100);

  return {
    automatic: clamp(automatic, 0, 100),
    manual: manualProgress,
    displayed,
    taskRate,
    habitRate,
  };
}
