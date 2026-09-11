import { expect, it, vi } from 'vitest';
import { repairLoop } from './repair-loop.js';

it('bounds repeated validation repairs and reports the final diagnostic', async () => {
  const run = vi.fn(async () => true);
  const write = vi.fn();
  const verify = vi.fn(async () => ({
    ok: false as const,
    stage: 'check_static' as const,
    detail: 'EDITOR.json stale',
  }));
  expect(
    await repairLoop({
      brief: 'build',
      run,
      verify,
      write,
      abort: new AbortController().signal,
      activity: () => {},
      failed: () => {},
    }),
  ).toBe(false);
  expect(run).toHaveBeenCalledTimes(3);
  expect(verify).toHaveBeenCalledTimes(3);
  expect(write).toHaveBeenLastCalledWith(expect.stringContaining('Nothing was delivered'));
});

it('does not retry a failed agent process or run validation after it', async () => {
  const run = vi.fn(async () => false);
  const verify = vi.fn();
  expect(
    await repairLoop({
      brief: 'build',
      run,
      verify,
      write: () => {},
      abort: new AbortController().signal,
      activity: () => {},
      failed: () => {},
    }),
  ).toBe(false);
  expect(run).toHaveBeenCalledTimes(1);
  expect(verify).not.toHaveBeenCalled();
});
