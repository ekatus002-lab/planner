import { expectedHabitDates, isHabitScheduledOn } from './habit-repository';
import type { Habit, HabitCompletion } from './habit-types';

// A hard backward-walk cap for `calculateCurrentStreak` when a habit has no
// `start_date` to bound the search: without it, a habit that is always
// scheduled and always completed would otherwise walk back indefinitely.
// Ten years comfortably exceeds any real usage history for this app.
const MAX_STREAK_LOOKBACK_DAYS = 3650;

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

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

// `completed expected dates / expected dates * 100`, rounded to the nearest
// integer; 0 when the window has no expected dates at all (never divide by
// zero / never NaN).
export function calculateHabitCompletionRate(
  habit: Habit,
  completions: HabitCompletion[],
  startDate: string,
  endDate: string,
): number {
  const expected = expectedHabitDates(habit, startDate, endDate);
  if (expected.length === 0) return 0;

  const completedDates = completedDateSet(completions);
  const completedCount = expected.filter((date) => completedDates.has(date)).length;
  return Math.round((completedCount / expected.length) * 100);
}
