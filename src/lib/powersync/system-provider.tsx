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

    // PowerSync's own retry/backoff loop can take a while to notice a lost
    // connection or an unblocked network. React to the browser's own
    // connectivity events too, so the sync status flips to "Offline"
    // immediately when the network drops and reconnects promptly as soon as
    // it's back - the local database write path never depends on this, but a
    // snappy status keeps the exit criterion ("reconnect uploads queued
    // changes ... another device receives them") observable within a normal
    // test/manual-verification timeout.
    function handleOffline() {
      void plannerDb.disconnect();
    }

    function handleOnline() {
      void connectIfSignedIn();
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
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
