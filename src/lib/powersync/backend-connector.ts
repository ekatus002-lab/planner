import { UpdateType } from '@powersync/web';
import type {
  CommonPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/web';
import type { SupabaseClient } from '@supabase/supabase-js';

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

    // Apply every operation in the transaction against Supabase. If any
    // operation throws (network error, transient server error, etc.), we
    // deliberately do not catch it here: `transaction.complete()` below is
    // never reached, so PowerSync keeps the transaction queued and retries
    // the whole batch after its configured backoff instead of discarding it.
    for (const op of transaction.crud) {
      const table = this.supabase.from(op.table);

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
    }

    // Only mark the transaction complete once every operation above has
    // succeeded.
    await transaction.complete();
  }
}
