import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api.js';
import { offerSubmit, type Workshop } from './workshop.js';

describe('locked delivery offer', () => {
  it.each([false, true])('does not take over on decline or unattended=%s', async (unattended) => {
    const request = vi.fn().mockResolvedValue({ locked: true, canTakeOver: true, jobId: 10, generation: 2 });
    const pick = vi.fn().mockResolvedValue('not yet — keep editing');
    const write = vi.fn();
    const ws = { slug: 'game', pick, ...(unattended ? { unattended: { deliver: true } } : {}) } as unknown as Workshop;
    await offerSubmit({ api: { request } as unknown as ApiClient, ws, write });
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
    if (unattended) expect(pick).not.toHaveBeenCalled();
    else expect(pick.mock.calls[0][0][0]).toContain('disconnect the old agent');
    expect(write).toHaveBeenCalled();
  });
});
