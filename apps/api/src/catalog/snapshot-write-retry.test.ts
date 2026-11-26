import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGcsSnapshotStore } from './game-snapshot.js';
import { describeTransportError, retrySnapshotWrite } from './snapshot-write-retry.js';

afterEach(() => vi.useRealTimers());

function socketError(message: string, code: string): TypeError {
  const cause = Object.assign(new Error(message), { code });
  return new TypeError('fetch failed', { cause });
}

describe('describeTransportError', () => {
  it('surfaces error.cause code and message for Node fetch failures', () => {
    expect(describeTransportError(socketError('other side closed', 'UND_ERR_SOCKET'))).toBe(
      'fetch failed (UND_ERR_SOCKET: other side closed)',
    );
  });

  it('handles nested causes and prevents cycles', () => {
    const root: Error & { code?: string; cause?: unknown } = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET',
    });
    const wrapper = new TypeError('fetch failed', { cause: root });
    root.cause = wrapper;
    expect(describeTransportError(wrapper)).toBe('fetch failed (ECONNRESET: read ECONNRESET)');
  });

  it('returns plain error messages unchanged when no cause is present', () => {
    expect(describeTransportError(new Error('socket timeout'))).toBe('socket timeout');
  });
});

describe('retrySnapshotWrite', () => {
  it('retries transient transport failures with exponential backoff', async () => {
    const delays: number[] = [];
    const send = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(socketError('other side closed', 'UND_ERR_SOCKET'))
      .mockRejectedValueOnce(socketError('read ECONNRESET', 'ECONNRESET'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const response = await retrySnapshotWrite('snapshots/s1/games/checker-champ.json', send, {
      random: () => 0,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    expect(response.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([500, 1000]);
  });

  it.each([408, 429, 500, 502, 503, 504])('retries transient HTTP %i responses', async (status) => {
    const send = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response('retry me', { status }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const response = await retrySnapshotWrite('snapshots/s1/games/a.json', send, {
      random: () => 0,
      sleep: async () => {},
    });

    expect(response.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 412])('does not retry non-retryable HTTP %i responses', async (status) => {
    const send = vi.fn<() => Promise<Response>>(async () => new Response('nope', { status }));

    const response = await retrySnapshotWrite('snapshots/s1/games/a.json', send, {
      sleep: async () => {},
    });

    expect(response.status).toBe(status);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After up to maxDelayMs', async () => {
    const delays: number[] = [];
    const send = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '3' } }))
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '120' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await retrySnapshotWrite('snapshots/s1/games/a.json', send, {
      maxDelayMs: 10_000,
      random: () => 0,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    expect(delays).toEqual([3000, 10_000]);
  });

  it('wraps exhausted transport errors with object name and cause details', async () => {
    const send = vi.fn<() => Promise<Response>>().mockRejectedValue(socketError('other side closed', 'UND_ERR_SOCKET'));

    await expect(
      retrySnapshotWrite('snapshots/s1/games/tower-defence.json', send, {
        maxRetries: 2,
        sleep: async () => {},
      }),
    ).rejects.toThrow(
      'snapshot write of snapshots/s1/games/tower-defence.json failed: fetch failed (UND_ERR_SOCKET: other side closed)',
    );
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('does not retry AbortError', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    const send = vi.fn<() => Promise<Response>>().mockRejectedValue(abort);

    await expect(
      retrySnapshotWrite('snapshots/s1/games/a.json', send, {
        sleep: async () => {},
      }),
    ).rejects.toThrow('snapshot write of snapshots/s1/games/a.json failed: aborted');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns the final retryable HTTP response once retries are exhausted', async () => {
    const send = vi.fn<() => Promise<Response>>(async () => new Response('still unavailable', { status: 503 }));

    const response = await retrySnapshotWrite('snapshots/s1/games/a.json', send, {
      maxRetries: 2,
      sleep: async () => {},
    });

    expect(response.status).toBe(503);
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe('createGcsSnapshotStore write retries', () => {
  it('recovers putGame from a transient socket reset', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(socketError('other side closed', 'UND_ERR_SOCKET'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const store = createGcsSnapshotStore({
      bucket: 'gamedev-snapshots',
      fetchImpl,
      getAccessToken: async () => 'fake-token',
    });

    const pending = store.putGame('snap1', { slug: 'checker-champ', title: 'Checker Champ', html: '<!doctype html>' });
    await vi.runAllTimersAsync();
    await pending;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('surfaces transport cause when putMedia exhausts retries', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(socketError('read ECONNRESET', 'ECONNRESET'));
    const store = createGcsSnapshotStore({
      bucket: 'gamedev-snapshots',
      fetchImpl,
      getAccessToken: async () => 'fake-token',
    });

    const check = expect(
      store.putMedia('snap1', 'tower-defence', 'opening.png', { body: Buffer.from('png'), contentType: 'image/png' }),
    ).rejects.toThrow(/snapshots\/snap1\/media\/tower-defence\/opening\.png.*ECONNRESET/);
    await vi.runAllTimersAsync();
    await check;
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
});
