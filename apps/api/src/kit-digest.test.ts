import { describe, expect, it, vi } from 'vitest';
import { appendKitDigest, createGcsKitDigestLoader } from './kit-digest.js';

describe('Creator Kit digest loader', () => {
  it('reads the digest matching the current engine ref and caches it', async () => {
    const readObject = vi
      .fn()
      .mockResolvedValueOnce(Buffer.from(JSON.stringify({ engineRef: 'abc123' })))
      .mockResolvedValueOnce(Buffer.from('# digest'));
    const loader = createGcsKitDigestLoader({ objectStore: { readObject } });

    expect(await loader.load()).toBe('# digest');
    expect(await loader.load()).toBe('# digest');
    expect(readObject).toHaveBeenCalledTimes(2);
    expect(readObject).toHaveBeenNthCalledWith(2, 'kits/abc123.digest.md');
  });

  it('fails open when the registry or digest is unavailable', async () => {
    const log = vi.fn();
    const loader = createGcsKitDigestLoader({
      objectStore: { readObject: vi.fn().mockRejectedValue(new Error('offline')) },
      log,
    });

    expect(await loader.load()).toBeUndefined();
    expect(log).toHaveBeenCalled();
  });

  it('keeps the base prompt and appends the digest', () => {
    expect(appendKitDigest('base', 'rules')).toBe('base\n\n## Creator Kit digest\n\nrules');
    expect(appendKitDigest(undefined, 'rules')).toBe('## Creator Kit digest\n\nrules');
    expect(appendKitDigest('base', undefined)).toBe('base');
  });
});
