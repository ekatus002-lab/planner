import { render } from '@testing-library/react';
import { SyncStatus, type SyncStatusModel } from './sync-status';

type PartialStatus = {
  connected: boolean;
  uploading: boolean;
  syncError?: string | null;
};

function renderStatus({ connected, uploading, syncError = null }: PartialStatus) {
  const model: SyncStatusModel = {
    connected,
    hasPendingUploads: uploading,
    syncError,
  };

  const { container } = render(<SyncStatus model={model} />);
  return container;
}

it('shows Offline when disconnected', () => {
  expect(renderStatus({ connected: false, uploading: false })).toHaveTextContent('Offline');
});

it('shows Syncing while connected with pending uploads', () => {
  expect(renderStatus({ connected: true, uploading: true })).toHaveTextContent('Syncing');
});

it('shows Synced when connected with nothing pending', () => {
  expect(renderStatus({ connected: true, uploading: false })).toHaveTextContent('Synced');
});

it('shows Sync error when a sync error is present, even with pending uploads', () => {
  expect(
    renderStatus({ connected: true, uploading: true, syncError: 'Network request failed' }),
  ).toHaveTextContent('Sync error');
});

it('treats Offline as taking priority over a stale sync error', () => {
  expect(
    renderStatus({ connected: false, uploading: false, syncError: 'Network request failed' }),
  ).toHaveTextContent('Offline');
});

it('renders the label in an aria-live region so status changes are announced', () => {
  const container = renderStatus({ connected: true, uploading: false });
  expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Synced');
});
