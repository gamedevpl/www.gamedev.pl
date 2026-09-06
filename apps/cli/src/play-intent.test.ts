import { describe, expect, it, vi } from 'vitest';
import { handleReplLine } from './repl.js';
import { playGame } from './play.js';
import type { ApiClient } from './api.js';
vi.mock('./play.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./play.js')>()),
  playGame: vi.fn(async () => ({ mode: 'remote' })),
}));
describe('play intent', () => {
  it.each(['uruchom airtime', 'odpal airtime', 'play airtime'])(
    'opens a published checkout without an edit or status request: %s',
    async (line) => {
      vi.clearAllMocks();
      const request = vi.fn(async () => ({ status: 'published', slug: 'airtime' }));
      const write = vi.fn();
      await handleReplLine({
        line,
        api: { origin: 'https://example.test', request } as unknown as ApiClient,
        token: 'published-token',
        workshop: {
          slug: 'airtime',
          root: '/games/airtime',
          token: 'published-token',
          env: {},
          adapters: [],
          builder: 'platform',
          pick: vi.fn(),
          abort: { current: null },
        },
        write,
      });
      expect(request).not.toHaveBeenCalled();
      expect(playGame).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          cwd: '/games/airtime',
          slug: 'airtime',
        }),
      );
      expect(write).not.toHaveBeenCalled();
    },
  );
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
