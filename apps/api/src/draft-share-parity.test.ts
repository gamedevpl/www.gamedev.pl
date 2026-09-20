import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mintToken } from './platform/submission-token.js';
import { InMemoryStore } from './platform/store.js';
import type { GamesStore } from './delivery/games-store.js';
import { RECIPIENT, SECRET, SENDER, createTransferApp, gameWithHistory, session } from './game-transfer-fixtures.js';

// Same draft, either address, same answer.

const SHARED_HTML = '<!doctype html><title>Shared</title>';
const OTHER_HTML = '<!doctype html><title>Some other build</title>';

// v1 is shared and green; v9 exists but was never shared.
function greenGamesStore(): GamesStore {
  const manifest = (version: string) => ({
    version,
    createdAt: '2026-09-01T00:00:00.000Z',
    deliveryMode: 'preview' as const,
    previewGate: { green: true, ranAt: '2026-09-01T00:01:00.000Z' },
  });
  return {
    getDerivedArtifact: async (_slug: string, version: string, name: string) =>
      name === 'bundle.html' ? Buffer.from(version === 'v1' ? SHARED_HTML : OTHER_HTML, 'utf8') : null,
    getManifest: async (_slug: string, version: string) => manifest(version),
    listVersions: async () => [manifest('v1')],
  } as unknown as GamesStore;
}

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

// RECIPIENT is the outside visitor here, never an owner.
async function sharedGame(store: InMemoryStore, opts?: { blocked?: boolean }) {
  const { jobId, at } = await gameWithHistory(store);
  await store.setDraftShared(jobId, at);
  if (opts?.blocked) await store.setModerationBlocked(jobId, at);
  const app = await createTransferApp(store, apps, undefined, greenGamesStore());
  return { app, jobId, token: mintToken(jobId, SECRET) };
}

describe('a shared draft plays by token as it does by slug', () => {
  it('serves a visitor the creator shared with, on both routes', async () => {
    const store = new InMemoryStore();
    const { app, token } = await sharedGame(store);

    const byToken = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview`,
      headers: session(RECIPIENT),
    });
    expect(byToken.statusCode).toBe(200);
    expect(byToken.json().html).toBe(SHARED_HTML);

    const bySlug = await app.inject({ method: 'GET', url: '/api/drafts/comet-courier', headers: session(RECIPIENT) });
    expect(bySlug.statusCode).toBe(200);
    expect(bySlug.json().html).toBe(byToken.json().html);
  });

  it('pins the visitor to the shared version, whatever the query asks for', async () => {
    const store = new InMemoryStore();
    const { app, token } = await sharedGame(store);

    const steered = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview?version=v9`,
      headers: session(RECIPIENT),
    });
    expect(steered.statusCode).toBe(200);
    expect(steered.json().html).toBe(SHARED_HTML);

    // The creator is not pinned; their build rail asks for old versions.
    const owner = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview?version=v9`,
      headers: session(SENDER),
    });
    expect(owner.json().html).toBe(OTHER_HTML);
  });

  it('refuses a visitor when the draft was never shared', async () => {
    const store = new InMemoryStore();
    const { jobId } = await gameWithHistory(store);
    const app = await createTransferApp(store, apps, undefined, greenGamesStore());
    const token = mintToken(jobId, SECRET);

    const byToken = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview`,
      headers: session(RECIPIENT),
    });
    expect(byToken.statusCode).toBe(404);
  });

  it('refuses a visitor on a game an operator pulled, though it was shared', async () => {
    const store = new InMemoryStore();
    const { app, token } = await sharedGame(store, { blocked: true });

    const byToken = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview`,
      headers: session(RECIPIENT),
    });
    expect(byToken.statusCode).toBe(404);

    // The creator still reaches their own pulled draft.
    const owner = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview`,
      headers: session(SENDER),
    });
    expect(owner.statusCode).toBe(200);
  });
});
