# Claude Code Runbook — Personal Planner

This file is the operator guide for building the approved planner with Claude Code without giving Claude the entire product as one uncontrolled prompt.

## Source of truth

Claude must read these files before writing code:

```text
docs/superpowers/specs/2026-08-27-personal-planner-design.md
docs/superpowers/plans/2026-08-27-slice-a-foundation-local-tasks.md
docs/superpowers/plans/2026-08-27-slice-b-calendar-planning.md
docs/superpowers/plans/2026-08-27-slice-c-habits-goals.md
docs/superpowers/plans/2026-08-27-slice-d-review-conflicts-release.md
```

Do not ask Claude to implement all four slices in one session. Finish and verify one slice before starting the next.

---

## Prompt 0 — Start Claude in the repository

Copy this into Claude Code from the repository root:

```text
We are building the Personal Planner in this repository.

Before doing anything:
1. Invoke the Superpowers skills that apply. Start with using-superpowers.
2. Read docs/superpowers/specs/2026-08-27-personal-planner-design.md.
3. Read docs/superpowers/plans/2026-08-27-slice-a-foundation-local-tasks.md completely.
4. Inspect git status and the repository structure.
5. Do not redesign the product or expand scope beyond the approved spec.
6. Do not implement Slice B/C/D yet.

Use superpowers:subagent-driven-development if available; otherwise use superpowers:executing-plans. Follow Slice A task-by-task, TDD first, and commit after every task exactly as the plan requires.

Before claiming Slice A is complete, run every command in its Exit Gate and report the command outputs/results. If an external credential or dashboard action is genuinely required (Supabase/PowerSync), stop only at that exact checkpoint and tell me precisely which value/action is needed and where it goes; do not invent credentials and do not skip the verification.
```

### Local environment setup (Supabase + self-hosted PowerSync)

This project does not use PowerSync Cloud. Both Supabase and PowerSync run
locally via Docker, and PowerSync connects directly to the local Supabase
Postgres instance as a logical-replication source.

1. **Start local Supabase** from the repository root:

   ```bash
   pnpm dlx supabase start
   ```

   This starts Postgres (with `supabase/migrations/` applied), GoTrue (Auth),
   Kong, Studio, and the local Mailpit mail-testing inbox
   (`http://127.0.0.1:54324`), all inside a Docker network named
   `supabase_network_<project_id>` (see `project_id` in
   `supabase/config.toml`; the checked-in default is
   `supabase_network_slice-a-foundation`).

