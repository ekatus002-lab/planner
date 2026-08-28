create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.areas (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  archived integer not null default 0 check (archived in (0, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index areas_user_name_active_idx
  on public.areas(user_id, lower(name))
  where archived = 0;

create table public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id text references public.areas(id) on delete set null,
  goal_id text,
  title text not null check (char_length(title) between 1 and 240),
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'completed')),
  scheduled_date date,
  start_at timestamptz,
  end_at timestamptz,
  all_day integer not null default 0 check (all_day in (0, 1)),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  completed_at timestamptz,
  reschedule_count integer not null default 0 check (reschedule_count >= 0),
  sort_order real not null default 0,
  field_versions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_time_range_valid check (
    (start_at is null and end_at is null)
    or (start_at is not null and end_at is not null and end_at > start_at)
  )
);

create index tasks_user_date_idx on public.tasks(user_id, scheduled_date);
create index tasks_user_status_idx on public.tasks(user_id, status);

alter table public.profiles enable row level security;
alter table public.areas enable row level security;
alter table public.tasks enable row level security;

create policy "profiles_self" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "areas_owner" on public.areas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "tasks_owner" on public.tasks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id) values (new.id);
  insert into public.areas(id, user_id, name, color, sort_order) values
    (gen_random_uuid()::text, new.id, 'Внешность', '#EC8FB6', 10),
    (gen_random_uuid()::text, new.id, 'Спорт и питание', '#70B96E', 20),
    (gen_random_uuid()::text, new.id, 'Учёба', '#6B9EEB', 30),
    (gen_random_uuid()::text, new.id, 'Карьера', '#9B75E8', 40),
    (gen_random_uuid()::text, new.id, 'Другое', '#9CA3AF', 50);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
