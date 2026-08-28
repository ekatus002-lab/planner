# Slice C — Habits and Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add offline-first habits, daily completion/streak statistics, goals, task/habit goal links, and automatic/manual/hybrid progress that recalculates immediately from local data.

**Architecture:** Habits and goals are separate feature modules sharing the same local-first PowerSync database. Habit definitions produce per-date completion rows rather than generating recurring tasks. Goal progress is a deterministic domain calculation over linked tasks and expected habit occurrences, with an optional manual adjustment for hybrid mode.

**Tech Stack:** Existing Slice A/B stack, PowerSync local SQLite, React, TypeScript, date-fns, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-personal-planner-design.md`

## Global Constraints

- Any local SQLite write failure must surface a blocking action error without pretending success; network/sync failures keep local state and remain non-blocking.
- Slice A and B exit gates must be green before this plan starts.
- Habits are not tasks and must never be materialized as one task per day.
- One habit completion record represents one habit on one local calendar date; enforce uniqueness on `(habit_id, date)`.
- A habit's active weekdays use ISO weekday numbers `1..7` where Monday is `1` and Sunday is `7`.
- Streak calculations use local calendar dates, not 24-hour timestamp differences.
- Goal progress is always clamped to `[0, 100]`.
- `automatic` progress is derived only; `manual` progress is explicitly stored; `hybrid` = derived automatic progress + `manual_adjustment`, clamped to `[0,100]`.
- For automatic habit contribution, count expected scheduled occurrences in the goal period up to `min(today, goal.end_date)` and count completed occurrences within the same window.
- Task contribution is completed linked tasks / all linked tasks. If a goal has only tasks, tasks receive 100% weight. If it has only habits, habits receive 100% weight. If it has both, use a 50/50 weight.
- No AI-generated goal planning, recurring tasks, push reminders, or notifications.

---

## File Structure Locked by This Slice

```text
supabase/migrations/202608270002_habits_goals.sql
powersync/sync-streams.yaml
src/lib/powersync/app-schema.ts
src/features/habits/
├── habit-types.ts
├── habit-repository.ts
├── habit-metrics.ts
├── habit-card.tsx
├── habits-panel.tsx
├── habit-form.tsx
└── use-habits.ts
src/features/goals/
├── goal-types.ts
├── goal-repository.ts
├── goal-progress.ts
├── goal-card.tsx
├── goals-panel.tsx
├── goal-form.tsx
└── use-goals.ts
src/components/app-shell/app-shell.tsx
tests/e2e/habits-goals.spec.ts
```

---

### Task 1: Add habit and goal tables to Supabase, RLS, PowerSync streams, and local schema

**Files:**
- Create: `supabase/migrations/202608270002_habits_goals.sql`
- Modify: `powersync/sync-streams.yaml`
- Modify: `src/lib/powersync/app-schema.ts`
- Test: `src/lib/powersync/app-schema.test.ts`

**Interfaces:**
- Consumes: existing user/areas/tasks tables.
- Produces Postgres + local tables `habits`, `habit_completions`, `goals`, `goal_tasks`, `goal_habits`; adds a valid FK target for `tasks.goal_id` through a migration-safe constraint.

- [ ] **Step 1: Extend the failing schema test**

Update the expected local tables:

```ts
expect(Object.keys(AppSchema.tables).sort()).toEqual([
  'areas',
  'goal_habits',
  'goal_tasks',
  'goals',
  'habit_completions',
  'habits',
  'tasks',
]);
```

Run:

```bash
pnpm test -- src/lib/powersync/app-schema.test.ts
```

Expected: FAIL because the new tables are absent.

- [ ] **Step 2: Create the Supabase migration**

`supabase/migrations/202608270002_habits_goals.sql` must create:

```sql
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
```

Enable RLS on all five new tables and add `for all` policies with both `using (user_id = auth.uid())` and `with check (user_id = auth.uid())`.

- [ ] **Step 3: Extend PowerSync Sync Streams**

Add these queries under the existing auto-subscribed `user_planner_data` stream:

```yaml
      - SELECT * FROM habits WHERE user_id = auth.user_id()
      - SELECT * FROM habit_completions WHERE user_id = auth.user_id()
      - SELECT * FROM goals WHERE user_id = auth.user_id()
      - SELECT * FROM goal_tasks WHERE user_id = auth.user_id()
      - SELECT * FROM goal_habits WHERE user_id = auth.user_id()
