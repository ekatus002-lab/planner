import type { CommonPowerSyncDatabase } from '@powersync/web';
import type {
  CreateHabitInput,
  Habit,
  HabitCompletion,
  HabitWithCompletions,
  IsoWeekday,
  UpdateHabitInput,
} from './habit-types';

// Column names mirror the local SQLite `habits` table (and, in turn,
// `supabase/migrations/202609040001_habits_goals.sql`) exactly. `weekdays`
// is stored as JSON text (SQLite/PowerSync has no native array column type)
// and parsed/serialized only at this repository boundary.
export type HabitRow = {
  id: string;
  user_id: string;
  area_id: string | null;
  title: string;
  weekdays: string;
  start_date: string | null;
  end_date: string | null;
  target_value: number | null;
  target_unit: string | null;
  active: number;
  created_at: string;
  updated_at: string;
};

export type HabitCompletionRow = {
  id: string;
  user_id: string;
  habit_id: string;
  date: string;
  completed: number;
  value: number | null;
  created_at: string;
  updated_at: string;
};

export const HABIT_COLUMNS = `id, user_id, area_id, title, weekdays, start_date, end_date,
       target_value, target_unit, active, created_at, updated_at`;

export const HABIT_COMPLETION_COLUMNS = `id, user_id, habit_id, date, completed, value, created_at, updated_at`;

