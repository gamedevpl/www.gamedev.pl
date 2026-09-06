import { describe, expect, it, vi } from 'vitest';
import { handleReplLine } from './repl.js';
import { playGame } from './play.js';
import type { ApiClient } from './api.js';
vi.mock('./play.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./play.js')>()),
  playGame: vi.fn(async () => ({ mode: 'remote' })),
}));
describe('play intent', () => {
  it.each(['chcę zagrać w tę gierkę', '/play --no-open'])(
    'opens the active game without sending a chat turn: %s',
    async (line) => {
      vi.clearAllMocks();
      const request = vi.fn(async () => ({ slug: 'robot' }));
      await handleReplLine({
        line,
        api: { origin: 'https://example.test', request } as unknown as ApiClient,
        token: 'tok',
        write: () => undefined,
      });
      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith('GET', '/api/submissions/tok');
      expect(playGame).toHaveBeenCalledWith(expect.objectContaining({ slug: 'robot' }));
    },
  );
});
