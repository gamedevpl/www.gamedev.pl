import { beforeEach, describe, expect, it } from 'vitest';
import { objectsWithScaffold, createApp as createWorkspaceApp } from './creator-workspace-fixtures.js';
import type { GamesStore, VersionManifest } from './delivery/games-store.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './platform/auth.js';
import { InMemoryStore } from './platform/store.js';

const sessionSecret = 'dev-session-secret-change-me';
const ENGINE = 'deadbeef0123456789abcdef0123456789abcdef';
const ISSUE = 42;
const SLUG = 'comet-courier';
const VERSION = 'v-1';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

const SOURCES: Record<string, string> = {
  'SPEC.md': '---\nslug: comet-courier\n---\n',
  'game.ts': "import './game/model.js';\n",
  'game/model.ts': 'export const speed = 3;\n',
};

function stubGamesStore(sources = SOURCES): GamesStore {
  return {
    getManifest: async (slug: string, version: string) =>
      slug === SLUG && version === VERSION ? ({ sourceFiles: Object.keys(sources) } as VersionManifest) : null,
    getSourceFile: async (_slug: string, _version: string, path: string) => sources[path] ?? null,
  } as unknown as GamesStore;
}

describe('kit pin used for typecheck', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.createSubmission(ISSUE, 'g:creator', 'Comet Courier');
    await store.setSubmissionSlug(ISSUE, SLUG);
    await store.setSubmissionDeliveredVersion(ISSUE, VERSION);
  });

  it('typechecks an open round against its kit pin', async () => {
    const pinned = 'c'.repeat(40);
    await store.pinRoundKitEngineRef(ISSUE, pinned);
    const app = await createWorkspaceApp(store, objectsWithScaffold(), stubGamesStore());
    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace?kitOnly=true`,
      headers: authHeaders('g:creator'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ engineRef: ENGINE, typecheckEngineRef: pinned });
    await app.close();
  });

  it('typechecks a closed round against the current kit', async () => {
    await store.pinRoundKitEngineRef(ISSUE, 'c'.repeat(40));
    await store.recordJobTransition(ISSUE, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'agent',
      reason: 'delivered',
    });
    const app = await createWorkspaceApp(store, objectsWithScaffold(), stubGamesStore());
    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace?kitOnly=true`,
      headers: authHeaders('g:creator'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ engineRef: ENGINE, typecheckEngineRef: ENGINE });
    await app.close();
  });
});