```

- [ ] **Step 4: Extend the PowerSync `AppSchema`**

Use matching text/integer/real columns. JSON weekday arrays are stored as text in local SQLite and parsed at the repository boundary.

- [ ] **Step 5: Verify migration and schema**

```bash
pnpm dlx supabase db reset
pnpm dlx supabase db lint
pnpm test -- src/lib/powersync/app-schema.test.ts
pnpm build
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit schema expansion**

```bash
git add supabase powersync src/lib/powersync
 git commit -m "feat: add habits and goals data model"
```

---

### Task 2: Implement habit repository and expected-occurrence logic

**Files:**
- Create: `src/features/habits/habit-types.ts`
- Create: `src/features/habits/habit-repository.ts`
- Create: `src/features/habits/habit-metrics.ts`
- Test: `src/features/habits/habit-repository.test.ts`
- Test: `src/features/habits/habit-metrics.test.ts`

**Interfaces:**
- Produces:
  - `createHabit(db, input): Promise<Habit>`
  - `setHabitCompletion(db, userId, habitId, date, completed, value?): Promise<void>`
  - `listHabitsWithCompletions(db, userId, startDate, endDate): Promise<HabitWithCompletions[]>`
  - `isHabitScheduledOn(habit, date): boolean`
  - `expectedHabitDates(habit, startDate, endDate): string[]`

- [ ] **Step 1: Define habit types**

```ts
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
};

export type HabitCompletion = {
  id: string;
  userId: string;
  habitId: string;
  date: string;
  completed: boolean;
  value: number | null;
};
```

- [ ] **Step 2: Write failing date-schedule tests**

```ts
it('matches ISO weekdays and date boundaries', () => {
  const habit = makeHabit({ weekdays: [1, 3, 5], startDate: '2026-08-24', endDate: '2026-08-31' });
  expect(isHabitScheduledOn(habit, '2026-08-24')).toBe(true); // Monday
  expect(isHabitScheduledOn(habit, '2026-08-25')).toBe(false);
  expect(isHabitScheduledOn(habit, '2026-09-02')).toBe(false);
});
```

- [ ] **Step 3: Write failing completion upsert test**

```ts
await setHabitCompletion(db, 'user-1', 'habit-1', '2026-08-27', true);
await setHabitCompletion(db, 'user-1', 'habit-1', '2026-08-27', false);
const rows = await listHabitCompletions(db, 'user-1', '2026-08-27', '2026-08-27');
expect(rows).toHaveLength(1);
expect(rows[0].completed).toBe(false);
```

- [ ] **Step 4: Implement repository and metrics**

Use `INSERT ... ON CONFLICT(habit_id, date) DO UPDATE` locally so toggling a habit does not create duplicate day records.

`expectedHabitDates` iterates inclusive local dates with `eachDayOfInterval` and filters using ISO weekday plus habit start/end boundaries.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test -- src/features/habits/habit-repository.test.ts src/features/habits/habit-metrics.test.ts
 git add src/features/habits
 git commit -m "feat: add offline habit repository and scheduling rules"
```

---

### Task 3: Implement streak and completion statistics

**Files:**
- Modify: `src/features/habits/habit-metrics.ts`
- Test: `src/features/habits/habit-metrics.test.ts`

**Interfaces:**
- Produces:
  - `calculateCurrentStreak(habit, completions, today): number`
  - `calculateBestStreak(habit, completions, throughDate): number`
  - `calculateHabitCompletionRate(habit, completions, startDate, endDate): number`

- [ ] **Step 1: Write failing streak tests**

For a Mon/Wed/Fri habit:

```ts
it('does not break a streak on unscheduled days', () => {
  const habit = makeHabit({ weekdays: [1, 3, 5] });
  const completed = ['2026-08-21', '2026-08-24', '2026-08-26'].map(makeCompletion);
  expect(calculateCurrentStreak(habit, completed, '2026-08-27')).toBe(3);
});
```

Also assert a missed scheduled Wednesday breaks the streak even if Thursday is unscheduled.

- [ ] **Step 2: Verify failure**

```bash
pnpm test -- src/features/habits/habit-metrics.test.ts
```

- [ ] **Step 3: Implement streaks over expected dates, not raw days**

Algorithm:

```text
1. Compute expected scheduled dates up to `today`.
2. Walk expected dates backwards for current streak.
3. Count consecutive expected dates whose completion is completed=true.
4. For best streak, scan expected dates forward and keep max consecutive completed count.
```

Completion rate is `completed expected dates / expected dates * 100`, rounded to nearest integer; return `0` when there are no expected dates.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test -- src/features/habits/habit-metrics.test.ts
 git add src/features/habits/habit-metrics.ts src/features/habits/habit-metrics.test.ts
 git commit -m "feat: calculate habit streaks and completion rates"
```

