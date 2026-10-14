import type { FastifyReply } from 'fastify';
import type { GamesStore } from '../delivery/games-store.js';

// Bounds buffered trees across all users of one API instance.
export function createHistoryReadBudget(): (reply: FastifyReply) => (() => void) | null {
  let active = 0;
  return (reply) => {
    if (active >= 2) return null;
    active++;
    let readsDone = false;
    let responseDone = reply.raw.destroyed || reply.raw.writableFinished;
    let released = false;
    const release = () => {
      if (released || !readsDone || !responseDone) return;
      released = true;
      active--;
      reply.raw.off('finish', finish);
      reply.raw.off('close', finish);
    };
    const finish = () => {
      responseDone = true;
      release();
    };
    reply.raw.once('finish', finish);
    reply.raw.once('close', finish);
    return () => {
      readsDone = true;
      responseDone ||= reply.raw.destroyed || reply.raw.writableFinished;
      release();
    };
  };
}

// Settle failed reads' siblings before freeing the request budget.
export async function readHistoryFiles(store: GamesStore, slug: string, version: string, paths: string[]) {
  const files: { path: string; content: string | null }[] = [];
  for (let offset = 0; offset < paths.length; offset += 8) {
    const batch = await Promise.allSettled(
      paths.slice(offset, offset + 8).map(async (path) => ({
        path,
        content: await store.getSourceFile(slug, version, path),
      })),
    );
    for (const result of batch) {
      if (result.status === 'rejected') throw result.reason;
      files.push(result.value);
    }
  }
  return files;
}