export function mapHabitRow(row: HabitRow): Habit {
  return {
    id: row.id,
    userId: row.user_id,
    areaId: row.area_id,
    title: row.title,
    weekdays: JSON.parse(row.weekdays) as IsoWeekday[],
    startDate: row.start_date,
    endDate: row.end_date,
    targetValue: row.target_value,
    targetUnit: row.target_unit,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapHabitCompletionRow(row: HabitCompletionRow): HabitCompletion {
  return {
    id: row.id,
    userId: row.user_id,
    habitId: row.habit_id,
    date: row.date,
    completed: row.completed === 1,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const VALID_ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

// `date` is a plain `YYYY-MM-DD` string with no time component. Parsing it
// as UTC midnight (rather than via the no-arg `new Date(date)` local-time
// constructor) keeps the computed weekday stable regardless of the host's
// local timezone - a local-first app must not let the same stored date
// resolve to different weekdays on different devices. Exported so
// `habit-metrics.ts` can build week/month ranges from the same definition
// of "weekday" this repository uses for scheduling.
export function isoWeekdayOf(date: string): IsoWeekday {
  const jsDay = new Date(`${date}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday .. 6 = Saturday
  return (jsDay === 0 ? 7 : jsDay) as IsoWeekday;
}

// Pure calendar-date comparison on `YYYY-MM-DD` strings - lexicographic
// comparison is correct for this format without parsing into `Date`s.
function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Adds `days` calendar days to a `YYYY-MM-DD` string, in UTC. Exported so
 * `habit-metrics.ts` computes week/month ranges with the same date
 * arithmetic used for streaks and expected-date iteration here, instead of
 * a second, potentially-divergent implementation.
 */
export function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

// Whether `habit` is due on `date`: `date` falls within the habit's optional
// start/end bounds (inclusive) and `date`'s ISO weekday is one of the
// habit's active weekdays. Deliberately ignores `habit.active` - that flag
// controls whether a habit is offered/shown at all, not whether a given date
// was ever "expected" (streak/rate math over a habit's history must stay
// correct even after the habit is later deactivated).
export function isHabitScheduledOn(habit: Habit, date: string): boolean {
  if (habit.startDate && compareDates(date, habit.startDate) < 0) return false;
  if (habit.endDate && compareDates(date, habit.endDate) > 0) return false;
  return habit.weekdays.includes(isoWeekdayOf(date));
}

// Inclusive list of every date in `[startDate, endDate]` on which `habit` is
// due. Iterates the requested window day-by-day rather than date-fns's
// `eachDayOfInterval` to avoid adding a new dependency shared across
// in-flight worktrees; behavior (inclusive of both ends, UTC calendar dates)
// is the same.
export function expectedHabitDates(habit: Habit, startDate: string, endDate: string): string[] {
  if (compareDates(startDate, endDate) > 0) return [];

  const dates: string[] = [];
  for (let date = startDate; compareDates(date, endDate) <= 0; date = addDays(date, 1)) {
    if (isHabitScheduledOn(habit, date)) {
      dates.push(date);
    }
  }
  return dates;
}

function assertValidWeekdays(weekdays: IsoWeekday[]): void {
  if (weekdays.length === 0) {
    throw new Error('Habit must be scheduled on at least one weekday');
  }
  const invalid = weekdays.some((day) => !VALID_ISO_WEEKDAYS.includes(day));
  if (invalid) {
    throw new Error('Habit weekdays must be ISO weekday numbers (1..7)');
  }
}

export async function createHabit(db: CommonPowerSyncDatabase, input: CreateHabitInput): Promise<Habit> {
  const title = input.title.trim();
  if (!title) throw new Error('Habit title is required');

  const weekdays = input.weekdays ?? [1, 2, 3, 4, 5, 6, 7];
  assertValidWeekdays(weekdays);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const areaId = input.areaId ?? null;
  const startDate = input.startDate ?? null;
  const endDate = input.endDate ?? null;
  const targetValue = input.targetValue ?? null;
  const targetUnit = input.targetUnit ?? null;
  const active = input.active ?? true;

  await db.execute(
    `INSERT INTO habits (
      id, user_id, area_id, title, weekdays, start_date, end_date,
      target_value, target_unit, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      areaId,
      title,
      JSON.stringify(weekdays),
      startDate,
      endDate,
      targetValue,
      targetUnit,
      active ? 1 : 0,
      now,
      now,
    ],
  );

  return {
    id,
    userId: input.userId,
    areaId,
    title,
    weekdays,
    startDate,
    endDate,
    targetValue,
    targetUnit,
    active,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateHabit(
  db: CommonPowerSyncDatabase,
  id: string,
  patch: UpdateHabitInput,
): Promise<void> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error('Habit title is required');
    assignments.push('title = ?');
    values.push(title);
  }
  if (patch.areaId !== undefined) {
    assignments.push('area_id = ?');
    values.push(patch.areaId);
  }
  if (patch.weekdays !== undefined) {
    assertValidWeekdays(patch.weekdays);
    assignments.push('weekdays = ?');
    values.push(JSON.stringify(patch.weekdays));
  }
  if (patch.startDate !== undefined) {
    assignments.push('start_date = ?');
    values.push(patch.startDate);
  }
  if (patch.endDate !== undefined) {
    assignments.push('end_date = ?');
    values.push(patch.endDate);
  }
  if (patch.targetValue !== undefined) {
    assignments.push('target_value = ?');
    values.push(patch.targetValue);
  }
  if (patch.targetUnit !== undefined) {
    assignments.push('target_unit = ?');
    values.push(patch.targetUnit);
  }
  if (patch.active !== undefined) {
    assignments.push('active = ?');
    values.push(patch.active ? 1 : 0);
  }

  if (assignments.length === 0) return;

  assignments.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  await db.execute(`UPDATE habits SET ${assignments.join(', ')} WHERE id = ?`, values);
}

export async function deleteHabit(db: CommonPowerSyncDatabase, id: string): Promise<void> {
  await db.execute('DELETE FROM habits WHERE id = ?', [id]);
}

// Upserts a single (habit_id, date) completion row - toggling a habit's
// checkbox repeatedly for the same day updates the same row rather than
// creating duplicates, matching the unique(habit_id, date) constraint on
// both the local and Postgres tables.
export async function setHabitCompletion(
  db: CommonPowerSyncDatabase,
  userId: string,
  habitId: string,
  date: string,
  completed: boolean,
  value?: number | null,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.getOptional<{ id: string }>(
    'SELECT id FROM habit_completions WHERE habit_id = ? AND date = ?',
    [habitId, date],
  );

  if (existing) {
    await db.execute(
      'UPDATE habit_completions SET completed = ?, value = ?, updated_at = ? WHERE id = ?',
      [completed ? 1 : 0, value ?? null, now, existing.id],
    );
    return;
  }

  await db.execute(
    `INSERT INTO habit_completions (id, user_id, habit_id, date, completed, value, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), userId, habitId, date, completed ? 1 : 0, value ?? null, now, now],
  );
}

// Lists every completion row (across all of the user's habits) whose date
// falls within `[startDate, endDate]` inclusive.
export async function listHabitCompletions(
  db: CommonPowerSyncDatabase,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<HabitCompletion[]> {
  const rows = await db.getAll<HabitCompletionRow>(
    `SELECT ${HABIT_COMPLETION_COLUMNS}
     FROM habit_completions
     WHERE user_id = ? AND date >= ? AND date <= ?
     ORDER BY date ASC`,
    [userId, startDate, endDate],
  );
  return rows.map(mapHabitCompletionRow);
}

export type ListHabitsWithCompletionsOptions = {
  /** Include archived (active = false) habits. Defaults to false. */
  includeInactive?: boolean;
};

// Lists the user's habits (active-only by default) together with their
// completion rows in `[startDate, endDate]`, in one shape the Habits panel
// and habit-metrics calculations can consume directly.
export async function listHabitsWithCompletions(
  db: CommonPowerSyncDatabase,
  userId: string,
  startDate: string,
  endDate: string,
  options: ListHabitsWithCompletionsOptions = {},
): Promise<HabitWithCompletions[]> {
  const habitRows = await db.getAll<HabitRow>(
    `SELECT ${HABIT_COLUMNS}
     FROM habits
     WHERE user_id = ? ${options.includeInactive ? '' : 'AND active = 1'}
     ORDER BY created_at ASC`,
    [userId],
  );

  const completionRows = await db.getAll<HabitCompletionRow>(
    `SELECT ${HABIT_COMPLETION_COLUMNS}
     FROM habit_completions
     WHERE user_id = ? AND date >= ? AND date <= ?
     ORDER BY date ASC`,
    [userId, startDate, endDate],
  );

  const completionsByHabitId = new Map<string, HabitCompletion[]>();
  for (const row of completionRows) {
    const completion = mapHabitCompletionRow(row);
    const list = completionsByHabitId.get(completion.habitId) ?? [];
    list.push(completion);
    completionsByHabitId.set(completion.habitId, list);
  }

  return habitRows.map((row) => {
    const habit = mapHabitRow(row);
    return { habit, completions: completionsByHabitId.get(habit.id) ?? [] };
  });
}
