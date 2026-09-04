-- Goals' start/end dates are no longer required: a goal can exist with no
-- planned date range (e.g. an ongoing/open-ended goal), matching the
-- optionality already granted to habits' own start_date/end_date in
-- 202609040001_habits_goals.sql. Mirrors that migration's own
-- `check (end_date is null or start_date is null or end_date >= start_date)`
-- pattern for the ordering constraint.
alter table public.goals
  alter column start_date drop not null,
  alter column end_date drop not null;

alter table public.goals
  drop constraint goals_check,
  add constraint goals_check check (end_date is null or start_date is null or end_date >= start_date);
