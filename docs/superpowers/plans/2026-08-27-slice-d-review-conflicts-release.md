# Slice D — Monthly Review, Conflict UX, and Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable month-end analytics, deterministic summaries, field-level concurrent-edit conflict detection/resolution, installable PWA behavior, cross-device/offline tests, and production deployment validation.

**Architecture:** Current-month analytics are calculated from local SQLite; closed months are frozen into synced `monthly_snapshots` on first review after month end. Conflict-aware entities carry per-field server revisions; each local field edit records the server revision it was based on. PowerSync uploads go through a synchronous Supabase RPC/Edge Function path that merges non-overlapping fields and writes a `conflicts` row instead of overwriting a same-field concurrent edit. The PWA caches the application shell/assets while planner data remains local SQLite.

**Tech Stack:** Existing Slice A-C stack plus Recharts, Supabase SQL/RPC + Edge Function, browser Service Worker/PWA manifest, Playwright multi-context tests.

**Spec:** `docs/superpowers/specs/2026-08-27-personal-planner-design.md`

## Global Constraints

- Any local SQLite write failure must surface a blocking action error without pretending success; network/sync failures keep local state and remain non-blocking.
- Slice A-C exit gates must be green before this plan starts.
- Current month analytics remain live; a closed month becomes immutable once `monthly_snapshots` contains its snapshot.
- Monthly review must remain deterministic; no LLM or external AI call is allowed in MVP 1.
- Same-field conflict detection applies to user-editable scalar fields on `areas`, `tasks`, `habits`, and `goals`. Relation rows and habit-completion rows remain idempotent/LWW because their identities encode the intended relation/date.
- Each conflict-aware field has an authoritative server revision integer. A local edit includes the last server revision observed for that field as `base` plus a unique `edit_id`.
- If `incoming.base == server.rev`, apply the field and increment its server revision. If it differs, preserve the server value, write a conflict row containing both candidate values, and continue processing other fields in the same patch.
- Never return a 4xx solely for a detected write conflict because that would block PowerSync's upload queue; record the conflict and return success for the processed operation.
- Temporary infrastructure/database failures must cause the upload operation to throw/retry.
- Conflict resolution is an explicit new local edit based on the latest authoritative server revision.
- PWA offline use must work after at least one successful online load/authentication on that device; Magic Link itself requires network.
- No push notifications, Google Calendar sync, recurring tasks, AI planner, native mobile app, or shared accounts.

---

## File Structure Locked by This Slice

```text
supabase/migrations/202608270003_review_conflicts.sql
supabase/functions/apply-planner-writes/index.ts
powersync/sync-streams.yaml
src/features/review/
├── monthly-metrics.ts
├── monthly-snapshot-repository.ts
├── monthly-summary.ts
├── monthly-review-page.tsx
├── review-charts.tsx
└── use-monthly-review.ts
src/features/sync/
├── device-id.ts
├── field-versioning.ts
├── conflict-repository.ts
├── conflict-resolver.tsx
└── conflict-types.ts
src/lib/powersync/backend-connector.ts
src/features/tasks/task-repository.ts
src/features/tasks/scheduling.ts
src/features/areas/area-repository.ts
src/features/habits/habit-repository.ts
src/features/goals/goal-repository.ts
src/app/manifest.ts
src/app/offline/page.tsx
src/components/pwa/service-worker-registration.tsx
public/sw.js
tests/e2e/monthly-review.spec.ts
tests/e2e/conflicts.spec.ts
tests/e2e/pwa-offline.spec.ts
```

---

### Task 1: Add conflict and monthly snapshot persistence to cloud/local schemas

**Files:**
- Create: `supabase/migrations/202608270003_review_conflicts.sql`
- Modify: `powersync/sync-streams.yaml`
- Modify: `src/lib/powersync/app-schema.ts`
- Test: `src/lib/powersync/app-schema.test.ts`

**Interfaces:**
- Produces: `conflicts` and `monthly_snapshots` tables synced per user; normalized `field_versions` JSON contract on conflict-aware entities.

- [ ] **Step 1: Extend the local schema test**

Expected tables become:

```ts
expect(Object.keys(AppSchema.tables).sort()).toEqual([
  'areas', 'conflicts', 'goal_habits', 'goal_tasks', 'goals',
  'habit_completions', 'habits', 'monthly_snapshots', 'tasks',
]);
```

- [ ] **Step 2: Create the server migration**

Add:

