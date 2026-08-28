import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PowerSyncDatabase, type CommonPowerSyncDatabase } from '@powersync/node';
import { AppSchema } from '@/lib/powersync/app-schema';

// A real, ready-to-query local SQLite database for repository tests -
// backed by `@powersync/node`'s `PowerSyncDatabase` (which bundles the
// actual `powersync-sqlite-core` native extension via better-sqlite3), not
// a mock.
//
// We deliberately do NOT reuse `@powersync/web`'s `PowerSyncDatabase` (the
// one `src/lib/powersync/database.ts` uses in the browser) here: it always
// opens a Web/Shared Worker and, outside of SSR mode, takes an exclusive
// lock via `navigator.locks` before syncing/schema operations. Neither is
// meaningfully available under Vitest's jsdom test environment - and SSR
// mode (auto-detected only when `window` is absent from `globalThis`, which
// is not the case under jsdom) only skips version/sync-status checks, not
// schema application (`powersync_replace_schema`), which still requires the
// native PowerSync SQLite extension to be loaded regardless of locking.
// `@powersync/node`'s `PowerSyncDatabase` loads that same extension through
// a real better-sqlite3-backed worker-thread connection pool, so `Schema`
// tables become genuine SQLite views/triggers exactly like in production -
// just running against a throwaway file instead of the browser's OPFS/IndexedDB
// storage.
//
// `Schema`/`Table`/`column` (used to build `AppSchema` in
// `src/lib/powersync/app-schema.ts`) are re-exported unchanged from
// `@powersync/common` by both `@powersync/web` and `@powersync/node`, so the
// same `AppSchema` instance works against either platform's database.
//
// Each test database uses its own temp *file* rather than `:memory:`:
// `@powersync/node` opens one writer and one or more reader connections in
// separate worker threads, each independently opening `dbFilename` - two
// `:memory:` connections do not share data, so an in-memory database would
// make writes invisible to reads. A unique temp file per call keeps tests
// isolated from each other while still sharing data correctly across the
// connection pool.
export type TestDatabase = CommonPowerSyncDatabase;

export async function createTestDb(): Promise<TestDatabase> {
  const dbFilename = path.join(tmpdir(), `planner-test-${randomUUID()}.sqlite`);
  const db = new PowerSyncDatabase({
    schema: AppSchema,
    database: {
      dbFilename,
      // A single read connection is enough for tests and keeps startup fast;
      // production behavior (multiple readers) is exercised on the real app
      // via the `@powersync/web` singleton, not this test helper.
      readWorkerCount: 1,
    },
  });
  await db.init();
  return db;
}

export async function closeTestDb(db: TestDatabase): Promise<void> {
  const dbFilename = db.database.name;
  await db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${dbFilename}${suffix}`, { force: true });
  }
}
