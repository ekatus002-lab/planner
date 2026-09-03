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
            const record = { ...op.opData, id: op.id };
            const { error } = await table.upsert(record);
            if (error) throw error;
            break;
          }
          case UpdateType.PATCH: {
            const { error } = await table.update(op.opData ?? {}).eq('id', op.id);
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
