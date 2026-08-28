# Slice A — Foundation and Local Task System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the installable Next.js shell, passwordless auth, PowerSync local SQLite plumbing, life areas, unified tasks, backlog UI, offline CRUD, and sync status.

**Architecture:** The browser UI reads and writes planner data only through a local PowerSync-managed SQLite database. Supabase provides Auth and the authoritative Postgres store; PowerSync streams the signed-in user's rows down and queues local mutations for upload through Supabase. Slice A deliberately stops before calendar scheduling UI, habits, goals, analytics, and custom conflict resolution.

**Tech Stack:** Next.js 16.3.3, React, TypeScript, pnpm, Tailwind CSS, shadcn/ui, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), PowerSync Web (`@powersync/web`, `@powersync/react`, `@journeyapps/wa-sqlite`), Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-personal-planner-design.md`

## Global Constraints

- Use Next.js App Router under `src/app`; minimum Next.js version is `16.3.3` because the August 2026 security release fixes critical vulnerabilities.
- Use `pnpm` and commit `pnpm-lock.yaml`.
- Enable TypeScript strict mode and keep domain APIs typed; do not pass raw SQLite rows directly into components.
- Planner domain reads and writes must go through the local PowerSync database after authentication; do not read task/area rows directly from Supabase in UI components.
- Use client-generated text UUIDs via `crypto.randomUUID()` for syncable entities.
- Store timestamps as UTC ISO-8601 text; store date-only values as `YYYY-MM-DD` text.
- Use Supabase RLS as the authoritative write security boundary and PowerSync Sync Streams as the download filter.
- Use `OPFSCoopSyncVFS` when available for Safari/iOS reliability and multi-tab support; fall back to PowerSync's default web storage only when the browser lacks the needed OPFS capabilities.
- Keep one `PowerSyncDatabase` instance per database filename.
- In this slice, ordinary server-write conflicts use normal PowerSync/Supabase behavior. Custom same-field conflict detection belongs to Slice D.
- A local database write failure is blocking for that action: keep the form/dialog open and render `role=alert` with the error; a sync/network failure is non-blocking and is represented by sync status.
- No calendar library, habits, goals, charts, notifications, AI, subtasks, attachments, recurring tasks, or Google Calendar integration in this slice.

---

## File Structure Locked by This Slice

```text
.
├── .env.example
├── package.json
├── pnpm-lock.yaml
├── next.config.ts
├── playwright.config.ts
├── vitest.config.ts
├── powersync/
│   └── sync-streams.yaml
├── supabase/
│   └── migrations/
│       └── 202608270001_foundation.sql
├── src/
│   ├── app/
│   │   ├── auth/
│   │   │   ├── confirm/route.ts
│   │   │   └── page.tsx
│   │   ├── planner/page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── app-shell/app-shell.tsx
│   │   ├── auth/magic-link-form.tsx
│   │   └── sync/sync-status.tsx
│   ├── features/
│   │   ├── areas/
│   │   │   ├── area-repository.ts
│   │   │   ├── area-types.ts
│   │   │   └── use-areas.ts
│   │   └── tasks/
│   │       ├── backlog-panel.tsx
│   │       ├── task-form.tsx
│   │       ├── task-repository.ts
│   │       ├── task-types.ts
│   │       └── use-backlog-tasks.ts
│   ├── lib/
│   │   ├── powersync/
│   │   │   ├── app-schema.ts
│   │   │   ├── backend-connector.ts
│   │   │   ├── database.ts
│   │   │   └── system-provider.tsx
│   │   └── supabase/
│   │       ├── client.ts
│   │       ├── server.ts
│   │       └── proxy.ts
│   └── test/
│       ├── setup.ts
│       └── sqlite-test-db.ts
└── tests/
    └── e2e/
        ├── auth.spec.ts
        └── offline-backlog.spec.ts