```sql
create table public.conflicts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('area','task','habit','goal')),
  entity_id text not null,
  field text not null,
  local_value jsonb,
  remote_value jsonb,
  base_revision integer not null,
  remote_revision integer not null,
  edit_id text not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution is null or resolution in ('local','remote')),
  unique(user_id, entity_type, entity_id, field, edit_id)
);

create table public.monthly_snapshots (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\\d{4}-\\d{2}$'),
  metrics jsonb not null,
  goal_progress jsonb not null,
  summary text not null,
  created_at timestamptz not null default now(),
  unique(user_id, month)
);
```

Enable RLS with owner policies for both tables.

Normalize existing conflict-aware `field_versions` server rows so each field entry follows:

```json
{
  "title": { "rev": 0 },
  "description": { "rev": 0 }
}
```

Do not require every field to exist; missing means server revision `0`.

- [ ] **Step 3: Add snapshot/conflict queries to the auto-subscribed PowerSync stream**

```yaml
      - SELECT * FROM conflicts WHERE user_id = auth.user_id()
      - SELECT * FROM monthly_snapshots WHERE user_id = auth.user_id()
```

- [ ] **Step 4: Add local schema columns/tables and verify**

Store `local_value`, `remote_value`, `metrics`, `goal_progress`, and `field_versions` JSON as text locally and parse at repository boundaries.

Run:

```bash
pnpm dlx supabase db reset
pnpm dlx supabase db lint
pnpm test -- src/lib/powersync/app-schema.test.ts
pnpm build
```

- [ ] **Step 5: Commit persistence changes**

```bash
git add supabase powersync src/lib/powersync
 git commit -m "feat: add monthly snapshots and conflict records"
```

---

### Task 2: Implement month metrics, snapshots, charts, and deterministic summary

**Files:**
- Create: `src/features/review/monthly-metrics.ts`
- Create: `src/features/review/monthly-summary.ts`
- Create: `src/features/review/monthly-snapshot-repository.ts`
- Create: `src/features/review/use-monthly-review.ts`
- Create: `src/features/review/review-charts.tsx`
- Create: `src/features/review/monthly-review-page.tsx`
- Test: `src/features/review/monthly-metrics.test.ts`
- Test: `src/features/review/monthly-summary.test.ts`
- Test: `src/features/review/monthly-snapshot-repository.test.ts`

**Interfaces:**
- Produces `MonthlyMetrics`:

```ts
export type MonthlyMetrics = {
  month: string;
  plannedTasks: number;
  completedTasks: number;
  completedTaskItems: Array<{ id: string; title: string; date: string; areaName: string | null }>;
  completionRate: number;
  weeklyCompletion: Array<{ week: number; planned: number; completed: number; rate: number }>;
  areaAttention: Array<{ areaId: string | null; name: string; count: number; share: number }>;
  unfinishedTasks: number;
  rescheduledTasks: number;
  totalReschedules: number;
  habits: Array<{ habitId: string; title: string; completed: number; expected: number; rate: number; currentStreak: number; bestStreak: number }>;
  goals: Array<{ goalId: string; title: string; startProgress: number; endProgress: number; delta: number }>;
};
```

- [ ] **Step 1: Write failing metric tests with a fixed August dataset**

Use a fixture with 10 planned tasks, 8 completed, two areas, one task rescheduled twice, and two habits. Assert:

```ts
expect(metrics.plannedTasks).toBe(10);
expect(metrics.completedTasks).toBe(8);
expect(metrics.completionRate).toBe(80);
expect(metrics.totalReschedules).toBe(2);
expect(metrics.areaAttention.reduce((sum, x) => sum + x.share, 0)).toBe(100);
```

Define `plannedTasks` as tasks whose `scheduled_date` falls inside the month. Backlog-only tasks do not count as planned. `completedTaskItems` contains every task from that month whose status is completed, sorted by completion/scheduled date and then title; this directly powers the user's month-end list of all completed work.

- [ ] **Step 2: Implement monthly metrics using pure functions**

Do not query from inside metric functions. `useMonthlyReview` fetches local rows for the month and passes normalized domain values into pure calculators.

Week buckets use calendar weeks intersecting the month; report them as `1..N` in display order.

- [ ] **Step 3: Write and implement deterministic summary test**

Given the fixed fixture, assert the exact generated string:

```text
В августе выполнено 8 из 10 запланированных задач — 80%. Больше всего внимания получила сфера «Учёба». Самая стабильная привычка — «Английский» (93%). Наибольший прогресс среди целей — «Portfolio»: +23 п.п. 1 задача переносилась хотя бы один раз.
```

