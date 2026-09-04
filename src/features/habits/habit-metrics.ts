import { addDays, expectedHabitDates, isHabitScheduledOn, isoWeekdayOf } from './habit-repository';
import type { Habit, HabitCompletion } from './habit-types';

// A hard backward-walk cap for `calculateCurrentStreak` when a habit has no
// `start_date` to bound the search: without it, a habit that is always
// scheduled and always completed would otherwise walk back indefinitely.
// Ten years comfortably exceeds any real usage history for this app.
const MAX_STREAK_LOOKBACK_DAYS = 3650;

function completedDateSet(completions: HabitCompletion[]): Set<string> {
  const set = new Set<string>();
  for (const completion of completions) {
    if (completion.completed) set.add(completion.date);
  }
  return set;
}

// Walks backward day-by-day from `today`. Unscheduled days are skipped
// without affecting the count; the first *scheduled* day that was not
// completed ends the streak. Streak calculations use local calendar dates,
// never 24-hour timestamp differences (per the Slice C plan).
export function calculateCurrentStreak(habit: Habit, completions: HabitCompletion[], today: string): number {
  const completedDates = completedDateSet(completions);
  const lowerBound = habit.startDate ?? addDays(today, -MAX_STREAK_LOOKBACK_DAYS);

  let streak = 0;
  let date = today;
  while (date >= lowerBound) {
    if (isHabitScheduledOn(habit, date)) {
      if (!completedDates.has(date)) break;
      streak += 1;
    }
    date = addDays(date, -1);
  }
  return streak;
}

// Scans every expected date from the habit's start (or its earliest known
// completion, if start_date is unset) through `throughDate`, keeping the
// longest run of consecutive expected dates that were completed.
export function calculateBestStreak(
  habit: Habit,
  completions: HabitCompletion[],
  throughDate: string,
): number {
  const rangeStart =
    habit.startDate ?? completions.map((c) => c.date).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0] ?? null;
  if (!rangeStart) return 0;

  const completedDates = completedDateSet(completions);
  const expected = expectedHabitDates(habit, rangeStart, throughDate);

  let best = 0;
  let current = 0;
  for (const date of expected) {
    if (completedDates.has(date)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

// Raw expected/completed occurrence counts over `[startDate, endDate]` -
// shared by `calculateHabitCompletionRate` (a single habit's own %) and by
// callers that need to aggregate multiple habits into one combined figure
// (the Habits panel's weekly "25 из 29" summary), where summing pre-rounded
// per-habit percentages would be meaningless.
export function calculateHabitCompletionCounts(
  habit: Habit,
  completions: HabitCompletion[],
  startDate: string,
  endDate: string,
): { completed: number; expected: number } {
  const expected = expectedHabitDates(habit, startDate, endDate);
  const completedDates = completedDateSet(completions);
  const completed = expected.filter((date) => completedDates.has(date)).length;
  return { completed, expected: expected.length };
}

// `completed expected dates / expected dates * 100`, rounded to the nearest
// integer; 0 when the window has no expected dates at all (never divide by
// zero / never NaN).
export function calculateHabitCompletionRate(
  habit: Habit,
  completions: HabitCompletion[],
  startDate: string,
  endDate: string,
): number {
  const { completed, expected } = calculateHabitCompletionCounts(habit, completions, startDate, endDate);
  if (expected === 0) return 0;
  return Math.round((completed / expected) * 100);
}

export type DateRange = { start: string; end: string };

// The ISO week (Monday..Sunday) containing `date` - used for the Habits
// panel's "weekly completion" figure.
export function isoWeekRange(date: string): DateRange {
  const weekday = isoWeekdayOf(date); // 1 (Mon) .. 7 (Sun)
  const start = addDays(date, -(weekday - 1));
  return { start, end: addDays(start, 6) };
}

// The calendar month containing `date` - used for the Habits panel's
// "monthly completion" figure.
export function isoMonthRange(date: string): DateRange {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  const start = `${date.slice(0, 7)}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}
