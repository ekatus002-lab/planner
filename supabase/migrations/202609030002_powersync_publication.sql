-- PowerSync's Postgres replication connection requires a logical-replication
-- publication named `powersync` to exist on the source database (see
-- `.powersync-selfhost/powersync/service.yaml`'s `replication.connections`).
-- This publication had only ever been created by hand against the running
-- local Postgres instance - it lived nowhere in the repo, so it silently
-- disappeared on every `pnpm dlx supabase db reset` (which drops and
-- recreates the whole database from migrations), wedging PowerSync's
-- replication with "Publication 'powersync' does not exist" until someone
-- noticed and recreated it manually. Committing it as a migration makes
-- `db reset` reproducible end-to-end, matching the exit-gate requirement
-- that download sync (Postgres -> PowerSync -> local SQLite) actually works.
--
-- Guarded with a existence check since `CREATE PUBLICATION` has no
-- `IF NOT EXISTS` clause.
--
-- Note: recreating this publication is necessary but not sufficient after a
-- `db reset` - PowerSync's own sync-bucket storage (the separate
-- `pg-storage` Postgres instance in `.powersync-selfhost/docker-compose.yaml`)
-- also keeps state (replication slot name, last checkpoint LSN) tied to the
-- specific database instance it last replicated from. A source `db reset`
-- invalidates that state too, so the self-hosted PowerSync stack's own
-- storage needs clearing after a source reset:
--   cd .powersync-selfhost && docker compose --env-file .env -p powersync-selfhost down -v && docker compose --env-file .env -p powersync-selfhost up -d
-- (see CLAUDE-CODE-RUNBOOK.md).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'powersync') then
    create publication powersync for all tables;
  end if;
end
$$;