The summary generator must choose phrases only from metric values and deterministic tie-breakers (highest value, then title alphabetically).

- [ ] **Step 4: Implement immutable closed-month snapshot behavior**

`getOrCreateMonthlyReview(db, userId, month, today)`:

```text
if month is current/future -> calculate live; do not snapshot
if month is past and snapshot exists -> return snapshot
if month is past and snapshot missing -> calculate once, INSERT snapshot, return inserted snapshot

At planner startup, before enabling normal mutations, call `ensureClosedMonthSnapshot` for the immediately previous calendar month when it has no snapshot. This preserves the prior month baseline before the user starts entering the new month's work. Goal delta uses the previous closed snapshot's `goal_progress[goalId]` as `startProgress` when available; for a goal created during the reviewed month, `startProgress` is 0. `endProgress` is the reviewed month's frozen/live progress.
```

This means later edits do not rewrite an already closed snapshot.

- [ ] **Step 5: Install Recharts and implement review charts**

```bash
pnpm add recharts
```

Render four charts:

```text
Weekly completion -> BarChart
Area attention -> PieChart or RadialBarChart
Goal delta -> BarChart
Habit rates -> horizontal BarChart
```

Every chart also renders an adjacent textual value/table so analytics remain understandable without relying only on color.

- [ ] **Step 6: Build MonthlyReviewPage**

Top cards: planned, completed, completion rate, reschedules. Below: charts, strongest/weakest habits, goals, unfinished count, deterministic summary, and a `Выполненные задачи` section listing every `completedTaskItems` row grouped by date with its life-area color/name.

- [ ] **Step 7: Verify and commit**

```bash
pnpm test -- src/features/review
pnpm lint
pnpm build
 git add src/features/review package.json pnpm-lock.yaml
 git commit -m "feat: add deterministic monthly review"
```

---

### Task 3: Add field-version metadata to every conflict-aware local edit

**Files:**
- Create: `src/features/sync/device-id.ts`
- Create: `src/features/sync/field-versioning.ts`
- Create: `src/features/sync/conflict-types.ts`
- Modify: `src/features/tasks/task-repository.ts`
- Modify: `src/features/tasks/scheduling.ts`
- Modify: `src/features/areas/area-repository.ts`
- Modify: `src/features/habits/habit-repository.ts`
- Modify: `src/features/goals/goal-repository.ts`
- Test: `src/features/sync/field-versioning.test.ts`

**Interfaces:**
- Produces field metadata:

```ts
export type ServerFieldVersion = { rev: number };
export type PendingFieldVersion = { rev: number; base: number; editId: string; deviceId: string };
export type FieldVersions = Record<string, ServerFieldVersion | PendingFieldVersion>;
```

`rev` remains the last server revision seen locally; `base` records that same revision for the pending edit.

- [ ] **Step 1: Write failing metadata tests**

```ts
it('stamps only changed fields with their last observed server revision', () => {
  const current = { title: { rev: 4 }, scheduled_date: { rev: 9 } };
  const next = stampFieldEdits(current, ['title'], 'device-a', () => 'edit-1');
  expect(next.title).toEqual({ rev: 4, base: 4, editId: 'edit-1', deviceId: 'device-a' });
  expect(next.scheduled_date).toEqual({ rev: 9 });
});
```

- [ ] **Step 2: Implement a stable per-installation device id**

`getDeviceId()` reads `planner.deviceId` from `localStorage`; if absent, writes `crypto.randomUUID()` and returns it. It is not a secret and is used only to identify the source of edits.

- [ ] **Step 3: Implement `stampFieldEdits`**

For every changed field, preserve the last `rev` and add `base: rev`, `editId`, and `deviceId`. Never increment server revision on the client.

- [ ] **Step 4: Route every repository update through a shared conflict-aware update helper**

Example task title update:

```ts
await updateConflictAwareEntity(db, {
  table: 'tasks',
  id: task.id,
  currentVersions: task.fieldVersions,
  changes: { title: nextTitle },
  now,
  deviceId: getDeviceId(),
});
```

The helper updates changed scalar columns plus the serialized `field_versions` in one local SQL statement.

Task completion stamps `status` and `completed_at`; calendar movement stamps `scheduled_date`, `start_at`, `end_at`, `all_day`, and `reschedule_count` as applicable. Habit/goal/area edits stamp only user-editable changed fields.

