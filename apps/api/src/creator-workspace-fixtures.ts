import { gunzipSync, gzipSync } from 'node:zlib';
import { buildApp } from './platform/app.js';
import type { GamesStore } from './delivery/games-store.js';
import type { GcsObjectStore } from './delivery/gcs-sign.js';
import { InMemoryStore } from './platform/store.js';
import { readTarEntries, writeTarGz, type TarEntry } from './platform/tar.js';
const sessionSecret = 'dev-session-secret-change-me';
const ENGINE = 'deadbeef0123456789abcdef0123456789abcdef';
const SHA = 'a'.repeat(64);

function scaffoldTarball(): Buffer {
  return gzipSync(
    // The composer accepts archives with a wrapping directory.
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

export function objectsWithScaffold(): Map<string, Buffer> {
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

export async function createApp(store: InMemoryStore, objects: Map<string, Buffer>, gamesStore: GamesStore) {
  return await buildApp({
    store,
    sessionSecret,
    submissionRoutes: {
      submissionTokenSecret: 'test-submission-secret',
      agentChannel: { objectStore: mockObjectStore(objects), gamesStore },
    },
  });
}

export async function entriesOf(archive: Buffer): Promise<TarEntry[]> {
  const buffer = gunzipSync(archive);
  async function* once(): AsyncGenerator<Uint8Array> {
    yield buffer;
  }
  const entries: TarEntry[] = [];
  for await (const item of readTarEntries(once())) entries.push(item);
  return entries;
}
