import { describe, expect, it } from 'vitest';
import {
  calculateBestStreak,
  calculateCurrentStreak,
  calculateHabitCompletionRate,
} from './habit-metrics';
import type { Habit, HabitCompletion } from './habit-types';

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1',
    userId: 'user-1',
    areaId: null,
    title: 'Test habit',
    weekdays: [1, 3, 5],
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

function makeCompletion(date: string, completed = true): HabitCompletion {
  return {
    id: `completion-${date}`,
    userId: 'user-1',
    habitId: 'habit-1',
    date,
    completed,
    value: null,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

describe('calculateCurrentStreak', () => {
  it('does not break a streak on unscheduled days', () => {
    // Habit is Mon/Wed/Fri. 2026-08-21 (Fri), 2026-08-24 (Mon), 2026-08-26
    // (Wed) are all completed; "today" is Thursday 2026-08-27, which is not
    // a scheduled day and must simply be skipped, not treated as a miss.
    const habit = makeHabit({ weekdays: [1, 3, 5] });
    const completed = ['2026-08-21', '2026-08-24', '2026-08-26'].map((d) => makeCompletion(d));
    expect(calculateCurrentStreak(habit, completed, '2026-08-27')).toBe(3);
  });

  it('breaks the streak on a missed scheduled day even when the day after it is unscheduled', () => {
    // Mon/Wed/Fri habit: Fri 08-28 and Mon 08-24 are completed, but Wed
    // 08-26 (scheduled) was missed. Thu 08-27 sits between the miss and
    // "today" but is unscheduled - it must not hide the break.
    const habit = makeHabit({ weekdays: [1, 3, 5] });
    const completed = ['2026-08-24', '2026-08-28'].map((d) => makeCompletion(d));
    expect(calculateCurrentStreak(habit, completed, '2026-08-28')).toBe(1);
  });

  it('returns 0 when the most recent scheduled day was missed', () => {
    const habit = makeHabit({ weekdays: [1, 3, 5] });
    expect(calculateCurrentStreak(habit, [], '2026-08-28')).toBe(0);
  });

  it('ignores explicit completed=false rows the same as a missing row', () => {
    const habit = makeHabit({ weekdays: [1, 3, 5] });
    const completed = [makeCompletion('2026-08-28', false)];
    expect(calculateCurrentStreak(habit, completed, '2026-08-28')).toBe(0);
  });

  it('stops walking back before the habit start_date', () => {
    const habit = makeHabit({ weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: '2026-08-26' });
    const completed = ['2026-08-26', '2026-08-27', '2026-08-28'].map((d) => makeCompletion(d));
    expect(calculateCurrentStreak(habit, completed, '2026-08-28')).toBe(3);
  });
});

describe('calculateBestStreak', () => {
  it('finds the longest run of consecutive completed expected dates', () => {
    const habit = makeHabit({ weekdays: [1, 3, 5], startDate: '2026-08-03' });
    // Expected dates in order: 08-03(Mon), 08-05(Wed), 08-07(Fri), 08-10(Mon),
    // 08-12(Wed), 08-14(Fri), 08-17(Mon), 08-19(Wed), 08-21(Fri).
    // Completed: the first three (a run of 3), then a miss on 08-10 breaks
    // it, then only the last two are completed (a run of 2) - best is 3.
    const completed = [
      '2026-08-03',
      '2026-08-05',
      '2026-08-07',
      '2026-08-19',
      '2026-08-21',
    ].map((d) => makeCompletion(d));

    expect(calculateBestStreak(habit, completed, '2026-08-21')).toBe(3);
  });

  it('returns 0 for a habit with no start_date and no completion history', () => {
    const habit = makeHabit({ startDate: null });
    expect(calculateBestStreak(habit, [], '2026-08-21')).toBe(0);
  });
});

describe('calculateHabitCompletionRate', () => {
  it('divides completed expected dates by total expected dates, rounded to the nearest integer', () => {
    const habit = makeHabit({ weekdays: [1, 3, 5] });
    // Expected in [08-24..08-30]: Mon 08-24, Wed 08-26, Fri 08-28 (3 total).
    const completed = ['2026-08-24', '2026-08-26'].map((d) => makeCompletion(d));
    expect(calculateHabitCompletionRate(habit, completed, '2026-08-24', '2026-08-30')).toBe(67);
  });

  it('returns 0 when there are no expected dates in the window', () => {
    const habit = makeHabit({ weekdays: [6, 7] });
    expect(calculateHabitCompletionRate(habit, [], '2026-08-24', '2026-08-28')).toBe(0);
  });

  it('returns 100 when every expected date was completed', () => {
    const habit = makeHabit({ weekdays: [1] });
    const completed = ['2026-08-24'].map((d) => makeCompletion(d));
    expect(calculateHabitCompletionRate(habit, completed, '2026-08-24', '2026-08-24')).toBe(100);
  });
});
