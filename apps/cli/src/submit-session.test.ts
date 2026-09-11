import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api.js';
import { prepareDeliverySession } from './submit-session.js';

const locked = { locked: true, canTakeOver: true, jobId: 10, generation: 3 };
describe('delivery session', () => {
  it('does not disconnect an agent during ordinary delivery', async () => {
    const request = vi.fn().mockResolvedValue(locked);
    const api = { request } as unknown as ApiClient;
    await expect(prepareDeliverySession(api, 'game')).rejects.toMatchObject({
      next: expect.stringContaining('In the interactive session: /push --takeover.'),
    });
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('uses the session confirmed by the creator and propagates a conflict', async () => {
    const request = vi.fn().mockRejectedValue(new Error('round_changed'));
    const api = { request } as unknown as ApiClient;
    await expect(prepareDeliverySession(api, 'game', true, locked)).rejects.toThrow('round_changed');
    expect(request).toHaveBeenCalledExactlyOnceWith('POST', '/api/me/studio/games/game/sources/session', {
      jobId: 10,
      generation: 3,
      stopAgent: true,
    });
  });
  it('never takes a managed agent even with the explicit flag', async () => {
    const request = vi.fn().mockResolvedValue({ ...locked, canTakeOver: false });
    await expect(prepareDeliverySession({ request } as unknown as ApiClient, 'game', true)).rejects.toThrow('blocked');
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});
