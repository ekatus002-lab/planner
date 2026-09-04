import { column, Schema, Table } from '@powersync/web';

// Column names mirror the Postgres tables defined in
// supabase/migrations/202608270001_foundation.sql exactly, since PowerSync
// mirrors those columns into the local SQLite database.

const areas = new Table({
  user_id: column.text,
  name: column.text,
  color: column.text,
  sort_order: column.integer,
  archived: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const tasks = new Table({
  user_id: column.text,
  area_id: column.text,
  goal_id: column.text,
  title: column.text,
  description: column.text,
  status: column.text,
  scheduled_date: column.text,
  start_at: column.text,
  end_at: column.text,
  all_day: column.integer,
  priority: column.text,
  completed_at: column.text,
  reschedule_count: column.integer,
  sort_order: column.real,
  field_versions: column.text,
  created_at: column.text,
  updated_at: column.text,
});

// `weekdays` stores a JSON array of ISO weekday numbers (`1..7`, Monday-first)
// as text - PowerSync/SQLite has no native JSON/array column type, so it is
// parsed/serialized at the repository boundary (see `habit-repository.ts`).
const habits = new Table({
  user_id: column.text,
  area_id: column.text,
  title: column.text,
  weekdays: column.text,
  start_date: column.text,
  end_date: column.text,
  target_value: column.real,
  target_unit: column.text,
  active: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const habit_completions = new Table({
  user_id: column.text,
  habit_id: column.text,
  date: column.text,
  completed: column.integer,
  value: column.real,
  created_at: column.text,
  updated_at: column.text,
});

const goals = new Table({
  user_id: column.text,
  area_id: column.text,
  title: column.text,
  description: column.text,
  start_date: column.text,
  end_date: column.text,
  progress_mode: column.text,
  manual_progress: column.real,
  manual_adjustment: column.real,
  created_at: column.text,
  updated_at: column.text,
});

const goal_tasks = new Table({
  user_id: column.text,
  goal_id: column.text,
  task_id: column.text,
});

const goal_habits = new Table({
  user_id: column.text,
  goal_id: column.text,
  habit_id: column.text,
});

export const AppSchema = new Schema({
  areas,
  tasks,
  habits,
  habit_completions,
  goals,
  goal_tasks,
  goal_habits,
});
export type PlannerDatabase = (typeof AppSchema)['types'];