```

---

### Task 1: Scaffold the secured Next.js application and test harness

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Test: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: none.
- Produces: a Next.js 16.3.3 App Router project, `pnpm test`, `pnpm test:e2e`, and the root redirect contract `GET / -> /planner` or `/auth` based on session handling added in Task 3.

- [ ] **Step 1: Scaffold the app with the exact framework baseline**

The repository already contains approved `docs/`, so scaffold into a temporary child directory and merge the generated app without touching `.git` or the docs:

```bash
pnpm dlx create-next-app@16.3.3 planner-scaffold \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias '@/*' \
  --use-pnpm
rsync -a --exclude '.git' planner-scaffold/ ./
rm -rf planner-scaffold
node -e "const fs=require('fs'); const p=require('./package.json'); p.name='personal-planner'; fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n')"
```

Expected: the existing `docs/` and `.git/` remain intact; `package.json`, `src/app`, Tailwind setup, and `pnpm-lock.yaml` exist and `pnpm dev` starts successfully.

- [ ] **Step 2: Initialize shadcn/ui and install test dependencies**

Initialize the approved component system using the official CLI:

```bash
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button card dialog input label select checkbox dropdown-menu progress
```

Then install test dependencies:

```bash
pnpm add -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react @playwright/test
pnpm exec playwright install chromium
```

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

- [ ] **Step 3: Write the first failing UI test**

Create `src/app/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home', () => {
  it('renders the planner product name', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Мой планер' })).toBeInTheDocument();
  });
});
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 4: Run the test and verify the expected failure**

Run:

```bash
pnpm test -- src/app/page.test.tsx
```

Expected: FAIL because the scaffolded page does not contain a heading named `Мой планер`.

- [ ] **Step 5: Replace the starter page with the minimal product shell**

Set `src/app/page.tsx` to:

```tsx
export default function Home() {
  return (
    <main className="min-h-screen bg-background p-6">
      <h1 className="text-2xl font-semibold">Мой планер</h1>
    </main>
  );
}
```

- [ ] **Step 6: Run unit tests, lint, and production build**

Run:

```bash
pnpm test -- src/app/page.test.tsx
pnpm lint
pnpm build
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit the independently testable scaffold**

```bash
git add package.json pnpm-lock.yaml next.config.ts vitest.config.ts playwright.config.ts src
 git commit -m "chore: scaffold planner app and test harness"
```

---

### Task 2: Create the Supabase schema, RLS, defaults, and PowerSync download filter

**Files:**
- Create: `.env.example`
- Create: `supabase/migrations/202608270001_foundation.sql`
- Create: `powersync/sync-streams.yaml`
- Test: `supabase/migrations/202608270001_foundation.sql` via local Supabase reset and SQL assertions.

**Interfaces:**
- Consumes: authenticated Supabase user UUID in `auth.uid()` / PowerSync `auth.user_id()`.
- Produces: Postgres tables `profiles`, `areas`, `tasks`; RLS policies limiting rows to `user_id = auth.uid()`; five default areas; auto-subscribed PowerSync stream `user_planner_data`.

- [ ] **Step 1: Initialize Supabase project files and environment contract**

Run:

```bash
pnpm dlx supabase init
```

Create `.env.example`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_POWERSYNC_URL=
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/202608270001_foundation.sql` with:

```sql
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
```

- [ ] **Step 3: Write the PowerSync Sync Streams configuration**

Create `powersync/sync-streams.yaml`:

```yaml
config:
  edition: 3

streams:
  user_planner_data:
    auto_subscribe: true
    queries:
      - SELECT * FROM areas WHERE user_id = auth.user_id()
      - SELECT * FROM tasks WHERE user_id = auth.user_id()
```

- [ ] **Step 4: Run the migration locally and verify RLS is enabled**

Run:

```bash
pnpm dlx supabase start
pnpm dlx supabase db reset
pnpm dlx supabase db lint
```

Then run:

```bash
pnpm dlx supabase db dump --local --schema public > /tmp/planner-schema.sql
grep -q 'CREATE TABLE.*areas' /tmp/planner-schema.sql
grep -q 'CREATE TABLE.*tasks' /tmp/planner-schema.sql
```

