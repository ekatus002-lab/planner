-- tasks.sort_order was declared `real` (Postgres float4, 24-bit mantissa).
-- The client seeds it with `Date.now()` (~1.79e12 at current dates), and at
-- that magnitude one ULP of float4 is ~131072 (~131 seconds) - so many tasks
-- created within the same ~2-minute window collapse to the identical stored
-- value, and the value that syncs back down differs from what the client
-- actually wrote. Display order has only survived by accident so far
-- (`ORDER BY sort_order ASC, created_at ASC` tiebreaks on `created_at`), but
-- Slice B's `reorderBacklogTasks` is built directly on this column, so fix
-- the precision now, before real data exists, rather than after.
--
-- `double precision` (float8, 53-bit mantissa) comfortably represents
-- millisecond epoch timestamps (and any future fractional reorder value)
-- exactly. This is additive/append-only per Postgres migration convention -
-- the already-applied 202608270001_foundation.sql is left untouched.
--
-- No local schema change is needed: `src/lib/powersync/app-schema.ts`
-- already declares `sort_order: column.real`, which is SQLite's native REAL
-- type - an 8-byte IEEE 754 double, i.e. already float8-equivalent.
alter table public.tasks
  alter column sort_order type double precision;
