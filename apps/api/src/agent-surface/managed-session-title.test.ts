import { describe, expect, it } from 'vitest';
import type { ManagedAgentProvider, ManagedSessionRequest } from './managed-agent.js';
import { createManagedBackend } from './managed-backend.js';
import { sessionTitle, type CreatorHandleLookup } from './managed-session-title.js';

const lookup: CreatorHandleLookup = async (uid) => {
  if (uid === 'g:boom') throw new Error('store down');
  return uid === 'g:ada' ? 'ada' : null;
};

describe('managed session title', () => {
  it('joins the public handle and the game slug', async () => {
    expect(await sessionTitle({ jobId: 42, slug: 'comet-courier', ownerUid: 'g:ada' }, lookup)).toBe(
      'ada/comet-courier',
    );
  });

  it('falls back to the job id before the game has a slug', async () => {
    expect(await sessionTitle({ jobId: 43, ownerUid: 'g:ada' }, lookup)).toBe('ada/job-43');
  });

  it('keeps the slug alone when there is no handle, and never shows the uid', async () => {
    expect(await sessionTitle({ jobId: 44, slug: 'comet-courier', ownerUid: 'g:nohandle' }, lookup)).toBe(
      'comet-courier',
    );
    expect(await sessionTitle({ jobId: 45, slug: 'comet-courier', ownerUid: 'g:boom' }, lookup)).toBe('comet-courier');
    expect(await sessionTitle({ jobId: 46, slug: 'comet-courier', ownerUid: 'g:ada' })).toBe('comet-courier');
  });

  it('reaches the vendor on dispatch', async () => {
    const started: ManagedSessionRequest[] = [];
    const provider: ManagedAgentProvider = {
      vendor: 'fake',
      model: 'fake-model',
      startSession: async (request) => (started.push(request), { id: 'session-1', state: 'queued' }),
      getSession: async () => null,
      cancelSession: async () => ({ enforced: true }),
    };
    const backend = createManagedBackend({
      provider,
      tools: { mcpEndpoints: [{ url: 'https://www.gamedev.pl/api/mcp', name: 'gamedevpl' }] },
      creatorHandle: lookup,
    });

    await backend.dispatch({
      jobId: 42,
      slug: 'comet-courier',
      ownerUid: 'g:ada',
      spec: 'Deliver parcels.',
      channelToken: 'token',
      apiBaseUrl: 'https://example.test',
    });

    expect(started[0].title).toBe('ada/comet-courier');
  });
});
