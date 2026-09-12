import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { startLocalPlay } from './play.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn((_command, _args, options) => {
    writeSync(options.stdio[2], 'listen EPERM: loopback permission denied');
    const child = Object.assign(new EventEmitter(), { unref: vi.fn(), kill: vi.fn() });
    queueMicrotask(() => child.emit('exit', 1));
    return child;
  }),
}));

it('retains private startup diagnostics when the preview child exits', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-startup-'));
  try {
    let message = '';
    try {
      await startLocalPlay({ root, slug: 'robot', env: {}, prepared: true, write: () => {} });
    } catch (error) {
      message = String((error as { next?: string }).next);
    }
    const log = /Startup diagnostics: (.+\/startup\.log)\./.exec(message)?.[1];
    expect(log).toBeTruthy();
    expect(readFileSync(log!, 'utf8')).toContain('listen EPERM');
    if (process.platform !== 'win32') expect(statSync(log!).mode & 0o777).toBe(0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
