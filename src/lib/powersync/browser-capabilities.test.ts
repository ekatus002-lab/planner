import { afterEach, describe, expect, it } from 'vitest';
import { supportsOPFS } from './browser-capabilities';

// jsdom (this project's Vitest environment) has no File System Access API
// and is never cross-origin-isolated by default, so `navigator.storage` and
// `window.crossOriginIsolated` both start out `undefined` here - each test
// stubs in only what it needs and restores the original value afterwards.
function stubGetDirectory(getDirectory: (() => Promise<unknown>) | undefined) {
  const original = (navigator as unknown as { storage?: unknown }).storage;
  Object.defineProperty(navigator, 'storage', {
    value: getDirectory ? { getDirectory } : undefined,
    configurable: true,
  });
  return () => {
    Object.defineProperty(navigator, 'storage', { value: original, configurable: true });
  };
}

function stubCrossOriginIsolated(value: boolean | undefined) {
  const hadOwnProperty = Object.prototype.hasOwnProperty.call(window, 'crossOriginIsolated');
  const original = (window as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated;
  Object.defineProperty(window, 'crossOriginIsolated', { value, configurable: true });
  return () => {
    if (hadOwnProperty) {
      Object.defineProperty(window, 'crossOriginIsolated', { value: original, configurable: true });
    } else {
      delete (window as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated;
    }
  };
}

describe('supportsOPFS', () => {
  const restoreFns: Array<() => void> = [];

  afterEach(() => {
    while (restoreFns.length > 0) {
      restoreFns.pop()?.();
    }
  });

  it('is false when the File System Access API is unavailable, even in a cross-origin-isolated context', () => {
    restoreFns.push(stubGetDirectory(undefined));
    restoreFns.push(stubCrossOriginIsolated(true));

    expect(supportsOPFS()).toBe(false);
  });

  it('is false when the browser is not cross-origin-isolated, even though OPFS itself is available', () => {
    // The regression this guards against: COOP/COEP headers (next.config.ts)
    // get stripped by some hosting layer, `SharedArrayBuffer` becomes
    // unavailable to `OPFSCoopSyncVFS`, but `navigator.storage.getDirectory`
    // still exists - selecting the OPFS VFS here would fail at runtime
    // instead of falling back to `IDBBatchAtomicVFS`.
    restoreFns.push(stubGetDirectory(() => Promise.resolve()));
    restoreFns.push(stubCrossOriginIsolated(false));

    expect(supportsOPFS()).toBe(false);
  });

  it('is true only when both OPFS and cross-origin isolation are available', () => {
    restoreFns.push(stubGetDirectory(() => Promise.resolve()));
    restoreFns.push(stubCrossOriginIsolated(true));

    expect(supportsOPFS()).toBe(true);
  });
});
