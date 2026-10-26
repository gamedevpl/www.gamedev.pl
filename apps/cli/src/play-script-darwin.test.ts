import {
  closeSync,
  constants,
  existsSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { onDarwinExit, startDarwinPipe } from './play-script-darwin.js';

it('waits for exit before cleanup when a disconnected helper is still exiting', () => {
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  const cleanup = vi.fn();
  onDarwinExit(child, cleanup);
  expect(cleanup).not.toHaveBeenCalled();
  child.emit('exit');
  child.emit('exit');
  expect(cleanup).toHaveBeenCalledOnce();
});

it.skipIf(process.platform === 'win32')('relays bytes and cleans the inherited directory', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'play-darwin-helper-'));
  const stat = statSync(cwd);
  const data = vi.fn();
  const failed = vi.fn();
  const helper = await startDarwinPipe({ cwd, dev: stat.dev, ino: stat.ino, source: 'client', data, failed });
  const req = openSync(join(cwd, 'requests.fifo'), constants.O_WRONLY | constants.O_NONBLOCK);
  const resp = openSync(join(cwd, 'responses.fifo'), constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    writeSync(req, 'hello');
    await vi.waitFor(() => expect(data).toHaveBeenCalledWith(Buffer.from('hello')));
    await helper.reply(Buffer.from('world'));
    const buffer = Buffer.alloc(5);
    expect(readSync(resp, buffer)).toBe(5);
    expect(buffer.toString()).toBe('world');
    const stopped = new Promise<void>((resolve) => helper.close(resolve));
    await stopped;
    expect(existsSync(join(cwd, 'client.mjs'))).toBe(false);
    expect(failed).not.toHaveBeenCalled();
  } finally {
    closeSync(req);
    closeSync(resp);
    rmSync(cwd, { recursive: true, force: true });
  }
});
