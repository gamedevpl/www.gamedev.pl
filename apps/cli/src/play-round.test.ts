import { expect, it, vi } from 'vitest';
import type { ApiClient } from './api.js';
import { playRound } from './play-round.js';
import type { Workshop } from './workshop.js';

it('opens a self-built improvement, then uses its token for later turns', async () => {
  const ws = { token: 'old', slug: 'airtime', builder: 'platform' } as Workshop;
  const request = vi.fn(async (_method: string, path: string) => {
    if (path === '/api/submissions/old') return { status: 'published' };
    if (path === '/api/submissions/old/improve') return { ok: true, token: 'new', slug: 'airtime' };
    if (path === '/api/submissions/new') return { status: 'building', builder: 'self' };
    if (path === '/api/submissions/new/turn') return { kind: 'build', roundId: 2 };
    throw Error(path);
  });
  const opened = vi.fn();
  const round = playRound({ request } as unknown as ApiClient, ws, opened);
  expect(await round('fix the jump')).toContain('improvement round is open');
  expect(request).toHaveBeenCalledWith('POST', '/api/submissions/old/improve', {
    feedback: 'fix the jump',
    builder: 'self',
  });
  expect(ws).toMatchObject({ token: 'new', builder: 'self' });
  expect(opened).toHaveBeenCalledWith('new');
  expect(await round('make it faster')).toContain('Round 2 is open');
  expect(request).toHaveBeenLastCalledWith('POST', '/api/submissions/new/turn', { text: 'make it faster' });
});

it('keeps the published round and tells the agent not to edit when the platform replies', async () => {
  const ws = { token: 'old', slug: 'airtime', builder: 'platform' } as Workshop;
  const request = vi.fn(async (_method: string, path: string) =>
    path.endsWith('/improve') ? { ok: true, reply: 'Which part?' } : { status: 'published' },
  );
  const opened = vi.fn();
  expect(await playRound({ request } as unknown as ApiClient, ws, opened)('fix it')).toContain(
    'Change nothing. Which part?',
  );
  expect(ws.token).toBe('old');
  expect(opened).not.toHaveBeenCalled();
});

it('does not open a round if stopped during the status read', async () => {
  const ws = { token: 'old', slug: 'airtime', builder: 'platform' } as Workshop;
  const controller = new AbortController();
  const request = vi.fn(async () => {
    controller.abort();
    return { status: 'published' };
  });
  await expect(playRound({ request } as unknown as ApiClient, ws, vi.fn())('fix', controller.signal)).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
  expect(ws.token).toBe('old');
});

it('refuses a different or incomplete game receipt and a platform-owned round', async () => {
  const ws = { token: 'old', slug: 'airtime', builder: 'platform' } as Workshop;
  const request = vi.fn(async (_method: string, path: string) =>
    path.endsWith('/improve') ? { ok: true, token: 'new', slug: 'other' } : { status: 'published' },
  );
  const round = playRound({ request } as unknown as ApiClient, ws, vi.fn());
  await expect(round('change')).rejects.toThrow('different game');
  expect(ws.token).toBe('old');
  request.mockImplementation(async (_method, path) =>
    path.endsWith('/improve') ? { ok: true, token: 'new' } : { status: 'published' },
  );
  await expect(round('change')).rejects.toThrow('incomplete round receipt');
  request.mockResolvedValue({ status: 'building', builder: 'platform' });
  expect(await round('change')).toContain('Change nothing');
});