2. **Start the self-hosted PowerSync stack** in `.powersync-selfhost/` (a
   separate, untracked-by-design directory outside `supabase/`/`src/` - see
   the header comment in `.powersync-selfhost/docker-compose.yaml`):

   ```bash
   cd .powersync-selfhost
   cp .env.example .env   # only if you don't already have one
   docker compose --env-file .env -p powersync-selfhost up -d
   ```

   This stack joins the Supabase project's own Docker network so it can
   reach the Supabase Postgres and Kong (GoTrue) containers by name (see
   `.powersync-selfhost/.env`'s `PG_DATABASE_HOSTNAME`/`PS_JWKS_URL`), and
   uses its own dedicated Postgres instance (`pg-storage`) purely for
   PowerSync's internal sync-bucket storage - it never touches the Supabase
   database except as a replication source. `.powersync-selfhost/powersync/`
   holds `service.yaml` (connection/auth config) and `sync-config.yaml`
   (== the repository's `powersync/sync-streams.yaml`; keep them in sync
   manually - see the "known gaps" note in the design spec if this project
   later ties them together). PowerSync serves on `http://127.0.0.1:8080`.

3. **Create `.env.local`** from `.env.example` and supply:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...   # `pnpm dlx supabase status` prints this
   NEXT_PUBLIC_POWERSYNC_URL=http://127.0.0.1:8080
   SUPABASE_SERVICE_ROLE_KEY=...              # `pnpm dlx supabase status` prints this
   ```

   `SUPABASE_SERVICE_ROLE_KEY` is required for `pnpm test:e2e`:
   `tests/e2e/global-setup.ts` uses it (via the Supabase admin API) to
   provision a throwaway authenticated test user and mint a Playwright
   storage state, so specs never have to drive the real Magic Link email
   flow through a browser. That script refuses to run at all unless
   `NEXT_PUBLIC_SUPABASE_URL` resolves to `localhost`/`127.0.0.1`/`::1`
   (`assertLocalSupabaseUrl` in `tests/e2e/global-setup.ts`) - it creates
   real accounts with the service-role key, so it must never be pointed at a
   shared/staging/production Supabase project.

4. **Signup is disabled** (`supabase/config.toml`'s `enable_signup = false`
   - this is a private, single-user app by design). The only way to create a
   new account is out-of-band via the Supabase admin API (exactly what
   `global-setup.ts` does for tests); the public `/auth` Magic Link flow only
   works for an email that already has an account.

5. **First-time / after `pnpm install`**: the `postinstall` script
   (`scripts/copy-powersync-worker.mjs`) copies PowerSync's pre-bundled
   Web/SharedWorker bundle into `public/@powersync/worker/`. If that
   directory is ever missing (e.g. after a clean checkout without running
   `pnpm install`), the local PowerSync database will fail to open in the
   browser; re-run `pnpm install` to restore it.

6. **Cross-origin isolation headers are required**: `next.config.ts` sends
   `Cross-Origin-Opener-Policy: same-origin` and
   `Cross-Origin-Embedder-Policy: require-corp` on every route. PowerSync's
   `OPFSCoopSyncVFS` worker needs `SharedArrayBuffer` for its synchronous
   OPFS access-handle pool, which browsers only expose in a
   cross-origin-isolated context - without these headers the worker fails to
   load and the local database never initializes. Do not remove them.

Supabase also needs the local/production redirect URLs configured for Magic
Link (`supabase/config.toml`'s `[auth]` `site_url`/`additional_redirect_urls`
for local dev), and the repository's `powersync/sync-streams.yaml` deployed
as the PowerSync service's `sync_config` (mirrored locally at
`.powersync-selfhost/powersync/sync-config.yaml`, step 2 above).

### After `pnpm dlx supabase db reset`

`supabase db reset` drops and recreates the *entire* local Postgres database
from the migrations. PowerSync's self-hosted stack keeps state tied to that
specific database instance - its own sync-bucket storage (the `pg-storage`
container) remembers a replication slot name and last-replicated LSN that no
longer exist after a reset, so sync silently stops working ("Replication
slot ... is missing" in `docker logs powersync-selfhost-powersync-1`) until
that state is cleared. After every `db reset`, also reset the PowerSync
stack's own storage:

```bash
cd .powersync-selfhost
docker compose --env-file .env -p powersync-selfhost down -v
docker compose --env-file .env -p powersync-selfhost up -d
```

(The `powersync` publication itself - required for PowerSync's Postgres
replication connection - is recreated automatically by migration
`202609030002_powersync_publication.sql`; only PowerSync's own storage needs
manual clearing.)

---

## Prompt 1 — Review Slice A before moving on

After Claude says Slice A is finished, send:

```text
Do not start Slice B yet.

Perform a completion review of Slice A against:
- docs/superpowers/specs/2026-08-27-personal-planner-design.md
- docs/superpowers/plans/2026-08-27-slice-a-foundation-local-tasks.md

Use the Superpowers verification-before-completion skill.
Check:
1. every Slice A task/step is actually implemented;
2. there are no skipped or silently weakened requirements;
3. UI task/area data is read/written through local PowerSync SQLite, not directly through Supabase;
4. offline create/reload/reconnect behavior is genuinely tested;
5. pnpm test, pnpm lint, pnpm build and Slice A E2E all pass;
6. git status is clean.

Fix any issue you find using the appropriate Superpowers debugging/TDD workflow. Then give me a concise review report with the exact verification commands and results. Do not start Slice B until the review is green.
```

---

## Prompt 2 — Execute Slice B: Calendar Planning

Only after Slice A is green:

```text
Slice A is approved. Start Slice B only.

Before implementation:
1. Invoke the applicable Superpowers skill(s).
2. Read the approved design spec again.
3. Read docs/superpowers/plans/2026-08-27-slice-b-calendar-planning.md completely.
4. Inspect the existing Slice A implementation and follow its established patterns.

Execute Slice B task-by-task with TDD and frequent commits. Keep one unified task model: do NOT introduce a calendar_events/events database table. Calendar items must be projections of tasks.

Pay special attention to:
- date-only vs all-day vs timed tasks;
- timezone-safe date handling;
- backlog -> calendar drag;
- calendar -> backlog unschedule;
- reschedule_count incrementing only when the calendar date changes;
- event duration preservation on drag;
- reactive selected-day task list.

Before claiming completion, run the entire Slice B Exit Gate and use verification-before-completion. Do not start habits/goals.
```

Then run the same review pattern as Prompt 1, replacing Slice A paths with Slice B.

---

## Prompt 3 — Execute Slice C: Habits and Goals

Only after Slice B is green:

```text
Slices A and B are approved. Start Slice C only.

Invoke applicable Superpowers skills, then read:
- docs/superpowers/specs/2026-08-27-personal-planner-design.md
- docs/superpowers/plans/2026-08-27-slice-c-habits-goals.md

Execute the plan task-by-task with TDD and commits after each task.

Non-negotiable domain rules:
- habits are separate from tasks;
- no recurring task generation;
- habit schedule uses ISO weekdays 1..7;
- streaks advance over expected habit dates, so unscheduled days never break a streak;
- goal progress is clamped 0..100;
- automatic goal progress uses the exact task/habit weighting in the plan;
- hybrid progress = automatic + manual adjustment;
- all habit/goal interaction must work immediately from local SQLite while offline.

Before completion, execute the complete Slice C Exit Gate and use verification-before-completion. Do not start monthly review/conflict/PWA release work until the gate is green.
```

---

## Prompt 4 — Execute Slice D: Review, Conflicts, PWA, Release

Only after Slice C is green:

```text
Slices A, B and C are approved. Start Slice D only.

Invoke applicable Superpowers skills, then read:
- docs/superpowers/specs/2026-08-27-personal-planner-design.md
- docs/superpowers/plans/2026-08-27-slice-d-review-conflicts-release.md

Execute the plan task-by-task with TDD and frequent commits.

Treat sync conflict correctness as a high-risk subsystem. Do not simplify it to whole-row last-write-wins.
Required behavior:
- different fields edited concurrently on two offline devices merge automatically;
- the same field edited concurrently produces a conflict record and does not silently overwrite either candidate;
- conflict uploads must not block the PowerSync queue;
- resolving the local version creates a fresh revision-aware edit based on the newest server revision;
- current-month review is live;
- closed-month snapshot is immutable after it is created;
- monthly summary is deterministic, no AI call;
- PWA can cold-start offline after a prior successful online load/auth on that device.

Use systematic-debugging for any sync, Safari/iOS, service worker, or flaky E2E failure. Before completion, execute every Slice D/MVP Exit Gate check, then use verification-before-completion and report exact results.
```

---

## Prompt 5 — Final code review before using the planner daily

```text
The MVP implementation is complete. Perform a final production-readiness review; do not add new features.

Use the Superpowers requesting-code-review and verification-before-completion workflows.
Review the whole diff/history against the approved design spec and all four plan files.

Focus on:
1. data-loss risks in local-first sync;
2. RLS / cross-user data exposure;
3. incorrect PowerSync transaction completion/retry behavior;
4. same-field conflict race conditions;
5. timezone/date-only bugs;
6. streak and monthly snapshot correctness;
7. service worker caching stale or authenticated content incorrectly;
8. mobile overflow/accessibility;
9. missing tests for any MVP success criterion;
10. dead code or accidental deferred-scope features.

Fix only concrete defects found by review. Do not expand scope.
Then run:
pnpm test
pnpm lint
pnpm build
pnpm test:e2e

Report:
- exact commands/results;
- any remaining known risk;
- current git commit hash;
- whether all 10 MVP success criteria in the design spec are demonstrably satisfied.
```

---

## What not to tell Claude

Avoid a single prompt like:

```text
Build me a planner with a calendar, habits, goals, offline sync and analytics.
```

That invites architecture drift, duplicate models, fake offline behavior, and large unreviewable edits.

Also avoid telling Claude to "improve anything you think is useful". The approved MVP deliberately defers notifications, AI planning, Google Calendar, recurring tasks, subtasks, attachments, rich notes, widgets, shared accounts, and native apps.

---

## Recommended session rhythm

```text
Session 1: Slice A Tasks 1-3
Session 2: Slice A Tasks 4-7 + review
Session 3: Slice B + review
Session 4: Slice C Tasks 1-4
Session 5: Slice C Tasks 5-7 + review
Session 6: Slice D Tasks 1-3
Session 7: Slice D Tasks 4-5 (conflicts only)
Session 8: Slice D Tasks 6-7 + production validation
Session 9: Final code review
```

The conflict subsystem gets its own session because it is the easiest part of the project to make look correct while still losing edits under real two-device concurrency.
