# Мой планер — Personal Planner

A personal, local-first planner: unified tasks, life areas, (later) calendar
scheduling, habits, and goals. Built for a single user — there is no
multi-user or sharing mode.

- **Stack:** Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui,
  Supabase (Auth + Postgres, self-hosted locally via the Supabase CLI), and a
  self-hosted PowerSync service for local-first sync.
- **Architecture:** the browser UI reads and writes planner data only through
  a local PowerSync-managed SQLite database. Supabase provides passwordless
  (Magic Link) auth and the authoritative Postgres store; PowerSync streams
  the signed-in user's rows down to the browser and queues local writes for
  upload back to Supabase, so the app keeps working fully offline.

## Documentation

- Product/design spec: `docs/superpowers/specs/2026-08-27-personal-planner-design.md`
- Implementation plans (one per slice): `docs/superpowers/plans/`
- Operator runbook (environment setup, local Supabase + self-hosted
  PowerSync, running tests): `CLAUDE-CODE-RUNBOOK.md`

## Getting started

See `CLAUDE-CODE-RUNBOOK.md` for the full local environment setup (local
Supabase stack, self-hosted PowerSync via `.powersync-selfhost/`, required
environment variables, and the COOP/COEP header requirement). Once the
environment is running:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing

```bash
pnpm test        # Vitest unit/component tests
pnpm lint        # ESLint
pnpm build       # Production build
pnpm test:e2e    # Playwright end-to-end tests (needs local Supabase + PowerSync running)
```
