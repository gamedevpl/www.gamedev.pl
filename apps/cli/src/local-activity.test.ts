import { expect, it, vi } from 'vitest';
import { localActivity } from './local-activity.js';
import type { ApiClient } from './api.js';
it('coalesces a fast completion behind the initial request', async () => {
  let resolve!: (value: unknown) => void;
  const request = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue({ ok: true });
  const tracker = localActivity({ request } as unknown as ApiClient, 'token', 'codex');
  tracker.phase('editing');
  tracker.finish('ready');
  resolve({ ok: true });
  await new Promise((r) => setTimeout(r, 0));
  expect(request.mock.calls[0][2]).toMatchObject({ phase: 'preparing', start: true });
  expect(request.mock.calls[1][2]).toMatchObject({ phase: 'ready' });
  expect(request.mock.calls[1][2].runId).toBe(request.mock.calls[0][2].runId);
});
it('does not reclaim a newer run after an uncertain initial response', async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true });
  const tracker = localActivity({ request } as unknown as ApiClient, 'token', 'claude');
  await new Promise((r) => setTimeout(r, 0));
  tracker.finish('failed');
  expect(request.mock.calls[1][2]).not.toHaveProperty('start');
});
