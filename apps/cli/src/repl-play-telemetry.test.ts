import { expect, it, vi } from 'vitest';
import { runReplPlay } from './repl-play.js';
import type { ApiClient } from './api.js';

it('records play_requested in the worker preview path without game dimensions', async () => {
  const telemetry = { record: vi.fn(), flush: vi.fn() };
  const openPreview = vi.fn(async () => true);
  await runReplPlay(
    {
      api: { origin: 'https://example.test' } as ApiClient,
      token: null,
      cwd: '/tmp',
      env: {},
      write: vi.fn(),
      telemetry,
      openPreview,
    },
    '/play telemetry-fixture',
  );
  expect(openPreview).toHaveBeenCalledWith('https://example.test/play/telemetry-fixture');
  expect(telemetry.record).toHaveBeenCalledExactlyOnceWith('play_requested');
});
