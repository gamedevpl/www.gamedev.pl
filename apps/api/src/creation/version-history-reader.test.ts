import { EventEmitter } from 'node:events';
import type { FastifyReply } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { GamesStore } from '../delivery/games-store.js';
import { createHistoryReadBudget, readHistoryFiles } from './version-history-reader.js';

function response() {
  const raw = Object.assign(new EventEmitter(), { destroyed: false, writableFinished: false });
  return { raw, reply: { raw } as unknown as FastifyReply };
}

describe('history response lifetime', () => {
  it('bounds storage fan-out and preserves file order across batches', async () => {
    const paths = Array.from({ length: 19 }, (_, i) => `${i}.ts`);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let peak = 0;
    const getSourceFile = vi.fn(async (_slug: string, _version: string, path: string) => {
      active++;
      peak = Math.max(peak, active);
      await blocked;
      active--;
      return path;
    });
    const read = readHistoryFiles({ getSourceFile } as unknown as GamesStore, 'game', 'v1', paths);
    expect(getSourceFile).toHaveBeenCalledTimes(8);
    release();
    expect((await read).map((file) => file.path)).toEqual(paths);
    expect(peak).toBe(8);
  });

  it('holds buffered responses until sent, and aborted reads until settled', () => {
    const acquire = createHistoryReadBudget();
    const slowClient = response();
    const disconnectedClient = response();
    const firstDone = acquire(slowClient.reply)!;
    const secondDone = acquire(disconnectedClient.reply)!;
    firstDone();
    disconnectedClient.raw.destroyed = true;
    disconnectedClient.raw.emit('close');
    expect(acquire(response().reply)).toBeNull();
    secondDone();
    const next = response();
    const nextDone = acquire(next.reply)!;
    expect(nextDone).toBeTypeOf('function');
    expect(acquire(response().reply)).toBeNull();
    slowClient.raw.emit('finish');
    slowClient.raw.emit('close');
    firstDone();
    const last = response();
    expect(acquire(last.reply)).toBeTypeOf('function');
    expect(acquire(response().reply)).toBeNull();
    expect(slowClient.raw.listenerCount('close')).toBe(0);
    nextDone();
    next.raw.emit('finish');
  });
});