- [ ] **Step 5: Run repository regression tests**

```bash
pnpm test -- src/features/sync/field-versioning.test.ts src/features/tasks src/features/habits src/features/goals
```

Expected: PASS.

- [ ] **Step 6: Commit local edit metadata**

```bash
git add src/features
 git commit -m "feat: stamp field revisions on local edits"
```

---

### Task 4: Replace direct Supabase upload with synchronous conflict-aware batch writes

**Files:**
- Create: `supabase/functions/apply-planner-writes/index.ts`
- Modify: `supabase/migrations/202608270003_review_conflicts.sql`
- Modify: `src/lib/powersync/backend-connector.ts`
- Test: `supabase/functions/apply-planner-writes/index.test.ts`
- Test: `tests/e2e/conflicts.spec.ts` (different-field case first)

**Interfaces:**
- Client sends:

```ts
export type PlannerWriteOperation = {
  op: 'PUT' | 'PATCH' | 'DELETE';
  table: 'areas' | 'tasks' | 'habits' | 'habit_completions' | 'goals' | 'goal_tasks' | 'goal_habits' | 'monthly_snapshots';
  id: string;
  data?: Record<string, unknown>;
};
```

- Server returns `200` with `{ processed: number, conflicts: number }` after applying the whole PowerSync CRUD transaction synchronously.

- [ ] **Step 1: Add a Postgres RPC that applies one conflict-aware patch atomically**

Create SQL function `public.apply_conflict_aware_patch(p_table text, p_id text, p_changes jsonb, p_versions jsonb)` as `security invoker`. It must derive `auth.uid()` and reject rows whose `user_id` differs.

For each changed scalar field:

```text
incomingBase = p_versions[field].base
serverRev = row.field_versions[field].rev default 0

if incomingBase == serverRev:
    apply incoming field
    set field_versions[field] = {rev: serverRev + 1}
else:
    keep server field value
    insert conflict(local_value=incoming, remote_value=server, base_revision=incomingBase, remote_revision=serverRev, edit_id=...)
```

Update non-conflicting fields in the same call. Return JSON containing the number of conflicts created.

- [ ] **Step 2: Implement Edge Function request validation**

`apply-planner-writes` must require an authenticated Supabase JWT and pass it to its Supabase client so RLS/RPC sees `auth.uid()`.

It accepts one PowerSync transaction batch. For conflict-aware table `PATCH`, call `apply_conflict_aware_patch`. For relation/completion `PUT/PATCH`, use upsert/update under RLS. For deletes, delete by id under RLS.

A detected conflict is not an HTTP error. A database/network failure returns 5xx so the client retries.

- [ ] **Step 3: Write server tests for different-field merge**

Scenario:

```text
Server: title rev 4, scheduled_date rev 7
Device A changes title based 4 -> uploads -> server title rev 5
Device B changes scheduled_date based 7 -> uploads -> server scheduled_date rev 8
Expected: both values applied, conflicts table empty
```

- [ ] **Step 4: Change PowerSync `uploadData()` to send the transaction batch to Edge Function**

Do not call table `.update()` directly anymore. Serialize PowerSync CRUD operations and call:

```ts
await supabase.functions.invoke('apply-planner-writes', { body: { operations } });
```

Only call `transaction.complete()` after a successful response. Throw on function/network failure.

- [ ] **Step 5: Run server/integration tests and commit**

```bash
pnpm test -- supabase/functions/apply-planner-writes/index.test.ts
pnpm test:e2e -- tests/e2e/conflicts.spec.ts --grep "different fields"
 git add supabase src/lib/powersync tests/e2e/conflicts.spec.ts
 git commit -m "feat: merge non-overlapping offline edits"
```

---

### Task 5: Detect same-field conflicts and add explicit resolver UI

**Files:**
- Create: `src/features/sync/conflict-repository.ts`
- Create: `src/features/sync/conflict-resolver.tsx`
- Modify: `src/components/sync/sync-status.tsx`
- Modify: `src/components/app-shell/app-shell.tsx`
- Modify: `tests/e2e/conflicts.spec.ts`
- Test: `src/features/sync/conflict-resolver.test.tsx`

**Interfaces:**
- Produces:
  - `listOpenConflicts(db, userId): Promise<Conflict[]>`
  - `resolveConflict(db, conflict, choice: 'local' | 'remote'): Promise<void>`

- [ ] **Step 1: Write failing same-field server test**

