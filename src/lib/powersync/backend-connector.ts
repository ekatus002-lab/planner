import { UpdateType } from '@powersync/web';
import type {
  CommonPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/web';
import type { SupabaseClient } from '@supabase/supabase-js';

// Postgres/PostgREST error codes that mean "this exact write can never
// succeed, no matter how many times it's retried" - as opposed to a
// transient network/server failure that a retry might resolve:
//   - 23505 unique_violation      (e.g. `areas_user_name_active_idx`)
//   - 23503 foreign_key_violation (the referenced row is gone and isn't
//     coming back)
//   - 23514 check_violation       (e.g. a bad hex color or title length)
//   - 42501 insufficient_privilege (an RLS policy permanently denies this
//     row for this user)
// PowerSync retries a thrown `uploadData` error indefinitely at the head of
// the FIFO upload queue, so rethrowing any of these would wedge every future
// sync behind one bad row that can never be fixed by retrying.
const PERMANENT_POSTGRES_ERROR_CODES = new Set(['23505', '23503', '23514', '42501']);

/**
 * True when `error` is a Postgres/PostgREST error whose `code` identifies a
 * permanent failure (constraint violation or RLS denial) rather than a
 * transient one (network failure, timeout, 5xx). Extracted as a pure
 * function so this classification is unit-testable without a live Supabase
 * call - `uploadData` itself needs a real `getNextCrudTransaction()` result
 * and Supabase client to exercise end-to-end.
 */
export function isPermanentError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && PERMANENT_POSTGRES_ERROR_CODES.has(code);
}

// Columns that are Postgres `jsonb` server-side but have no native array/
// object column type in local SQLite, so the repositories that write them
// (`habit-repository.ts`'s `weekdays`, `task-repository.ts`'s
// `field_versions`) store a JSON-encoded *string* locally and `JSON.parse`
// it back on read (see each repository's own `mapXRow`). `op.opData` here is
// that same local string value - upserting it as-is would hand PostgREST a
// JSON string ("[1,2,3]"), which a `jsonb` column happily accepts *as a
// scalar string value* rather than the array/object it actually represents.
// The download side then reads that back as a jsonb string, and one more
// local `JSON.parse` unwraps only the outer quoting, leaving the inner
// value still string-encoded - so every upload/download round trip adds
// another layer of encoding. Decoding here, once, before the row ever
// reaches Supabase keeps the local text representation and the wire
// representation each JSON-encoded exactly once.
const JSON_TEXT_COLUMNS: Record<string, string[]> = {
  habits: ['weekdays'],
  tasks: ['field_versions'],
};

/**
 * Returns `data` with any of `table`'s known JSON-text columns parsed back
 * into real JSON values, so Supabase's PostgREST receives an actual
 * array/object for a `jsonb` column instead of a JSON-encoded string.
 * Exported for unit testing; leaves `data` untouched for tables/columns not
 * listed in `JSON_TEXT_COLUMNS`, and leaves non-string values (e.g. already
 * `undefined`, from a PATCH that doesn't touch that column) alone.
 */
export function decodeJsonTextColumns(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const columns = JSON_TEXT_COLUMNS[table];
  if (!columns) return data;

  const decoded = { ...data };
  for (const column of columns) {
    const value = decoded[column];
    if (typeof value === 'string') {
      decoded[column] = JSON.parse(value);
    }
  }
  return decoded;
}

/**
 * Bridges the local PowerSync SQLite database with the Supabase Postgres
 * backend: supplies sync credentials from the current Supabase session, and
 * uploads locally queued writes back to Supabase.
 */
export class PlannerBackendConnector implements PowerSyncBackendConnector {
  constructor(private readonly supabase: SupabaseClient) {}

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const {
      data: { session },
    } = await this.supabase.auth.getSession();

    if (!session) {
      return null;
    }

    const endpoint = process.env.NEXT_PUBLIC_POWERSYNC_URL;
    if (!endpoint) {
      // A missing endpoint is a configuration error, not a transient one -
      // surface it loudly rather than silently failing to sync.
      throw new Error('NEXT_PUBLIC_POWERSYNC_URL is not configured.');
    }

    return {
      endpoint,
      token: session.access_token,
    };
  }

  async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      return;
    }

    // Apply every operation in the transaction against Supabase.
    for (const op of transaction.crud) {
      const table = this.supabase.from(op.table);

      try {
        switch (op.op) {
          case UpdateType.PUT: {
            const record = { ...decodeJsonTextColumns(op.table, op.opData ?? {}), id: op.id };
            const { error } = await table.upsert(record);
            if (error) throw error;
            break;
          }
          case UpdateType.PATCH: {
            const { error } = await table.update(decodeJsonTextColumns(op.table, op.opData ?? {})).eq('id', op.id);
            if (error) throw error;
            break;
          }
          case UpdateType.DELETE: {
            const { error } = await table.delete().eq('id', op.id);
            if (error) throw error;
            break;
          }
          default: {
            throw new Error(`Unknown PowerSync CRUD operation: ${op.op as string}`);
          }
        }
      } catch (error) {
        if (isPermanentError(error)) {
          // This exact row can never sync (a constraint violation or RLS
          // denial that retrying will not fix). Log it clearly and drop just
          // this operation so the rest of the queue keeps draining, instead
          // of retrying it forever at the head of the FIFO upload queue and
          // blocking every future sync behind it.
          console.error(
            `[PlannerBackendConnector] Permanent error uploading ${op.table} ${op.op} (id=${op.id}); dropping this operation so the sync queue is not wedged.`,
            error,
          );
          continue;
        }

        // Transient (network error, timeout, 5xx, etc.): deliberately do not
        // catch this further - `transaction.complete()` below is never
        // reached, so PowerSync keeps the transaction queued and retries the
        // whole batch after its configured backoff instead of discarding it.
        throw error;
      }
    }

    // Reached once every operation above has either succeeded or been
    // permanently and deliberately dropped.
    await transaction.complete();
  }
}
