import { describe, expect, it } from 'vitest';
import { calculateGoalProgress } from './goal-progress';
import type { Habit, HabitCompletion } from '@/features/habits/habit-types';
import type { CalculateGoalProgressInput } from './goal-types';

const GOAL_WINDOW = { startDate: '2026-08-01', endDate: '2026-08-10', today: '2026-08-10' };

function baseInput(overrides: Partial<CalculateGoalProgressInput> = {}): CalculateGoalProgressInput {
  return {
    mode: 'automatic',
    manualProgress: 0,
    manualAdjustment: 0,
    tasks: [],
    habits: [],
    ...GOAL_WINDOW,
    ...overrides,
  };
}

function completedTask() {
  return { completed: true };
}
function openTask() {
  return { completed: false };
}

function dailyHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1',
    userId: 'user-1',
    areaId: null,
    title: 'Daily habit',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    startDate: null,
    endDate: null,
    targetValue: null,
    targetUnit: null,
    active: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

// `completed` of the first `completed` expected dates (2026-08-01..08-10,
// a daily habit's 10 expected occurrences in GOAL_WINDOW) as completed rows.
function completions(completed: number, total: number): HabitCompletion[] {
  const dates = Array.from({ length: total }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
  return dates.slice(0, completed).map((date) => ({
    id: `completion-${date}`,
    userId: 'user-1',
    habitId: 'habit-1',
    date,
    completed: true,
    value: null,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  }));
}

describe('calculateGoalProgress', () => {
  it('uses manual progress for manual goals, ignoring tasks/habits entirely', () => {
    const result = calculateGoalProgress(
      baseInput({ mode: 'manual', manualProgress: 72, tasks: [completedTask()], habits: [] }),
    );
    expect(result.displayed).toBe(72);
    expect(result.manual).toBe(72);
  });

  it('weights tasks and habits equally when both exist', () => {
    const result = calculateGoalProgress(
      baseInput({
        mode: 'automatic',
        tasks: [completedTask(), openTask()],
        habits: [{ habit: dailyHabit(), completions: completions(8, 10) }],
      }),
    );
    expect(result.taskRate).toBe(50);
    expect(result.habitRate).toBe(80);
    expect(result.automatic).toBe(65);
    expect(result.displayed).toBe(65);
  });

  it('gives tasks 100% weight when the goal has only tasks', () => {
    const result = calculateGoalProgress(
      baseInput({ mode: 'automatic', tasks: [completedTask(), completedTask(), openTask()] }),
    );
    expect(result.taskRate).toBe(67);
    expect(result.habitRate).toBeNull();
    expect(result.automatic).toBe(67);
  });

  it('gives habits 100% weight when the goal has only habits', () => {
    const result = calculateGoalProgress(
      baseInput({ mode: 'automatic', habits: [{ habit: dailyHabit(), completions: completions(3, 10) }] }),
    );
    expect(result.taskRate).toBeNull();
    expect(result.habitRate).toBe(30);
    expect(result.automatic).toBe(30);
  });

  it('is 0 automatic with no linked tasks or habits at all', () => {
    const result = calculateGoalProgress(baseInput({ mode: 'automatic' }));
    expect(result.automatic).toBe(0);
    expect(result.displayed).toBe(0);
  });

  it('applies a positive hybrid adjustment and clamps the result to 100', () => {
    const result = calculateGoalProgress(
      baseInput({
        mode: 'hybrid',
        tasks: Array.from({ length: 10 }, (_, i) => (i < 9 ? completedTask() : openTask())), // 90%
        manualAdjustment: 15,
      }),
    );
    expect(result.automatic).toBe(90);
    expect(result.displayed).toBe(100);
  });

  it('applies a negative hybrid adjustment and clamps the result to 0', () => {
    const result = calculateGoalProgress(
      baseInput({
        mode: 'hybrid',
        tasks: [openTask(), openTask()],
        manualAdjustment: -20,
      }),
    );
    expect(result.automatic).toBe(0);
    expect(result.displayed).toBe(0);
  });

  it('ignores manual_adjustment entirely in automatic mode', () => {
    const result = calculateGoalProgress(
      baseInput({ mode: 'automatic', tasks: [completedTask()], manualAdjustment: 50 }),
    );
    expect(result.automatic).toBe(100);
    expect(result.displayed).toBe(100);
  });

  it('caps the habit window at min(today, end_date)', () => {
    // Goal ends 08-10 but "today" is only 08-05: expected occurrences must
    // stop at 08-05 (5 days), not run through the full goal period.
    const habit = dailyHabit();
    const result = calculateGoalProgress(
      baseInput({
        mode: 'automatic',
        endDate: '2026-08-10',
        today: '2026-08-05',
        habits: [{ habit, completions: completions(5, 5) }],
      }),
    );
    expect(result.habitRate).toBe(100);
  });
});
