import { gunzipSync, gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './platform/auth.js';
import type { GamesStore, VersionManifest } from './delivery/games-store.js';
import type { GcsObjectStore } from './delivery/gcs-sign.js';
import { InMemoryStore } from './platform/store.js';
import { readTarEntries, writeTarGz, type TarEntry } from './delivery/tar.js';

const sessionSecret = 'dev-session-secret-change-me';
const ENGINE = 'deadbeef0123456789abcdef0123456789abcdef';
const SHA = 'a'.repeat(64);
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

/** Only the two reads the workspace route makes; the rest of the store is not exercised. */
function stubGamesStore(sources = SOURCES): GamesStore {
  return {
    getManifest: async (slug: string, version: string) =>
      slug === SLUG && version === VERSION ? ({ sourceFiles: Object.keys(sources) } as VersionManifest) : null,
    getSourceFile: async (_slug: string, _version: string, path: string) => sources[path] ?? null,
  } as unknown as GamesStore;
}

function scaffoldTarball(): Buffer {
  return gzipSync(
    // Wrapped in a directory on purpose: the packer may or may not wrap, and the
    // composer is supposed to tolerate both.
    Buffer.from(
      gunzipSync(
        writeTarGz([
          { path: 'workspace/README.md', content: '# your working copy\n' },
          { path: 'workspace/setup.mjs', content: 'fetch the kit\n' },
          { path: 'workspace/.gitignore', content: 'node_modules\n' },
        ]),
      ),
    ),
  );
}

function objectsWithScaffold(): Map<string, Buffer> {
  return new Map<string, Buffer>([
    [
      'kits/current.json',
      Buffer.from(JSON.stringify({ current: ENGINE, previous: null, updatedAt: '2026-08-01T00:00:00.000Z' })),
    ],
    ['kits/' + ENGINE + '.json', Buffer.from(JSON.stringify({ sha256: SHA, packedAt: '2026-08-01T00:00:00.000Z' }))],
    ['kits/' + ENGINE + '.tgz', Buffer.from('fake-kit')],
    ['workspaces/' + ENGINE + '.tgz', scaffoldTarball()],
  ]);
}

function mockObjectStore(objects: Map<string, Buffer>): GcsObjectStore {
  return {
    readObject: async (name) => objects.get(name) ?? null,
    objectExists: async (name) => objects.has(name),
    signReadUrl: async (name) => `https://signed.example/${name}?sig=1`,
  };
}

async function createApp(store: InMemoryStore, objects: Map<string, Buffer>, gamesStore = stubGamesStore()) {
  return await buildApp({
    store,
    sessionSecret,
    submissionRoutes: {
      submissionTokenSecret: 'test-submission-secret',
      agentChannel: { objectStore: mockObjectStore(objects), gamesStore },
    },
  });
}

async function entriesOf(archive: Buffer): Promise<TarEntry[]> {
  const buffer = gunzipSync(archive);
  async function* once(): AsyncGenerator<Uint8Array> {
    yield buffer;
  }
  const entries: TarEntry[] = [];
  for await (const item of readTarEntries(once())) entries.push(item);
  return entries;
}

describe('GET /api/me/studio/games/:slug/workspace', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.createSubmission(ISSUE, 'g:creator', 'Comet Courier');
    await store.setSubmissionSlug(ISSUE, SLUG);
    await store.setSubmissionDeliveredVersion(ISSUE, VERSION);
  });

  it('hands back a working copy: scaffold at the root, sources under games/<slug>/', async () => {
    const app = await createApp(store, objectsWithScaffold());

    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace`,
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/gzip');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${SLUG}-workspace.tgz"`);

    const entries = await entriesOf(res.rawPayload);
    expect(entries.map((entry) => entry.path).sort()).toEqual([
      '.gitignore',
      'README.md',
      'gamedev.lock',
      `games/${SLUG}/SPEC.md`,
      `games/${SLUG}/game.ts`,
      `games/${SLUG}/game/model.ts`,
      'setup.mjs',
    ]);
  });

  it('pins the checkout to the current engine and tells setup where to fetch the kit', async () => {
    const app = await createApp(store, objectsWithScaffold());
    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace`,
      headers: authHeaders('g:creator'),
    });

    const entries = await entriesOf(res.rawPayload);
    const lock = JSON.parse(Buffer.from(entries.find((e) => e.path === 'gamedev.lock')!.bytes).toString('utf8'));
    expect(lock).toMatchObject({
      slug: SLUG,
      engineRef: ENGINE,
      kitUrl: `https://signed.example/kits/${ENGINE}.tgz?sig=1`,
      kitSha256: SHA,
    });
  });

  it('never ships the engine — the kit is fetched at setup, not handed over', async () => {
    const app = await createApp(store, objectsWithScaffold());
    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace`,
      headers: authHeaders('g:creator'),
    });

    const paths = (await entriesOf(res.rawPayload)).map((entry) => entry.path);
    expect(paths.some((path) => path.startsWith('shared/'))).toBe(false);
  });

  it('requires a session', async () => {
    const app = await createApp(store, objectsWithScaffold());
    const res = await app.inject({ method: 'GET', url: `/api/me/studio/games/${SLUG}/workspace` });
    expect(res.statusCode).toBe(401);
  });

  it('404s another creator’s game rather than confirming it exists', async () => {
    await store.upsertUser({ uid: 'g:stranger' });
    const app = await createApp(store, objectsWithScaffold());

    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace`,
      headers: authHeaders('g:stranger'),
    });

    expect(res.statusCode).toBe(404);
  });

  it('says so plainly when the first build has not delivered anything yet', async () => {
    const empty = new InMemoryStore();
    await empty.upsertUser({ uid: 'g:creator' });
    await empty.createSubmission(ISSUE, 'g:creator', 'Comet Courier');
    await empty.setSubmissionSlug(ISSUE, SLUG);
    const app = await createApp(empty, objectsWithScaffold());

    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace`,
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('nothing_delivered');
  });

  it('checks out the live publication when the newest round has delivered nothing yet', async () => {
    // The shape of every post-publish improvement: a fresh empty job on a slug whose
    // older job still points at what it delivered before publication. Handing back that
    // older delivery would have the creator edit a superseded base and deliver over
    // newer published work.
    const store2 = new InMemoryStore();
    await store2.upsertUser({ uid: 'g:creator' });
    await store2.createSubmission(ISSUE, 'g:creator', 'Comet Courier');
    await store2.setSubmissionSlug(ISSUE, SLUG);
    await store2.setSubmissionDeliveredVersion(ISSUE, 'v-old');
    await new Promise((resolve) => setTimeout(resolve, 2));
    await store2.createSubmission(ISSUE + 1, 'g:creator', 'Comet Courier');
    await store2.setSubmissionSlug(ISSUE + 1, SLUG);
    await store2.setPublication({
      slug: SLUG,
      state: 'published',
      currentVersion: VERSION,
      publishedAt: '2026-08-01T00:00:00.000Z',
    });

    const app = await createApp(store2, objectsWithScaffold());
    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace`,
      headers: authHeaders('g:creator'),
    });

    // The stub only knows VERSION, so a 200 is itself the assertion: resolving to the
    // older job's `v-old` would have failed the manifest read with a 502.
    expect(res.statusCode).toBe(200);
    const entries = await entriesOf(res.rawPayload);
    expect(entries.some((item) => item.path === `games/${SLUG}/SPEC.md`)).toBe(true);
  });

  it('ignores a canceled round when choosing what to check out', async () => {
    // A round the operator canceled keeps whatever it delivered and is newer than the job
    // that published the live game. Serving it would hand back rejected work, and a
    // delivery built on it would overwrite what is live.
    const store3 = new InMemoryStore();
    await store3.upsertUser({ uid: 'g:creator' });
    await store3.createSubmission(ISSUE, 'g:creator', 'Comet Courier');
    await store3.setSubmissionSlug(ISSUE, SLUG);
    await store3.setSubmissionDeliveredVersion(ISSUE, VERSION);
    await store3.setPublication({
      slug: SLUG,
      state: 'published',
      currentVersion: VERSION,
      publishedAt: '2026-08-01T00:00:00.000Z',
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await store3.createSubmission(ISSUE + 1, 'g:creator', 'Comet Courier');
    await store3.setSubmissionSlug(ISSUE + 1, SLUG);
    await store3.setSubmissionDeliveredVersion(ISSUE + 1, 'v-rejected');
    await store3.recordJobTransition(ISSUE + 1, {
      to: 'canceled',
      at: '2026-08-02T00:00:00.000Z',
      by: 'operator',
      reason: 'operator_cancel',
    });

    const app = await createApp(store3, objectsWithScaffold());
    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace`,
      headers: authHeaders('g:creator'),
    });

    // The stub can only read VERSION back, so 200 proves the canceled round's
    // `v-rejected` was not chosen.
    expect(res.statusCode).toBe(200);
  });

  it('503s rather than improvising when no scaffold is published for the current engine', async () => {
    const objects = objectsWithScaffold();
    objects.delete(`workspaces/${ENGINE}.tgz`);
    const app = await createApp(store, objects);

    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace`,
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('workspace_scaffold_missing');
  });

  it('answers 502, not 500, when the published scaffold cannot be decompressed', async () => {
    const objects = objectsWithScaffold();
    objects.set(`workspaces/${ENGINE}.tgz`, Buffer.from('not gzip at all'));
    const app = await createApp(store, objects);

    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace`,
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(502);
  });

  it('refuses to assemble an archive from a scaffold that carries engine content', async () => {
    const objects = objectsWithScaffold();
    objects.set(
      `workspaces/${ENGINE}.tgz`,
      gzipSync(
        Buffer.from(
          gunzipSync(
            writeTarGz([
              { path: 'README.md', content: 'x' },
              { path: 'shared/modules/gfx.ts', content: 'export {}' },
            ]),
          ),
        ),
      ),
    );
    const app = await createApp(store, objects);

    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/workspace`,
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(502);
  });
});