---

### Task 4: Build the right-side Habits panel

**Files:**
- Create: `src/features/habits/use-habits.ts`
- Create: `src/features/habits/habit-card.tsx`
- Create: `src/features/habits/habit-form.tsx`
- Create: `src/features/habits/habits-panel.tsx`
- Modify: `src/components/app-shell/app-shell.tsx`
- Test: `src/features/habits/habits-panel.test.tsx`

**Interfaces:**
- Consumes: habit repository and metrics.
- Produces: today's habit list, completion toggle/value, current streak, week completion indicator, new/edit habit form.

- [ ] **Step 1: Write failing today's-habits test**

```tsx
render(<HabitsPanel userId="user-1" today="2026-08-27" />);
expect(screen.getByText('Английский')).toBeInTheDocument();
expect(screen.queryByText('Тренировка Пн/Ср/Пт')).not.toBeInTheDocument();
```

Seed the second habit so Thursday is not scheduled.

- [ ] **Step 2: Implement watched habit/completion query**

Watch active habits plus completion rows for the current week/month. Filter today's display with `isHabitScheduledOn`.

- [ ] **Step 3: Implement habit form**

Fields:

```text
Название
Сфера жизни
Дни недели [Пн..Вс]
Дата начала (optional)
Дата окончания (optional)
Количественная цель + единица (optional)
Активна
```

Reject an empty weekday set because such a habit can never be due.

- [ ] **Step 4: Implement HabitCard**

Each card shows category color, title, today's checkbox/value, `streak N`, and current-week rate. Completing it writes locally and visibly updates without waiting for network.

- [ ] **Step 5: Replace Slice A right-column placeholder**

Use `HabitsPanel` in the desktop app shell.

- [ ] **Step 6: Verify and commit**

```bash
pnpm test -- src/features/habits/habits-panel.test.tsx
pnpm lint
pnpm build
 git add src/features/habits src/components/app-shell
 git commit -m "feat: add daily habits panel"
```

---

### Task 5: Implement goal repository and deterministic progress calculation

**Files:**
- Create: `src/features/goals/goal-types.ts`
- Create: `src/features/goals/goal-repository.ts`
- Create: `src/features/goals/goal-progress.ts`
- Test: `src/features/goals/goal-repository.test.ts`
- Test: `src/features/goals/goal-progress.test.ts`

**Interfaces:**
- Produces:
  - `createGoal(db, input): Promise<Goal>`
  - `linkTaskToGoal(db, userId, goalId, taskId): Promise<void>`
  - `linkHabitToGoal(db, userId, goalId, habitId): Promise<void>`
  - `calculateGoalProgress(input): GoalProgressResult`

`GoalProgressResult`:

```ts
export type GoalProgressResult = {
  automatic: number;
  manual: number;
  displayed: number;
  taskRate: number | null;
  habitRate: number | null;
};
```

- [ ] **Step 1: Write failing progress mode tests**

```ts
it('uses manual progress for manual goals', () => {
  expect(calculateGoalProgress({ mode: 'manual', manualProgress: 72, manualAdjustment: 0, tasks: [], habits: [], today }).displayed).toBe(72);
});

it('weights tasks and habits equally when both exist', () => {
  const result = calculateGoalProgress({
    mode: 'automatic', manualProgress: 0, manualAdjustment: 0,
    tasks: [completedTask(), openTask()],
    habits: [{ habit: dailyHabit(), completions: completions(8, 10) }],
    today,
  });
  expect(result.taskRate).toBe(50);
  expect(result.habitRate).toBe(80);
  expect(result.displayed).toBe(65);
});

it('applies hybrid adjustment and clamps to 100', () => {
  expect(calculateGoalProgress({ ...automatic90, mode: 'hybrid', manualAdjustment: 15 }).displayed).toBe(100);
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm test -- src/features/goals/goal-progress.test.ts
```

- [ ] **Step 3: Implement exact progress formula**

```ts
const automatic = hasTasks && hasHabits
  ? Math.round((taskRate! + habitRate!) / 2)
  : hasTasks
    ? taskRate!
    : hasHabits
      ? habitRate!
      : 0;

const displayed = mode === 'manual'
  ? clamp(manualProgress, 0, 100)
  : mode === 'hybrid'
    ? clamp(automatic + manualAdjustment, 0, 100)
    : automatic;
```