Scenario:

```text
Server title = "Gym", rev 4
Device A candidate = "Gym + cardio", base 4 -> accepted, rev 5
Device B candidate = "Yoga", base 4 -> not applied
Expected conflict:
  local_value = "Yoga"
  remote_value = "Gym + cardio"
  base_revision = 4
  remote_revision = 5
```

The write endpoint still returns HTTP 200 so PowerSync completes the upload transaction.

- [ ] **Step 2: Write failing resolver component test**

```tsx
render(<ConflictResolver conflict={conflict} />);
expect(screen.getByText('Gym + cardio')).toBeInTheDocument();
expect(screen.getByText('Yoga')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Использовать мою версию' }));
expect(resolveConflict).toHaveBeenCalledWith(conflict, 'local');
```

- [ ] **Step 3: Implement resolution semantics**

`remote` choice:

```text
Do not change entity value.
Set conflicts.resolution='remote', resolved_at=now.
```

`local` choice:

```text
Read the latest authoritative entity row now synced locally.
Create a NEW local field edit with candidate `local_value`, base = latest field_versions[field].rev.
Mark conflict resolution='local', resolved_at=now.
PowerSync uploads this as a normal new edit.
```

This prevents a resolver from bypassing concurrency checks.

- [ ] **Step 4: Expose Conflict sync status**

If any unresolved conflict exists, header status displays `Conflict` instead of `Synced`. Clicking it opens the resolver list. Offline still has priority when not connected; use:

```text
!connected -> Offline
unresolvedConflictCount > 0 -> Conflict
pendingUploads -> Syncing
else -> Synced
```

- [ ] **Step 5: Complete multi-context conflict E2E**

Use two Playwright browser contexts with the same user:

```text
1. Both sync title "Gym" rev 4.
2. Both go offline.
3. A edits title -> "Gym + cardio".
4. B edits same title -> "Yoga".
5. A reconnects and reaches Synced.
6. B reconnects.
7. B receives Conflict state.
8. Resolver shows both candidates.
9. Choose local candidate "Yoga".
10. Both devices eventually show "Yoga" and no unresolved conflicts.
```

Also retain the different-field merge case from Task 4.

- [ ] **Step 6: Verify and commit**

```bash
pnpm test -- src/features/sync
pnpm test:e2e -- tests/e2e/conflicts.spec.ts
pnpm lint
pnpm build
 git add src/features/sync src/components tests/e2e/conflicts.spec.ts
 git commit -m "feat: resolve true same-field sync conflicts"
```

---

### Task 6: Make the application installable and cold-start usable offline

**Files:**
- Create: `src/app/manifest.ts`
- Create: `src/app/offline/page.tsx`
- Create: `src/components/pwa/service-worker-registration.tsx`
- Create: `public/sw.js`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Modify: `src/app/layout.tsx`
- Create: `tests/e2e/pwa-offline.spec.ts`

**Interfaces:**
- Produces: valid web app manifest, standalone install metadata, service worker registration, cached shell/static assets, offline fallback, preserved local SQLite data.

- [ ] **Step 1: Implement manifest metadata**

`src/app/manifest.ts` returns:

```ts
{
  name: 'Мой планер',
  short_name: 'Планер',
  start_url: '/planner',
  display: 'standalone',
  background_color: '#F8FAFC',
  theme_color: '#FFFFFF',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
}
```

Generate simple app icons from an original geometric planner mark; do not use third-party logos.

- [ ] **Step 2: Implement service worker caching strategy**

`public/sw.js` uses versioned cache `planner-shell-v1`.

Rules:

```text
install: cache /offline and known app icon assets
activate: delete older planner-shell-* caches
fetch navigation: network-first; cache successful /planner navigation; on failure return cached /planner, otherwise /offline
fetch same-origin static JS/CSS/font/image: cache-first with background refresh
never intercept Supabase or PowerSync cross-origin API requests
```

- [ ] **Step 3: Register the service worker only in production-capable browser context**

`ServiceWorkerRegistration` calls:

```ts
navigator.serviceWorker.register('/sw.js');
```

from an effect when `'serviceWorker' in navigator`.

- [ ] **Step 4: Write offline cold-start E2E**

```text
1. Open /planner online and wait for Synced.
2. Create an offline-test task.
3. Reload once online to ensure shell is cached.
4. Set context offline.
5. Navigate/reload /planner.
6. Planner shell loads rather than browser network error.
7. Existing local task is visible.
8. Create another task; it remains visible after offline reload.
```

