import { improvePublished } from './improve.js';
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

it('retains the new round when launching its agent fails', async () => {
  const spec = loadAdapters({ GAMEDEV_ADAPTERS: '/nonexistent' }).adapters.find(
    (adapter) => adapter.name === 'claude',
  )!;
  vi.mocked(chooseExecution).mockResolvedValue({ builder: 'self', spec, mode: 'local' });
  vi.mocked(executeChoice).mockRejectedValueOnce(new Error('agent unavailable'));
  const write = vi.fn();
  const result = await improvePublished({
    api: { request: vi.fn(async () => ({ ok: true, token: 'new', slug: 'airtime' })) } as unknown as ApiClient,
    token: 'old',
    request: 'Add realistic hair physics',
    slug: 'airtime',
    env: {},
    pick: vi.fn(),
    workshop: ws,
    write,
    abort: ws.abort,
  });
  expect(result).toMatchObject({ token: 'new', workshop: { token: 'new', builder: 'self' } });
  expect(write).toHaveBeenCalledWith(expect.stringContaining('agent unavailable'));
});

it.each([
  ['Which sounds would you like?', 'Which sounds would you like?'],
  [undefined, 'No improvement round was opened. Please clarify what you want to change.'],
])('shows the reply without launching an agent: %s', async (reply, expected) => {
  const write = vi.fn();
  vi.mocked(chooseExecution).mockResolvedValue({ builder: 'platform' });
  const result = await improvePublished({
    api: { request: vi.fn(async () => ({ ok: true, reply })) } as unknown as ApiClient,
    token: 'old',
    request: 'What would better hair look like?',
    slug: 'airtime',
    env: {},
    pick: vi.fn(),
    workshop: ws,
    write,
    abort: ws.abort,
  });
  expect(write).toHaveBeenCalledWith(expected);
  expect(result.token).toBeUndefined();
  expect(executeChoice).not.toHaveBeenCalled();
});
