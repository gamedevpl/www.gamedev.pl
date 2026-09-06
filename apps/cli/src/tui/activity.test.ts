import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../api.js';
import { activityApi } from './activity.js';

describe('foreground progress', () => {
  it('shows the pending network step and restores builder activity when it completes', async () => {
    let finish: (value: unknown) => void = () => {};
    const restore = vi.fn();
    const update = vi.fn(() => restore);
    const api = {
      origin: 'https://example.test',
      request: vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    } as unknown as ApiClient;
    const pending = activityApi(api, update).request('POST', '/api/cli/chat', { text: 'hello' });
    expect(update).toHaveBeenCalledWith('Thinking about your request');
    expect(restore).not.toHaveBeenCalled();
    finish({ kind: 'reply' });
    await pending;
    expect(restore).toHaveBeenCalledOnce();
  });
  it('restores activity after a failure without exposing tokens in status text', async () => {
    const restore = vi.fn();
    const update = vi.fn(() => restore);
    const api = {
      request: vi.fn(async () => {
        throw new Error('offline');
      }),
    } as unknown as ApiClient;
    await expect(activityApi(api, update).request('POST', '/api/submissions/secret-token/turn')).rejects.toThrow(
      'offline',
    );
    expect(update).toHaveBeenCalledWith('Preparing your changes');
    expect(restore).toHaveBeenCalledOnce();
  });
});
