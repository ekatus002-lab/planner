// A habit's active weekdays use ISO weekday numbers: Monday = 1 ... Sunday =
// 7 (see the Slice C plan's Global Constraints). This is deliberately not
// JavaScript's `Date#getDay()` numbering (Sunday = 0), since ISO weekdays
// read naturally in a Mon..Sun UI and matching the plan's own examples keeps
// tests/spec language aligned.
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Habit = {
  id: string;
  userId: string;
  areaId: string | null;
  title: string;
  weekdays: IsoWeekday[];
  startDate: string | null;
  endDate: string | null;
  targetValue: number | null;
  targetUnit: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

// One row per (habit, local calendar date) - never one row per day across
// every habit, and never materialized as a task. `date` is a plain
// `YYYY-MM-DD` string, matching `scheduled_date` elsewhere in the app.
export type HabitCompletion = {
  id: string;
  userId: string;
  habitId: string;
  date: string;
  completed: boolean;
  value: number | null;
  createdAt: string;
  updatedAt: string;
};

export type HabitWithCompletions = {
  habit: Habit;
  completions: HabitCompletion[];
};

export type CreateHabitInput = {
  userId: string;
  title: string;
  areaId?: string | null;
  weekdays?: IsoWeekday[];
  startDate?: string | null;
  endDate?: string | null;
  targetValue?: number | null;
  targetUnit?: string | null;
  active?: boolean;
};

// Fields a caller may patch after creation. `id`, `userId`, and the audit
// timestamps are excluded, matching `UpdateTaskInput`/`UpdateAreaInput`'s
// convention elsewhere in the codebase.
export type UpdateHabitInput = Partial<{
  title: string;
  areaId: string | null;
  weekdays: IsoWeekday[];
  startDate: string | null;
  endDate: string | null;
  targetValue: number | null;
  targetUnit: string | null;
  active: boolean;
}>;
