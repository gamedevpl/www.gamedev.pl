// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPendingShellUpdate, pendingShellUpdate, SHELL_UPDATED_EVENT, watchShellUpdates } from './shellUpdate.js';

describe('shellUpdate', () => {
  let serviceWorker: EventTarget & {
    getRegistration: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    sessionStorage.clear();
    serviceWorker = Object.assign(new EventTarget(), {
      getRegistration: vi.fn(async () => null),
    });
    Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true });
  });

  afterEach(() => {
    sessionStorage.clear();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    vi.restoreAllMocks();
  });

  it('parks a shell-updated message so a late banner mount can still see it', () => {
    const onParked = vi.fn();
    window.addEventListener(SHELL_UPDATED_EVENT, onParked);
    watchShellUpdates();

    const event = new Event('message') as MessageEvent;
    Object.defineProperty(event, 'data', { value: { type: 'shell-updated', revision: 'abc123' } });
    serviceWorker.dispatchEvent(event);

    expect(pendingShellUpdate()).toBe('abc123');
    expect(onParked).toHaveBeenCalledOnce();
    window.removeEventListener(SHELL_UPDATED_EVENT, onParked);
  });

  it('ignores unrelated worker messages', () => {
    watchShellUpdates();
    const event = new Event('message') as MessageEvent;
    Object.defineProperty(event, 'data', { value: { type: 'push-received' } });
    serviceWorker.dispatchEvent(event);
    expect(pendingShellUpdate()).toBeNull();
  });

  it('clears the pending flag when the banner is dismissed or reloaded', () => {
    watchShellUpdates();
    const event = new Event('message') as MessageEvent;
    Object.defineProperty(event, 'data', { value: { type: 'shell-updated', revision: 'abc123' } });
    serviceWorker.dispatchEvent(event);
    clearPendingShellUpdate();
    expect(pendingShellUpdate()).toBeNull();
  });

  it('reloads once when the worker reports a missing shell asset', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    });
    watchShellUpdates();

    const event = new Event('message') as MessageEvent;
    Object.defineProperty(event, 'data', { value: { type: 'shell-asset-miss', revision: 'abc123' } });
    serviceWorker.dispatchEvent(event);
    serviceWorker.dispatchEvent(event);

    expect(reload).toHaveBeenCalledOnce();
  });

  it('asks the registration to update when the app returns to the foreground', async () => {
    const update = vi.fn(async () => undefined);
    serviceWorker.getRegistration.mockResolvedValue({ update });

    Object.defineProperty(document, 'readyState', { configurable: true, value: 'complete' });
    watchShellUpdates();
    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    const afterBoot = update.mock.calls.length;

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(update.mock.calls.length).toBeGreaterThan(afterBoot));
  });
});
