import { expect, it, vi } from 'vitest';
import { codeTelemetry } from './workbench-code-telemetry.js';

it('deduplicates adoption steps, caps completion sampling and sends no code, paths or credentials', async () => {
  const send = vi.fn<typeof fetch>(async () => new Response('{}'));
  const record = codeTelemetry('http://platform.invalid', send);
  record({ type: 'code_step', step: 'opened' });
  record({ type: 'code_step', step: 'opened' });
  expect(send).toHaveBeenCalledTimes(1);
  const body = JSON.parse(send.mock.calls[0][1]!.body as string);
  expect(body.events[0]).toMatchObject({ type: 'code_step', step: 'opened', codeSurface: 'local_play' });
  expect(() => record({ type: 'code_step', step: 'edited', path: 'private.ts' })).toThrow();
  for (let i = 0; i < 60; i++)
    record({ type: 'code_completion', kind: 'ghost_text', outcome: 'accepted', latencyMs: 2.2, completionChars: 5 });
  expect(send).toHaveBeenCalledTimes(51);
  expect(send.mock.calls.every(([, options]) => !('Authorization' in (options!.headers as object)))).toBe(true);
});
