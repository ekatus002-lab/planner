'use client';

import { useStatus } from '@powersync/react';

/**
 * A plain, framework-agnostic view of PowerSync's live sync state. Kept
 * separate from `@powersync/common`'s `SyncStatus` interface so the
 * presentational `SyncStatus` component below can be unit tested without a
 * PowerSync database or context.
 */
export type SyncStatusModel = {
  connected: boolean;
  hasPendingUploads: boolean;
  syncError: string | null;
};

export type SyncStatusLabel = 'Offline' | 'Sync error' | 'Syncing' | 'Synced';

/**
 * Maps a `SyncStatusModel` to one of the four visible sync states. Order
 * matters: an offline client can't be usefully "erroring" or "syncing", and a
 * pending upload isn't "synced" yet even if a previous error already cleared.
 */
export function deriveSyncStatusLabel({
  connected,
  hasPendingUploads,
  syncError,
}: SyncStatusModel): SyncStatusLabel {
  if (!connected) return 'Offline';
  if (syncError) return 'Sync error';
  if (hasPendingUploads) return 'Syncing';
  return 'Synced';
}

type SyncStatusProps = {
  model: SyncStatusModel;
};

/**
 * Renders the current sync state as a short, `aria-live="polite"` label so
 * assistive tech announces transitions (e.g. Offline -> Syncing -> Synced)
 * without needing focus.
 */
export function SyncStatus({ model }: SyncStatusProps) {
  return (
    <span aria-live="polite" className="text-sm text-muted-foreground">
      {deriveSyncStatusLabel(model)}
    </span>
  );
}

/**
 * Reads PowerSync's live `SyncStatus` (via `@powersync/react`'s `useStatus`)
 * and adapts it into the plain `SyncStatusModel` shape `SyncStatus` renders.
 * Must be used within a `PowerSyncContext.Provider` (see
 * `PowerSyncSystemProvider`).
 */
export function useSyncStatusModel(): SyncStatusModel {
  const status = useStatus();
  const error = status.uploadError ?? status.downloadError ?? null;

  return {
    connected: status.connected,
    hasPendingUploads: status.uploading,
    syncError: error ? error.message : null,
  };
}

/** Convenience wrapper that wires the live PowerSync status into `SyncStatus`. */
export function SyncStatusIndicator() {
  const model = useSyncStatusModel();
  return <SyncStatus model={model} />;
}
