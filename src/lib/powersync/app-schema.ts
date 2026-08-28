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

export const AppSchema = new Schema({ areas, tasks });
export type PlannerDatabase = (typeof AppSchema)['types'];
