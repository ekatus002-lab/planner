'use client';

import { PowerSyncContext } from '@powersync/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { PlannerBackendConnector } from './backend-connector';
import { plannerDb } from './database';

interface PowerSyncSystemProviderProps {
  children: ReactNode;
}

/**
 * Makes the local-first `plannerDb` PowerSync database available to planner
 * descendants via `PowerSyncContext`, and keeps its sync connection in step
 * with the current Supabase auth session: connected while signed in,
 * disconnected on logout/unmount.
 */
export function PowerSyncSystemProvider({ children }: PowerSyncSystemProviderProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const connector = useMemo(() => new PlannerBackendConnector(supabase), [supabase]);
  const [isDatabaseReady, setIsDatabaseReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    plannerDb.waitForReady().then(() => {
      if (!cancelled) {
        setIsDatabaseReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    async function connectIfSignedIn() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        await plannerDb.connect(connector);
      } else {
        await plannerDb.disconnect();
      }
    }

    connectIfSignedIn();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        void plannerDb.connect(connector);
      } else {
        void plannerDb.disconnect();
      }
    });

    return () => {
      subscription.unsubscribe();
      void plannerDb.disconnect();
    };
  }, [supabase, connector]);

  if (!isDatabaseReady) {
    return (
      <div className="min-h-screen bg-background p-6 text-sm text-muted-foreground">
        Загрузка локальной базы данных…
      </div>
    );
  }

  return (
    <PowerSyncContext.Provider value={plannerDb}>
      {children}
    </PowerSyncContext.Provider>
  );
}