- [ ] **Step 4: Implement relation writes with ownership-safe local rows**

When linking task/habit to goal, insert a text UUID relation row with the same `user_id`. Also update `tasks.goal_id` for task links so task forms can show a fast direct relationship while `goal_tasks` remains the normalized relation used by analytics.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test -- src/features/goals/goal-progress.test.ts src/features/goals/goal-repository.test.ts
 git add src/features/goals
 git commit -m "feat: add goal progress domain model"
```

---

### Task 6: Build Goals panel and goal/task/habit linking UX

**Files:**
- Create: `src/features/goals/use-goals.ts`
- Create: `src/features/goals/goal-card.tsx`
- Create: `src/features/goals/goal-form.tsx`
- Create: `src/features/goals/goals-panel.tsx`
- Modify: `src/components/app-shell/app-shell.tsx`
- Modify: `src/features/tasks/task-form.tsx`
- Modify: `src/features/habits/habit-form.tsx`
- Test: `src/features/goals/goals-panel.test.tsx`

**Interfaces:**
- Consumes: local goals, linked task/habit rows, progress calculator.
- Produces: left-column goal cards, create/edit goal form, link selectors in task/habit editors.

- [ ] **Step 1: Write failing goal-card reactive progress test**

```tsx
render(<GoalsPanel userId="user-1" today="2026-08-27" />);
expect(screen.getByText('50%')).toBeInTheDocument();
await completeLinkedTask('task-2');
expect(await screen.findByText('100%')).toBeInTheDocument();
```

Use local test DB so the test proves watched query recomputation.

- [ ] **Step 2: Implement goal form**

Fields:

```text
Название
Описание
Сфера жизни
Начало
Окончание
Progress mode: automatic / manual / hybrid
Manual progress (only manual)
Manual adjustment (only hybrid)
```

- [ ] **Step 3: Implement GoalsPanel cards**

Cards show title, area color, date range, progress bar, displayed percent, and a compact source explanation such as `Задачи 4/6 • Привычки 82%`.

- [ ] **Step 4: Add goal selectors to task and habit forms**

Task form: optional single goal selector. Habit form: optional goal links with multi-select if needed; relation writes happen through goal repository, not direct SQL from components.

- [ ] **Step 5: Verify and commit**

```bash
pnpm test -- src/features/goals/goals-panel.test.tsx
pnpm lint
pnpm build
 git add src/features/goals src/features/tasks/task-form.tsx src/features/habits/habit-form.tsx src/components/app-shell
 git commit -m "feat: add goals UI and planner links"
```

---

### Task 7: Prove offline habits and goal recalculation end-to-end

**Files:**
- Create: `tests/e2e/habits-goals.spec.ts`

**Interfaces:**
- Consumes: completed Slice C UI.
- Produces: proof that habit completion and linked-goal progress work offline and synchronize later.

- [ ] **Step 1: Write the E2E workflow**

```text
1. Create goal "English B2" in hybrid mode, adjustment 0.
2. Create daily habit "English 30 min" linked to the goal.
3. Create two tasks linked to the goal; complete one.
4. Confirm displayed goal progress reflects task + habit formula.
5. Go offline.
6. Complete today's English habit.
7. Confirm streak/rate and goal progress update immediately while Offline status is visible.
8. Reload while offline; completion and progress remain.
9. Reconnect; wait for Synced.
10. Open second browser profile and confirm completion + goal progress converge.
```

- [ ] **Step 2: Run complete Slice C verification**

```bash
pnpm test
pnpm lint
pnpm build
pnpm test:e2e -- tests/e2e/habits-goals.spec.ts
```

Expected: all commands exit `0`.

- [ ] **Step 3: Commit Slice C exit state**

```bash
git add tests/e2e/habits-goals.spec.ts
 git commit -m "test: verify offline habits and goal progress"
```

## Slice C Exit Gate

```text
[ ] Habit definitions sync and work offline.
[ ] Habit completion uses one row per habit/date.
[ ] Current/best streak ignores unscheduled days correctly.
[ ] Weekly/monthly rate uses expected scheduled occurrences as denominator.
[ ] Goals support automatic/manual/hybrid progress exactly as specified.
[ ] Linked task/habit changes recalculate goal cards immediately from local data.
[ ] Goal and habit UI work while Offline and synchronize after reconnect.
[ ] Slice C tests/build/E2E pass.
```
