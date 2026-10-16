import { Writable } from 'node:stream';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api.js';
import { historyStream } from './history-stream.js';
import { dispatchReadVerb } from './verbs.js';

const page = {
  versions: [
    {
      version: 'v2',
      createdAt: '2026-10-16T00:00:00Z',
      summary: 'Before next page',
      verdict: 'passed',
      sourceFiles: [],
    },
  ],
  hasMore: true,
  nextCursor: 'v2',
};
const io = (stdout: Writable) => ({ stdin: { isTTY: true }, stdout: stdout as unknown as NodeJS.WriteStream });

describe('unpaged history streams', () => {
  it('waits for stdout drain before requesting another history page', async () => {
    let flush: (() => void) | undefined;
    const output = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, done) {
        flush = () => done();
      },
    });
    let calls = 0;
    const api = {
      request: async () => (++calls === 1 ? page : { versions: [], hasMore: false }),
    } as unknown as ApiClient;
    const run = dispatchReadVerb({ verb: 'log', args: ['probe'], flags: {}, api, io: io(output) });
    await vi.waitFor(() => expect(flush).toBeTypeOf('function'));
    expect(calls).toBe(1);
    expect(output.writableNeedDrain).toBe(true);
    flush!();
    expect(await run).toBe(0);
    expect(calls).toBe(2);
    expect(output.listenerCount('drain')).toBe(0);
    expect(output.listenerCount('error')).toBe(0);
    output.destroy();
  });

  it.each(['EPIPE', 'ERR_STREAM_DESTROYED', 'EIO'])(
    'handles asynchronous stdout %s without an unhandled error',
    async (code) => {
      let stopped = false;
      const error = Object.assign(new Error('fixture write error'), { code });
      const output = new Writable({
        write(_chunk, _encoding, done) {
          done(error);
        },
      });
      const writer = historyStream(output, () => {
        stopped = true;
      });
      expect(await writer.write('history')).toBe(false);
      expect(stopped).toBe(true);
      if (code === 'EIO') expect(() => writer.finish()).toThrow('fixture write error');
      else writer.finish();
      await setImmediate();
      expect(output.listenerCount('error')).toBe(0);
      expect(await writer.write('after close')).toBe(false);
    },
  );

  it('cancels pending API reads when a real pipe consumer exits early', async () => {
    const consumer = spawn(process.execPath, ['-e', "process.stdin.once('data',()=>process.exit(0))"], {
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    const closed = once(consumer, 'close');
    let calls = 0,
      aborted = false;
    const api = {
      request: async (_method: string, _path: string, _body: unknown, signal: AbortSignal) => {
        if (++calls === 1) return page;
        return new Promise((_resolve, reject) => {
          const cancel = () => {
            aborted = true;
            reject(signal.reason);
          };
          signal.addEventListener('abort', cancel, { once: true });
          if (signal.aborted) cancel();
        });
      },
    } as unknown as ApiClient;
    try {
      expect(await dispatchReadVerb({ verb: 'log', args: ['probe'], flags: {}, api, io: io(consumer.stdin) })).toBe(0);
      expect(aborted).toBe(true);
      expect(calls).toBe(2);
    } finally {
      consumer.stdin.destroy();
      consumer.kill();
      await closed;
    }
  });
});
