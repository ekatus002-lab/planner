import type { ReactNode } from 'react';
import { PowerSyncContext } from '@powersync/react';
import type { TestDatabase } from './sqlite-test-db';

type PowerSyncTestProviderProps = {
  db: TestDatabase;
  children: ReactNode;
};

// Test-only counterpart to `PowerSyncSystemProvider`: exposes a real,
// pre-seeded `@powersync/node` database (see `sqlite-test-db.ts`) through the
// same `PowerSyncContext` the app's hooks/components read from, without
// pulling in Supabase auth-session wiring. `@powersync/react`'s context is
// typed against `@powersync/common`'s `AbstractPowerSyncDatabase`; the test
// database is `@powersync/node`'s structurally-identical `CommonPowerSyncDatabase`
// (the same cross-package relationship `sqlite-test-db.ts` already relies on
// for repository tests), so the cast below is a type-identity formality, not
// a behavioral one.
export function PowerSyncTestProvider({ db, children }: PowerSyncTestProviderProps) {
  return (
    <PowerSyncContext.Provider value={db as unknown as Parameters<typeof PowerSyncContext.Provider>[0]['value']}>
      {children}
    </PowerSyncContext.Provider>
  );
}
