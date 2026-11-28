// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { webOrientation } from './orientation.js';

describe('webOrientation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports unsupported when screen.orientation.lock is absent', async () => {
    vi.stubGlobal('screen', { orientation: {} });
    expect(webOrientation.canLock()).toBe(false);
    expect(await webOrientation.lock('landscape')).toBe(false);
  });

  it('locks and unlocks through screen.orientation', async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    const unlock = vi.fn();
    vi.stubGlobal('screen', { orientation: { lock, unlock } });

    expect(webOrientation.canLock()).toBe(true);
    expect(await webOrientation.lock('landscape')).toBe(true);
    expect(lock).toHaveBeenCalledWith('landscape');

    webOrientation.unlock();
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('returns false when lock rejects and swallows unlock errors', async () => {
    const lock = vi.fn().mockRejectedValue(new DOMException('Unsupported', 'NotSupportedError'));
    const unlock = vi.fn(() => {
      throw new Error('no lock');
    });
    vi.stubGlobal('screen', { orientation: { lock, unlock } });

    expect(await webOrientation.lock('portrait')).toBe(false);
    expect(() => webOrientation.unlock()).not.toThrow();
  });
});
