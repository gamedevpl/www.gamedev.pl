import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleReplLine } from './repl.js';
import { chooseExecution, executeChoice } from './execution.js';
import type { ApiClient } from './api.js';
import { loadAdapters } from './adapters.js';
import type { Workshop } from './workshop.js';
vi.mock('./execution.js', () => ({
  chooseExecution: vi.fn(),
  executeChoice: vi.fn(async (input) => input.workshop),
}));
beforeEach(() => vi.clearAllMocks());
const ws: Workshop = {
  slug: 'airtime',
  root: '/game',
  token: 'old',
  builder: 'platform',
  adapters: [],
  env: {},
  pick: vi.fn(),
  abort: { current: null },
};
it('opens a self improvement and executes on its new token, never the published round', async () => {
  const spec = loadAdapters({ GAMEDEV_ADAPTERS: '/nonexistent' }).adapters.find(
    (adapter) => adapter.name === 'claude',
  )!;
  const choice = { builder: 'self', spec, mode: 'local' } as const;
  vi.mocked(chooseExecution).mockResolvedValue(choice);
  const request = vi.fn(async (_method, path) => {
    if (path === '/api/cli/chat')
      return {
        kind: 'action',
        action: { name: 'edit', request: 'Add hair with realistic physics' },
        conversationId: 'c',
      };
    if (path === '/api/submissions/old') return { status: 'published', slug: 'airtime' };
    if (path === '/api/submissions/old/improve') return { ok: true, token: 'new', slug: 'airtime' };
    throw new Error('unexpected request');
  });
  const result = await handleReplLine({
    line: 'ask claude to add hair',
    api: { request } as unknown as ApiClient,
    token: 'old',
    workshop: { ...ws, adapters: [] },
    pick: vi.fn(),
    write: vi.fn(),
  });
  expect(request).toHaveBeenLastCalledWith('POST', '/api/submissions/old/improve', {
    feedback: 'Add hair with realistic physics',
    builder: 'self',
  });
  expect(executeChoice).toHaveBeenCalledWith(
    expect.objectContaining({
      choice,
      token: 'new',
      workshop: expect.objectContaining({ token: 'new', builder: 'self', root: '/game' }),
    }),
  );
  expect(result).toMatchObject({ token: 'new', conversationId: 'c' });
  expect(ws.token).toBe('old');
});
describe('cancelled improvement', () => {
  it('does not create a round when builder selection is cancelled', async () => {
    vi.mocked(chooseExecution).mockResolvedValue(null);
    const request = vi.fn(async (_method, path) =>
      path === '/api/cli/chat'
        ? { kind: 'action', action: { name: 'edit', request: 'Add realistic hair physics' } }
        : { status: 'published', slug: 'airtime' },
    );
    await handleReplLine({
      line: 'change it',
      api: { request } as unknown as ApiClient,
      token: 'old',
      workshop: { ...ws, adapters: [] },
      pick: vi.fn(),
      write: vi.fn(),
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(executeChoice).not.toHaveBeenCalled();
  });
});
