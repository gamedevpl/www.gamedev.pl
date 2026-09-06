import { describe, expect, it, vi } from 'vitest';
import { handleReplLine } from './repl.js';
import { playGame } from './play.js';
import type { ApiClient } from './api.js';
vi.mock('./play.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./play.js')>()),
  playGame: vi.fn(async () => ({ mode: 'local' })),
}));

const workshop = {
  slug: 'airtime',
  root: '/games/airtime',
  token: 'published-token',
  env: {},
  adapters: [],
  builder: 'platform',
  pick: vi.fn(),
  abort: { current: null },
};

describe('CLI assistant actions', () => {
  it.each(['uruchom airtime', 'chcę sprawdzić ostatnie zmiany', 'can I try it now?'])(
    'lets the model choose play rather than matching text: %s',
    async (line) => {
      vi.clearAllMocks();
      const request = vi.fn(async () => ({
        kind: 'action',
        action: { name: 'play', slug: 'airtime' },
        conversationId: 'c',
      }));
      const result = await handleReplLine({
        line,
        api: { origin: 'https://example.test', request } as unknown as ApiClient,
        token: workshop.token,
        workshop,
        write: vi.fn(),
      });
      expect(request).toHaveBeenCalledExactlyOnceWith('POST', '/api/cli/chat', {
        text: line,
        session: { token: workshop.token, checkoutSlug: 'airtime', agents: [] },
      });
      expect(playGame).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ cwd: workshop.root, slug: 'airtime' }),
      );
      expect(result.conversationId).toBe('c');
    },
  );

  it('asks for clarification even when the text looks like play', async () => {
    vi.clearAllMocks();
    const write = vi.fn();
    const request = vi.fn(async () => ({ kind: 'reply', text: 'Which game?', conversationId: 'c' }));
    await handleReplLine({
      line: 'chcę zagrać',
      api: { request } as unknown as ApiClient,
      workshop,
      token: workshop.token,
      write,
    });
    expect(playGame).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith('◆ Which game?');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'shell', command: 'touch /tmp/unwanted' },
    { name: 'play', slug: '../escape' },
    { name: 'play', slug: 'airtime', command: 'something' },
  ])('refuses invalid actions: %j', async (action) => {
    vi.clearAllMocks();
    const request = vi.fn(async () => ({ kind: 'action', action, conversationId: 'c' }));
    const write = vi.fn();
    await handleReplLine({
      line: 'go',
      api: { request } as unknown as ApiClient,
      workshop,
      token: workshop.token,
      write,
    });
    expect(playGame).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('Invalid CLI assistant response'));
  });

  it('keeps slash play deterministic and usable without the model', async () => {
    vi.clearAllMocks();
    const request = vi.fn();
    await handleReplLine({
      line: '/play --no-open',
      api: { request } as unknown as ApiClient,
      workshop,
      token: workshop.token,
      write: vi.fn(),
    });
    expect(request).not.toHaveBeenCalled();
    expect(playGame).toHaveBeenCalledWith(expect.objectContaining({ slug: 'airtime', noOpen: true }));
  });

  it('fails closed on a chat outage instead of sending an edit', async () => {
    vi.clearAllMocks();
    const request = vi.fn(async () => {
      throw new Error('unavailable');
    });
    await handleReplLine({
      line: 'uruchom airtime',
      api: { request } as unknown as ApiClient,
      workshop,
      token: workshop.token,
      write: vi.fn(),
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(playGame).not.toHaveBeenCalled();
  });

  it('passes the resolved task after a conversational confirmation', async () => {
    const request = vi.fn(async (_method: string, path: string) =>
      path === '/api/cli/chat'
        ? {
            kind: 'action',
            action: { name: 'edit', request: 'Make the jump floatier without changing movement speed.' },
            conversationId: 'continued',
          }
        : { kind: 'reply', text: 'Accepted' },
    );
    const result = await handleReplLine({
      line: 'yes, do that',
      conversationId: 'previous',
      api: { request } as unknown as ApiClient,
      token: workshop.token,
      workshop,
      write: vi.fn(),
    });
    expect(request).toHaveBeenNthCalledWith(
      1,
      'POST',
      '/api/cli/chat',
      expect.objectContaining({ text: 'yes, do that', conversationId: 'previous' }),
    );
    expect(request).toHaveBeenNthCalledWith(2, 'POST', '/api/submissions/published-token/turn', {
      text: 'Make the jump floatier without changing movement speed.',
    });
    expect(result.conversationId).toBe('continued');
  });

  it('executes status without an edit request', async () => {
    const request = vi.fn(async (_method: string, path: string) =>
      path === '/api/cli/chat'
        ? { kind: 'action', action: { name: 'status' }, conversationId: 'c' }
        : { status: 'published', slug: 'airtime' },
    );
    await handleReplLine({
      line: 'how is it doing?',
      api: { origin: 'https://example.test', request } as unknown as ApiClient,
      workshop,
      token: workshop.token,
      write: vi.fn(),
    });
    expect(request.mock.calls.map((call) => call[1])).toEqual(['/api/cli/chat', '/api/submissions/published-token']);
  });
});
