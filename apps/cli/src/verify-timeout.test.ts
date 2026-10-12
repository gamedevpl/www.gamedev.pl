import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { spawnCommand } from './delegate.js';
import { runLadderAsync } from './verify.js';

vi.mock('./delegate.js', async (original) => ({
  ...(await original<typeof import('./delegate.js')>()),
  spawnCommand: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

function simulatedChecks(gameMs: number) {
  vi.useFakeTimers();
  vi.mocked(spawnCommand).mockImplementation((input) => {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
    const timer =
      input.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            input.onTimeout?.();
            child.stderr.emit('data', 'last trace output');
            child.emit('close', 0);
          }, input.timeoutMs);
    setTimeout(
      () => {
        clearTimeout(timer);
        child.emit('close', 0);
      },
      input.args[1] === 'check:game' ? gameMs : 1,
    );
    return child as unknown as ChildProcess;
  });
  return runLadderAsync({
    cwd: '/tmp/game',
    slug: 'trenchline-command',
    publish: true,
    abort: new AbortController().signal,
  });
}

it.each([undefined, '0'])('allows a 30-minute publication check with timeout=%s', async (value) => {
  vi.stubEnv('GAMEDEV_CHECK_GAME_TIMEOUT_SECONDS', value);
  const result = simulatedChecks(30 * 60_000);
  await vi.advanceTimersByTimeAsync(31 * 60_000);
  expect(await result).toEqual({ ok: true });
  expect(vi.mocked(spawnCommand).mock.calls.map(([input]) => input.timeoutMs)).toEqual([300_000, 300_000, undefined]);
});

it('reports the configured timeout and logs even when termination exits zero', async () => {
  vi.stubEnv('GAMEDEV_CHECK_GAME_TIMEOUT_SECONDS', '300');
  const result = simulatedChecks(30 * 60_000);
  await vi.advanceTimersByTimeAsync(301_000);
  expect(await result).toEqual({
    ok: false,
    stage: 'check_game',
    detail: 'npm run check:game -- trenchline-command timed out after 300s.\nlast trace output',
  });
});

it.each(['', '-1', '1.5', 'invalid', '2147484'])('rejects invalid timeout %s', async (value) => {
  vi.stubEnv('GAMEDEV_CHECK_GAME_TIMEOUT_SECONDS', value);
  vi.mocked(spawnCommand).mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', 0));
    return child as ChildProcess;
  });
  await expect(
    runLadderAsync({ cwd: '/tmp/game', publish: true, abort: new AbortController().signal }),
  ).rejects.toThrow('GAMEDEV_CHECK_GAME_TIMEOUT_SECONDS must be');
});
