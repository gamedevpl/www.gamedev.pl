// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { platform } from './platform/index.js';
import { useOrientationLock } from './useOrientationLock.js';
import type { DesiredOrientation } from './useOrientationMismatch.js';

function Harness({ desired, active }: { desired: DesiredOrientation; active: boolean }) {
  useOrientationLock(desired, active);
  return null;
}

describe('useOrientationLock', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let canLockSpy: ReturnType<typeof vi.spyOn>;
  let lockSpy: ReturnType<typeof vi.spyOn>;
  let unlockSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    canLockSpy = vi.spyOn(platform.orientation, 'canLock').mockReturnValue(true);
    lockSpy = vi.spyOn(platform.orientation, 'lock').mockResolvedValue(true);
    unlockSpy = vi.spyOn(platform.orientation, 'unlock').mockImplementation(() => undefined);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    vi.restoreAllMocks();
  });

  async function render(desired: DesiredOrientation, active: boolean) {
    root ??= createRoot(container);
    await act(async () => {
      root!.render(<Harness desired={desired} active={active} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('locks fixed orientations while active and unlocks when deactivated or unmounted', async () => {
    await render('landscape', true);
    expect(lockSpy).toHaveBeenCalledWith('landscape');
    expect(unlockSpy).not.toHaveBeenCalled();

    await render('landscape', false);
    expect(unlockSpy).toHaveBeenCalledTimes(1);
  });

  it('skips locking for any, adaptive, or unsupported browsers', async () => {
    await render('any', true);
    await render('adaptive', true);
    expect(lockSpy).not.toHaveBeenCalled();

    canLockSpy.mockReturnValue(false);
    await render('landscape', true);
    expect(lockSpy).not.toHaveBeenCalled();
  });

  it('re-acquires lock when returning to visible', async () => {
    await render('portrait', true);
    expect(lockSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(lockSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(lockSpy).toHaveBeenCalledTimes(2);
    expect(lockSpy).toHaveBeenLastCalledWith('portrait');
  });

  it('unlocks if unmounted while an orientation lock request is in flight', async () => {
    let finish!: (ok: boolean) => void;
    lockSpy.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );

    await render('landscape', true);
    act(() => {
      root?.unmount();
      root = null;
    });
    expect(unlockSpy).not.toHaveBeenCalled();

    await act(async () => {
      finish(true);
      await Promise.resolve();
    });
    expect(unlockSpy).toHaveBeenCalledTimes(1);
  });
});
