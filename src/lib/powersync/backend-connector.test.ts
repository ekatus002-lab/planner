import { UpdateType } from '@powersync/web';
import type { CommonPowerSyncDatabase, CrudTransaction } from '@powersync/web';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { decodeJsonTextColumns, isPermanentError, PlannerBackendConnector } from './backend-connector';

describe('isPermanentError', () => {
  it.each(['23505', '23503', '23514', '42501'])(
    'treats Postgres/PostgREST code %s as permanent',
    (code) => {
      expect(isPermanentError({ code })).toBe(true);
    },
  );

  it('treats an unrecognized error code as transient', () => {
    expect(isPermanentError({ code: '53300' })).toBe(false); // too_many_connections
  });

  it('treats a plain network/timeout error (no code) as transient', () => {
    expect(isPermanentError(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('treats non-object values as transient', () => {
    expect(isPermanentError(null)).toBe(false);
    expect(isPermanentError(undefined)).toBe(false);
    expect(isPermanentError('boom')).toBe(false);
  });
});

describe('decodeJsonTextColumns', () => {
  it('parses a known JSON-text column back into its real array value', () => {
    expect(decodeJsonTextColumns('habits', { title: 'x', weekdays: '[1,2,3]' })).toEqual({
      title: 'x',
      weekdays: [1, 2, 3],
    });
  });

  it('parses field_versions on the tasks table', () => {
    expect(decodeJsonTextColumns('tasks', { field_versions: '{"title":2}' })).toEqual({
      field_versions: { title: 2 },
    });
  });

  it('leaves other tables/columns untouched', () => {
    const data = { name: 'x', color: '#fff' };
    expect(decodeJsonTextColumns('areas', data)).toEqual(data);
  });

  it('leaves a non-string value (e.g. already decoded, or absent) alone', () => {
    expect(decodeJsonTextColumns('habits', { weekdays: [1, 2, 3] })).toEqual({ weekdays: [1, 2, 3] });
    expect(decodeJsonTextColumns('habits', {})).toEqual({});
  });
});

// Builds a minimal fake Supabase client whose `.from(table)` returns
// `response` (or throws it, per `throws`) for every write method
// (`upsert`/`update`/`delete`), matching just enough of the real
// `SupabaseClient` surface `uploadData` calls.
function fakeSupabase(response: { error: unknown }) {
  const eq = vi.fn().mockResolvedValue(response);
  const from = vi.fn(() => ({
    upsert: vi.fn().mockResolvedValue(response),
    update: vi.fn(() => ({ eq })),
    delete: vi.fn(() => ({ eq })),
  }));
  return { from } as unknown as SupabaseClient;
}

function fakeTransaction(crud: CrudTransaction['crud']) {
  return {
    crud,
    complete: vi.fn().mockResolvedValue(undefined),
  } as unknown as CrudTransaction;
}

function fakeDatabase(transaction: CrudTransaction | null) {
  return {
    getNextCrudTransaction: vi.fn().mockResolvedValue(transaction),
  } as unknown as CommonPowerSyncDatabase;
}

describe('PlannerBackendConnector.uploadData', () => {
  it('completes the transaction when every operation succeeds', async () => {
    const supabase = fakeSupabase({ error: null });
    const transaction = fakeTransaction([
      { op: UpdateType.PUT, table: 'areas', id: 'a1', opData: { name: 'x' } },
    ] as unknown as CrudTransaction['crud']);

    await new PlannerBackendConnector(supabase).uploadData(fakeDatabase(transaction));

    expect(transaction.complete).toHaveBeenCalledTimes(1);
  });

  it('drops a permanent error (e.g. unique violation) and still drains the queue', async () => {
    const supabase = fakeSupabase({ error: { code: '23505', message: 'duplicate key' } });
    const transaction = fakeTransaction([
      { op: UpdateType.PUT, table: 'areas', id: 'a1', opData: { name: 'dup' } },
    ] as unknown as CrudTransaction['crud']);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await new PlannerBackendConnector(supabase).uploadData(fakeDatabase(transaction));

    expect(transaction.complete).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('rethrows a transient error and never completes the transaction', async () => {
    const supabase = fakeSupabase({ error: { message: 'network error' } });
    const transaction = fakeTransaction([
      { op: UpdateType.PUT, table: 'areas', id: 'a1', opData: { name: 'x' } },
    ] as unknown as CrudTransaction['crud']);

    await expect(
      new PlannerBackendConnector(supabase).uploadData(fakeDatabase(transaction)),
    ).rejects.toMatchObject({ message: 'network error' });
    expect(transaction.complete).not.toHaveBeenCalled();
  });

  it('decodes a JSON-text column before upserting, so Supabase gets a real array not a JSON string', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ upsert })) } as unknown as SupabaseClient;
    const transaction = fakeTransaction([
      { op: UpdateType.PUT, table: 'habits', id: 'h1', opData: { title: 'x', weekdays: '[1,3,5]' } },
    ] as unknown as CrudTransaction['crud']);

    await new PlannerBackendConnector(supabase).uploadData(fakeDatabase(transaction));

    expect(upsert).toHaveBeenCalledWith({ title: 'x', weekdays: [1, 3, 5], id: 'h1' });
  });

  it('decodes a JSON-text column before a PATCH update too', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient;
    const transaction = fakeTransaction([
      { op: UpdateType.PATCH, table: 'habits', id: 'h1', opData: { weekdays: '[6,7]' } },
    ] as unknown as CrudTransaction['crud']);

    await new PlannerBackendConnector(supabase).uploadData(fakeDatabase(transaction));

    expect(update).toHaveBeenCalledWith({ weekdays: [6, 7] });
  });

  it('does nothing when there is no queued transaction', async () => {
    const supabase = fakeSupabase({ error: null });

    await expect(
      new PlannerBackendConnector(supabase).uploadData(fakeDatabase(null)),
    ).resolves.toBeUndefined();
  });
});