- [ ] **Step 5: Run Lighthouse/PWA smoke and build**

```bash
pnpm build
pnpm start
```

In Chromium DevTools/Application verify manifest has no installability errors, service worker is active, and standalone launch uses `/planner`.

- [ ] **Step 6: Commit PWA hardening**

```bash
git add src/app/manifest.ts src/app/offline src/components/pwa public tests/e2e/pwa-offline.spec.ts
 git commit -m "feat: make planner installable and offline-capable"
```

---

### Task 7: Finish mobile navigation, full E2E regression, and Vercel deployment validation

**Files:**
- Create: `src/components/app-shell/mobile-nav.tsx`
- Modify: `src/components/app-shell/app-shell.tsx`
- Create: `src/app/planner/calendar/page.tsx`
- Create: `src/app/planner/tasks/page.tsx`
- Create: `src/app/planner/goals/page.tsx`
- Create: `src/app/planner/review/page.tsx`
- Create: `tests/e2e/monthly-review.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: mobile PWA navigation `Сегодня | Календарь | Задачи | Цели | Итоги`, monthly-review E2E, desktop/mobile Playwright projects, documented deployment/env setup.

- [ ] **Step 1: Add mobile bottom navigation**

At widths below the desktop breakpoint, hide three-column simultaneous layout and expose:

```text
Сегодня -> /planner
Календарь -> /planner/calendar
Задачи -> /planner/tasks
Цели -> /planner/goals
Итоги -> /planner/review
```

`Сегодня` contains today's habits, selected-day task list, and next scheduled items. Desktop keeps the three-column dashboard.

- [ ] **Step 2: Add desktop and mobile Playwright projects**

Use Chromium desktop and a mobile viewport equivalent to a modern iPhone-class width. Do not depend on WebKit for CI correctness; perform Safari/iOS manual check separately because the local SQLite VFS has browser-specific behavior.

- [ ] **Step 3: Add monthly review E2E**

Seed a deterministic closed month and assert visible totals, area distribution labels, habit rates, goal delta, and the exact deterministic summary. Reopen after editing old underlying task data and assert the existing closed snapshot does not change.

- [ ] **Step 4: Run the full quality gate**

```bash
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
```

Expected: all commands exit `0`.

- [ ] **Step 5: Perform manual browser/device matrix**

Verify at minimum:

```text
Chrome desktop: online/offline + install
Safari desktop: local DB survives reload + multi-tab smoke
iPhone Safari/PWA: install, offline launch, task/habit edits
Second device/browser: same account sync convergence
```

- [ ] **Step 6: Document deployment configuration**

`README.md` must list these required Vercel variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_POWERSYNC_URL
```

Also document Supabase Site URL/redirect URL for production Magic Links and that the PowerSync Cloud instance must have Supabase Auth enabled with the production Sync Streams deployed.

- [ ] **Step 7: Deploy to Vercel and verify production**

After deployment:

```text
1. Request Magic Link using production URL.
2. Open planner and wait for Synced.
3. Install PWA.
4. Go offline; create task + complete habit.
5. Reconnect and verify Supabase receives data.
6. Open a second device and verify rows sync down.
7. Run a same-field conflict smoke test and resolve it.
8. Open Monthly Review.
```

- [ ] **Step 8: Commit release state**

```bash
git add src tests playwright.config.ts README.md
 git commit -m "feat: complete planner MVP release"
```

## Slice D / MVP Exit Gate

```text
[ ] Current month review is live; closed month snapshots remain stable.
[ ] Review includes a complete visible list of all tasks completed in the reviewed month.
[ ] Task, habit, area, and goal metrics match deterministic tests.
[ ] Non-overlapping concurrent edits merge automatically.
[ ] Same-field concurrent edits create a visible, resolvable conflict.
[ ] Resolving "local" creates a fresh revision-aware edit; resolving "remote" preserves authoritative value.
[ ] PWA installs and cold-starts offline after a prior successful online visit.
[ ] Mobile navigation exposes Today / Calendar / Tasks / Goals / Review.
[ ] Desktop and mobile primary flows pass Playwright.
[ ] Chrome/Safari/iPhone manual matrix is complete.
[ ] Production Magic Link, PowerSync, Supabase, and Vercel configuration are verified.
[ ] Full `pnpm test`, `pnpm lint`, `pnpm build`, and `pnpm test:e2e` pass.
```