Expected: every command exits `0`.

- [ ] **Step 5: Commit schema and sync configuration**

```bash
git add .env.example supabase powersync
 git commit -m "feat: add planner database schema and sync streams"
```

---

### Task 3: Add passwordless Supabase authentication and protected planner route

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/proxy.ts`
- Create: `src/proxy.ts`
- Create: `src/app/auth/page.tsx`
- Create: `src/app/auth/confirm/route.ts`
- Create: `src/components/auth/magic-link-form.tsx`
- Create: `src/app/planner/page.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/components/auth/magic-link-form.test.tsx`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Produces: `createBrowserSupabaseClient()`, `createServerSupabaseClient()`, Magic Link flow, cookie-backed session, protected `/planner` route.

- [ ] **Step 1: Install Supabase client packages**

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Write the failing Magic Link form test**

Create `src/components/auth/magic-link-form.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MagicLinkForm } from './magic-link-form';

it('submits a normalized email', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<MagicLinkForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText('Email'), '  ME@example.com ');
  await user.click(screen.getByRole('button', { name: 'Получить ссылку' }));

  expect(onSubmit).toHaveBeenCalledWith('me@example.com');
});
```

- [ ] **Step 3: Verify the test fails**

```bash
pnpm test -- src/components/auth/magic-link-form.test.tsx
```

Expected: FAIL because `MagicLinkForm` does not exist.

- [ ] **Step 4: Implement the browser/server Supabase clients and form**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

Create `src/components/auth/magic-link-form.tsx`:

```tsx
'use client';

import { FormEvent, useState } from 'react';

type Props = { onSubmit: (email: string) => Promise<void> };

