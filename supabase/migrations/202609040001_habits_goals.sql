-- Slice C: habits and goals data model.
--
-- Habits are modeled separately from tasks: a habit definition plus one
-- completion row per (habit, local calendar date) - never materialized as
-- recurring tasks (see docs/superpowers/specs/2026-08-27-personal-planner-design.md
-- section 6 and docs/superpowers/plans/2026-08-27-slice-c-habits-goals.md's
-- Global Constraints).
--
-- Goals link to tasks/habits through normalized relation tables
-- (`goal_tasks`/`goal_habits`) so a goal's progress can be recalculated from
-- either side without denormalizing goal membership onto every task/habit
-- row. `tasks.goal_id` (added in the Slice A foundation migration but left
-- without a foreign key, since `goals` didn't exist yet) gets its FK added
-- here as a fast direct link a task/goal form can render without joining
-- through `goal_tasks`; `goal_tasks` remains the source of truth for
-- progress-calculation queries and reverse (goal -> tasks) lookups.

create table public.habits (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id text references public.areas(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  weekdays jsonb not null default '[1,2,3,4,5,6,7]'::jsonb,
  start_date date,
  end_date date,
  target_value numeric,
  target_unit text,
  active integer not null default 1 check (active in (0,1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habit_date_range_valid check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.habit_completions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id text not null references public.habits(id) on delete cascade,
  date date not null,
  completed integer not null default 1 check (completed in (0,1)),
  value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(habit_id, date)
);

create table public.goals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id text references public.areas(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  start_date date not null,
  end_date date not null,
  progress_mode text not null default 'hybrid' check (progress_mode in ('automatic','manual','hybrid')),
  manual_progress numeric not null default 0 check (manual_progress between 0 and 100),
  manual_adjustment numeric not null default 0 check (manual_adjustment between -100 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.goal_tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id text not null references public.goals(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  unique(goal_id, task_id)
);

create table public.goal_habits (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id text not null references public.goals(id) on delete cascade,
  habit_id text not null references public.habits(id) on delete cascade,
  unique(goal_id, habit_id)
);

alter table public.tasks
  add constraint tasks_goal_fk foreign key (goal_id) references public.goals(id) on delete set null;

create index habits_user_active_idx on public.habits(user_id, active);
create index habit_completions_user_habit_date_idx on public.habit_completions(user_id, habit_id, date);
create index goals_user_idx on public.goals(user_id);
create index goal_tasks_user_goal_idx on public.goal_tasks(user_id, goal_id);
create index goal_habits_user_goal_idx on public.goal_habits(user_id, goal_id);

alter table public.habits enable row level security;
alter table public.habit_completions enable row level security;
alter table public.goals enable row level security;
alter table public.goal_tasks enable row level security;
alter table public.goal_habits enable row level security;

create policy "habits_owner" on public.habits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "habit_completions_owner" on public.habit_completions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "goals_owner" on public.goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "goal_tasks_owner" on public.goal_tasks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "goal_habits_owner" on public.goal_habits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
