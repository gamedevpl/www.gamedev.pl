import { afterEach, describe, expect, it, vi } from 'vitest';
import { castVote, clearVote, fetchVotes } from './votesApi';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchVotes', () => {
  it('returns the counts and the caller’s own vote from the response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ up: 3, down: 1, mine: 'up' }), { status: 200 }),
    );
    expect(await fetchVotes('brick-storm')).toEqual({ up: 3, down: 1, mine: 'up' });
  });

  it('sends credentials so a signed-in caller also learns their own vote', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ up: 0, down: 0, mine: null }), { status: 200 }));
    await fetchVotes('brick-storm');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('/api/games/brick-storm/votes'), {
      credentials: 'include',
    });
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));
    await expect(fetchVotes('unknown')).rejects.toThrow(/404/);
  });
});

describe('castVote', () => {
  it('POSTs the value and returns the updated counts', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ up: 1, down: 0, mine: 'up' }), { status: 200 }));
    const result = await castVote('brick-storm', 'up');
    expect(result).toEqual({ up: 1, down: 0, mine: 'up' });

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api/games/brick-storm/vote');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ value: 'up' });
  });

  it('throws on a non-ok response rather than reporting a vote that did not land', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(castVote('brick-storm', 'up')).rejects.toThrow(/401/);
  });
});

describe('clearVote', () => {
  it('sends a DELETE and returns the updated counts', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ up: 0, down: 0, mine: null }), { status: 200 }));
    const result = await clearVote('brick-storm');
    expect(result).toEqual({ up: 0, down: 0, mine: null });

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api/games/brick-storm/vote');
    expect(init?.method).toBe('DELETE');
  });
});