export function MagicLinkForm({ onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit(email.trim().toLowerCase());
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span>Email</span>
        <input
          aria-label="Email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded-md border px-3 py-2"
        />
      </label>
      <button disabled={busy} type="submit" className="rounded-md border px-4 py-2">
        {busy ? 'Отправляем…' : 'Получить ссылку'}
      </button>
    </form>
  );
}
```

Implement `server.ts`, `proxy.ts`, and `src/proxy.ts` using the current `@supabase/ssr` cookie pattern. The proxy must refresh the session and redirect unauthenticated `/planner/**` requests to `/auth`.

- [ ] **Step 5: Implement the Magic Link request and confirmation route**

`src/app/auth/page.tsx` must call:

```ts
await supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/confirm`,
  },
});
```

`src/app/auth/confirm/route.ts` must read the `code` query parameter and call:

```ts
const { error } = await supabase.auth.exchangeCodeForSession(code);
```

On success redirect to `/planner`; on failure redirect to `/auth?error=invalid-link`.

- [ ] **Step 6: Point `/` at the authenticated planner experience**

Implement `src/app/page.tsx` as a server component that checks claims/session and redirects to `/planner` when authenticated and `/auth` otherwise.

- [ ] **Step 7: Run auth tests and build**

```bash
pnpm test -- src/components/auth/magic-link-form.test.tsx
pnpm lint
pnpm build
```

Expected: all commands exit `0`.

- [ ] **Step 8: Commit authentication**

```bash
git add src package.json pnpm-lock.yaml
 git commit -m "feat: add passwordless planner authentication"
```

---

### Task 4: Add the PowerSync local SQLite system and Supabase backend connector

**Files:**
- Create: `src/lib/powersync/app-schema.ts`
- Create: `src/lib/powersync/database.ts`
- Create: `src/lib/powersync/backend-connector.ts`
- Create: `src/lib/powersync/system-provider.tsx`
- Modify: `src/app/planner/page.tsx`
- Modify: `next.config.ts`
- Create: `scripts/copy-powersync-worker.mjs`
- Test: `src/lib/powersync/app-schema.test.ts`

**Interfaces:**
- Consumes: current Supabase access token and `NEXT_PUBLIC_POWERSYNC_URL`.
- Produces: `AppSchema`, singleton `plannerDb`, `PlannerBackendConnector`, `PowerSyncSystemProvider`, and the invariant that planner domain components execute local SQL against `plannerDb`.

- [ ] **Step 1: Install PowerSync packages**

```bash
pnpm add @powersync/web @powersync/react @journeyapps/wa-sqlite
```

- [ ] **Step 2: Write the failing schema shape test**

Create `src/lib/powersync/app-schema.test.ts`:

```ts
import { AppSchema } from './app-schema';

it('contains the Slice A sync tables', () => {
  expect(Object.keys(AppSchema.tables).sort()).toEqual(['areas', 'tasks']);
});
```

Run:

```bash
pnpm test -- src/lib/powersync/app-schema.test.ts
```

Expected: FAIL because `AppSchema` does not exist.

- [ ] **Step 3: Define the local schema with the same column names as Postgres**

Create `src/lib/powersync/app-schema.ts`:

```ts
import { column, Schema, Table } from '@powersync/web';

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
```

- [ ] **Step 4: Create a single persistent database instance**

Create `src/lib/powersync/database.ts`:

```ts
import { PowerSyncDatabase, WASQLiteOpenFactory, WASQLiteVFS } from '@powersync/web';
import { AppSchema } from './app-schema';

const supportsSharedWorker = typeof window !== 'undefined' && 'SharedWorker' in window;

export const plannerDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: new WASQLiteOpenFactory({
    dbFilename: 'planner.sqlite',
    vfs: WASQLiteVFS.OPFSCoopSyncVFS,
    flags: { enableMultiTabs: supportsSharedWorker },
  }),
  flags: { enableMultiTabs: supportsSharedWorker },
});
```

Keep this file client-only by importing it only from client modules/provider; do not instantiate SQLite during server rendering.

- [ ] **Step 5: Implement the backend connector contract**

Create `src/lib/powersync/backend-connector.ts` with a class implementing `PowerSyncBackendConnector`.

`fetchCredentials()` must:

```ts
const { data: { session } } = await supabase.auth.getSession();
if (!session) return null;
return {
  endpoint: process.env.NEXT_PUBLIC_POWERSYNC_URL!,
  token: session.access_token,
};
```

`uploadData(database)` must pull one transaction from `database.getNextCrudTransaction()`, map `PUT`, `PATCH`, and `DELETE` operations to Supabase `.upsert()`, `.update().eq('id', ...)`, and `.delete().eq('id', ...)`, and call `transaction.complete()` only after every operation in the transaction has been accepted by Supabase. For temporary network/server errors, rethrow so PowerSync retries instead of discarding the transaction.

- [ ] **Step 6: Copy the required PowerSync worker asset in a deterministic postinstall step**

Create `scripts/copy-powersync-worker.mjs` that creates `public/@powersync/worker` and copies the distributed `WASQLiteDB.umd.js` worker there. Add:

```json
{
  "scripts": {
    "postinstall": "node scripts/copy-powersync-worker.mjs"
  }
}
```

Run:

```bash
pnpm install
 test -f public/@powersync/worker/WASQLiteDB.umd.js
```

- [ ] **Step 7: Add `PowerSyncSystemProvider` and connect only after auth exists**

The provider must wrap planner children with `PowerSyncContext.Provider`, create one `PlannerBackendConnector`, call `plannerDb.connect(connector)` when a Supabase session exists, and call `plannerDb.disconnect()` on logout/unmount where appropriate. Render a small initialization state until the local database is ready.

- [ ] **Step 8: Run schema test and production build**

```bash
pnpm test -- src/lib/powersync/app-schema.test.ts
pnpm lint
pnpm build
```

Expected: all commands exit `0`.

- [ ] **Step 9: Commit local-first infrastructure**

```bash
git add src/lib/powersync src/app/planner scripts public next.config.ts package.json pnpm-lock.yaml
 git commit -m "feat: add PowerSync local-first data layer"
```

---

### Task 5: Implement typed area and task repositories against local SQLite

**Files:**
- Create: `src/features/areas/area-types.ts`
- Create: `src/features/areas/area-repository.ts`
- Create: `src/features/tasks/task-types.ts`
- Create: `src/features/tasks/task-repository.ts`
- Create: `src/test/sqlite-test-db.ts`
- Test: `src/features/tasks/task-repository.test.ts`
- Test: `src/features/areas/area-repository.test.ts`

**Interfaces:**
- Consumes: an `AbstractPowerSyncDatabase`-compatible database and authenticated `userId`.
- Produces:
  - `listAreas(db, userId): Promise<Area[]>`
  - `listBacklogTasks(db, userId): Promise<Task[]>`
  - `createTask(db, input): Promise<Task>`
  - `updateTask(db, id, patch): Promise<void>`
  - `setTaskCompleted(db, id, completed, now): Promise<void>`
  - `deleteTask(db, id): Promise<void>`

- [ ] **Step 1: Define stable domain types**

Create `src/features/tasks/task-types.ts`:

```ts
export type TaskStatus = 'open' | 'completed';
export type TaskPriority = 'low' | 'normal' | 'high';

export type Task = {
  id: string;
  userId: string;
  areaId: string | null;
  goalId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  scheduledDate: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  priority: TaskPriority;
  completedAt: string | null;
  rescheduleCount: number;
  sortOrder: number;
  fieldVersions: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskInput = {
  userId: string;
  title: string;
  areaId?: string | null;
  description?: string;
  priority?: TaskPriority;
};
```

- [ ] **Step 2: Write failing repository tests**

Create `src/features/tasks/task-repository.test.ts` with tests that assert:

```ts
it('creates an unscheduled open task in backlog', async () => {
  const task = await createTask(db, {
    userId: 'user-1',
    title: '  Обновить CV  ',
    areaId: 'career',
  });

  expect(task.title).toBe('Обновить CV');
  expect(task.scheduledDate).toBeNull();
  expect(task.status).toBe('open');
});

it('marks a task completed and uncompleted', async () => {
  const task = await seedTask(db);
  await setTaskCompleted(db, task.id, true, '2026-08-27T10:00:00.000Z');
  expect((await getTask(db, task.id))?.completedAt).toBe('2026-08-27T10:00:00.000Z');

  await setTaskCompleted(db, task.id, false, '2026-08-27T10:01:00.000Z');
  expect((await getTask(db, task.id))?.completedAt).toBeNull();
});
```

- [ ] **Step 3: Verify the tests fail**

```bash
pnpm test -- src/features/tasks/task-repository.test.ts src/features/areas/area-repository.test.ts
```

Expected: FAIL because repository functions do not exist.

- [ ] **Step 4: Implement SQL mapping and CRUD with parameterized statements**

`createTask` must:

```ts
const id = crypto.randomUUID();
const now = new Date().toISOString();
const title = input.title.trim();
if (!title) throw new Error('Task title is required');

await db.execute(
  `INSERT INTO tasks (
    id, user_id, area_id, goal_id, title, description, status,
    scheduled_date, start_at, end_at, all_day, priority,
    completed_at, reschedule_count, sort_order, field_versions,
    created_at, updated_at
  ) VALUES (?, ?, ?, NULL, ?, ?, 'open', NULL, NULL, NULL, 0, ?, NULL, 0, ?, '{}', ?, ?)`,
  [id, input.userId, input.areaId ?? null, title, input.description ?? '', input.priority ?? 'normal', Date.now(), now, now],
);
```

Map SQLite integer booleans to domain booleans and parse `field_versions` JSON in one private mapper used by every task query.

`listBacklogTasks` must select `scheduled_date IS NULL AND start_at IS NULL AND status = 'open'` ordered by `sort_order ASC, created_at ASC`.

- [ ] **Step 5: Run repository tests**

```bash
pnpm test -- src/features/tasks/task-repository.test.ts src/features/areas/area-repository.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit domain repositories**

```bash
git add src/features src/test
 git commit -m "feat: add local area and task repositories"
```

---

### Task 6: Build the Backlog panel and task editor on the local repository

**Files:**
- Create: `src/features/areas/use-areas.ts`
- Create: `src/features/areas/area-settings.tsx`
- Create: `src/features/tasks/use-backlog-tasks.ts`
- Create: `src/features/tasks/task-form.tsx`
- Create: `src/features/tasks/backlog-panel.tsx`
- Create: `src/components/app-shell/app-shell.tsx`
- Modify: `src/app/planner/page.tsx`
- Test: `src/features/tasks/backlog-panel.test.tsx`
- Test: `src/features/tasks/task-form.test.tsx`
- Test: `src/features/areas/area-settings.test.tsx`

**Interfaces:**
- Consumes: Task/Area repository APIs from Task 5 and authenticated user id from the planner provider boundary.
- Produces: user-visible backlog CRUD with area color chips and completion controls; no calendar scheduling yet.

- [ ] **Step 1: Write the failing backlog interaction test**

Create `src/features/tasks/backlog-panel.test.tsx`:

```tsx
it('creates a backlog task and renders it immediately', async () => {
  const user = userEvent.setup();
  render(<BacklogPanel userId="user-1" />);

  await user.click(screen.getByRole('button', { name: 'Новая задача' }));
  await user.type(screen.getByLabelText('Название'), 'Купить шампунь');
  await user.click(screen.getByRole('button', { name: 'Сохранить' }));

  expect(await screen.findByText('Купить шампунь')).toBeInTheDocument();
});
```

Use a test database/provider, not a mocked Supabase API, so this proves the UI is wired to local storage.

- [ ] **Step 2: Verify the component test fails**

```bash
pnpm test -- src/features/tasks/backlog-panel.test.tsx
```

Expected: FAIL because `BacklogPanel` does not exist.

- [ ] **Step 3: Implement reactive local queries**

`useBacklogTasks(userId)` must subscribe to a watched local query equivalent to:

```sql
SELECT * FROM tasks
WHERE user_id = ?
  AND scheduled_date IS NULL
  AND start_at IS NULL
  AND status = 'open'
ORDER BY sort_order ASC, created_at ASC
```

`useAreas(userId)` must watch non-archived areas ordered by `sort_order`.

- [ ] **Step 4: Implement TaskForm with local validation**

Fields in Slice A:

```text
Название (required, max 240)
Сфера жизни (optional)
Описание (optional)
Приоритет: low / normal / high
```

On submit call `createTask`; never call Supabase directly from the form.
If `createTask` rejects, keep the entered values, keep the form open, and render `Не удалось сохранить задачу` with `role="alert"`. Add a component test that forces the local repository to reject and verifies no optimistic success state is shown.

- [ ] **Step 5: Implement BacklogPanel**

The panel must render:

```text
Backlog
+ Новая задача
[ ] task title   [area color]
```

Clicking the checkbox calls `setTaskCompleted`; clicking the title opens edit state. Each row exposes a menu with `Редактировать` and `Удалить`.

- [ ] **Step 6: Implement life-area management UI**

`AreaSettings` must list non-archived areas and support create, rename, recolor, reorder, and archive through `area-repository.ts`. Use the browser color input plus a hex text value; validate `^#[0-9A-Fa-f]{6}$`. Reordering persists integer `sort_order` values in increments of 10. Archiving an area must not delete it or rewrite historical task rows; archived areas disappear from new-task selectors but remain renderable on existing data.

Add a settings/menu entry from the planner shell and component tests for: creating `Творчество`, recoloring it, moving it above `Другое`, and archiving it.

- [ ] **Step 7: Assemble the desktop shell**

`AppShell` in this slice uses three layout columns but leaves center/right with explicit Slice A empty states:

```text
Left: Backlog
Center: "Календарь появится на следующем этапе"
Right: "Привычки появятся позже"
```

This locks the eventual desktop proportions without prematurely implementing later features.

- [ ] **Step 8: Run component tests and accessibility smoke checks**

```bash
pnpm test -- src/features/tasks/task-form.test.tsx src/features/tasks/backlog-panel.test.tsx src/features/areas/area-settings.test.tsx
pnpm lint
pnpm build
```

Expected: all commands exit `0`.

- [ ] **Step 9: Commit backlog and area-management UI**

```bash
git add src/features src/components src/app/planner
 git commit -m "feat: add local-first backlog task UI"
```

---

### Task 7: Expose sync state and prove offline create/reconnect synchronization

**Files:**
- Create: `src/components/sync/sync-status.tsx`
- Modify: `src/lib/powersync/system-provider.tsx`
- Modify: `src/components/app-shell/app-shell.tsx`
- Create: `tests/e2e/offline-backlog.spec.ts`
- Create: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: PowerSync connection status and local task UI.
- Produces: visible states `Synced`, `Syncing`, `Offline`, `Sync error`; an E2E test proving local task creation still works with network disabled and is uploaded after reconnect.

- [ ] **Step 1: Write the sync-status component test**

Create a test with these exact cases:

```tsx
expect(renderStatus({ connected: false, uploading: false })).toHaveTextContent('Offline');
expect(renderStatus({ connected: true, uploading: true })).toHaveTextContent('Syncing');
expect(renderStatus({ connected: true, uploading: false })).toHaveTextContent('Synced');
```

- [ ] **Step 2: Implement the derived status component**

`SyncStatus` receives a plain typed view model:

```ts
export type SyncStatusModel = {
  connected: boolean;
  hasPendingUploads: boolean;
  syncError: string | null;
};
```

Map it exactly:

```ts
if (!connected) return 'Offline';
if (syncError) return 'Sync error';
if (hasPendingUploads) return 'Syncing';
return 'Synced';
```

Render the label in the app header with `aria-live="polite"`.

- [ ] **Step 3: Write the offline E2E workflow**

`tests/e2e/offline-backlog.spec.ts` must perform:

```ts
await page.goto('/planner');
await context.setOffline(true);
await page.getByRole('button', { name: 'Новая задача' }).click();
await page.getByLabel('Название').fill('Offline task');
await page.getByRole('button', { name: 'Сохранить' }).click();
await expect(page.getByText('Offline task')).toBeVisible();
await expect(page.getByText('Offline')).toBeVisible();
await page.reload();
await expect(page.getByText('Offline task')).toBeVisible();
await context.setOffline(false);
await expect(page.getByText('Synced')).toBeVisible({ timeout: 15_000 });
```

Run this against an authenticated test storage state produced by the auth setup. If Magic Link cannot be automated in CI, create a Supabase test user/session in global setup and persist Playwright storage state; do not bypass planner route protection in production code.

- [ ] **Step 4: Run the complete Slice A verification**

```bash
pnpm test
pnpm lint
pnpm build
pnpm test:e2e -- tests/e2e/offline-backlog.spec.ts
```

Expected: all commands exit `0`.

- [ ] **Step 5: Perform a manual two-browser verification**

Use the same signed-in account in two browser profiles:

```text
1. Browser A online: create "A-online".
2. Browser B online: confirm "A-online" appears.
3. Browser B offline: create "B-offline".
4. Browser B online again: wait for Synced.
5. Browser A: confirm "B-offline" appears without recreating it.
```

Record the result in the commit message body if any browser-specific caveat appears.

- [ ] **Step 6: Commit the Slice A exit criterion**

```bash
git add src tests
 git commit -m "test: verify offline backlog sync workflow"
```

## Slice A Exit Gate

Do not start Slice B until all are true:

```text
[ ] Magic Link signs in and /planner is protected.
[ ] Five default life areas arrive for a new user.
[ ] Creating/editing/completing/deleting backlog tasks works from local SQLite.
[ ] The same task survives a reload while offline.
[ ] Reconnect uploads queued changes to Supabase and another device receives them.
[ ] UI visibly distinguishes Offline / Syncing / Sync error / Synced.
[ ] Custom life areas can be created, renamed, recolored, reordered, and archived without breaking historical data.
[ ] pnpm test, pnpm lint, pnpm build, and offline Playwright test pass.
```
