import {
  assertProductionCage,
  createIsolatedVmCage,
  createNodeVmCage,
  parseZoneSchema,
  type SimCage,
  type ZoneSchema,
} from '@gamedevpl/zone-core';
import { buildWorldApp } from './app.js';
import { createGithubFiles, createGithubSimSource } from './sim-source.js';
import { createFirestoreZoneStore, createMemoryZoneStore } from './snapshot-store.js';

/**
 * Entry point for the `gamedev-world` Cloud Run service (docs/p3-zone-host-infra.md).
 *
 * Separate from the API's server on purpose and in three ways that matter: its own
 * deploy cadence, so a website release does not mass-hibernate every live world; its own
 * image, so the `isolated-vm` native build is not in the critical path of serving the
 * site; and its own origin, so no session cookie ever reaches the process that runs
 * untrusted game code.
 */

const PORT = Number(process.env.PORT ?? 8081);
const HOST = process.env.HOST ?? '0.0.0.0';

async function chooseCage(): Promise<SimCage> {
  // Production always gets the isolate, and a missing one is a refusal to start rather
  // than a quiet downgrade — see assertProductionCage for why that matters more than
  // staying up.
  if (process.env.NODE_ENV === 'production' || process.env.ZONE_CAGE === 'isolated-vm') {
    return createIsolatedVmCage();
  }
  try {
    return await createIsolatedVmCage();
  } catch {
    // Local development on a machine with no build toolchain. Loud, because the
    // difference between the two cages is the entire safety story.
    console.warn('[world] isolated-vm unavailable; using node:vm. This is NOT a security boundary.');
    return createNodeVmCage();
  }
}

/** Reads each game's declared zone from the games repo, cached per slug. */
function createSchemaSource(readManifest: (slug: string) => Promise<unknown>) {
  const cache = new Map<string, { at: number; schema: ZoneSchema | null }>();
  const TTL_MS = 10 * 60_000;
  return {
    async getSchema(slug: string): Promise<ZoneSchema | null> {
      const cached = cache.get(slug);
      if (cached && Date.now() - cached.at < TTL_MS) return cached.schema;
      // A declaration that does not fully parse yields no zone at all, never a zone with
      // the good inputs and no rules for the bad ones.
      const schema = parseZoneSchema(await readManifest(slug));
      cache.set(slug, { schema, at: Date.now() });
      return schema;
    },
  };
}

async function main(): Promise<void> {
  const repo = process.env.GAMES_REPO?.trim();
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!repo || !token) {
    throw new Error('GAMES_REPO and GITHUB_TOKEN are required: a zone host with no games repo has no sims to run');
  }

  const files = createGithubFiles(repo, token);
  const cage = await chooseCage();
  assertProductionCage(cage);

  const { app } = await buildWorldApp({
    cage,
    source: createGithubSimSource({ files }),
    store: process.env.ZONE_STORE === 'memory' ? createMemoryZoneStore() : createFirestoreZoneStore(),
    schemas: createSchemaSource(async (slug) => {
      const raw = await files.readText(`games/${slug}/GAME.json`, process.env.GAMES_PUBLISHED_REF ?? 'main');
      if (raw === null) return null;
      try {
        return (JSON.parse(raw) as { zone?: unknown }).zone;
      } catch {
        return null;
      }
    }),
    logger: true,
  });

  // Cloud Run sends SIGTERM and then waits. Every live zone snapshots inside that grace
  // period and every client is told to re-dial, so a deploy is an ordinary event: the
  // zone that comes back on the next instance is the same zone, a few hundred
  // milliseconds older. Without this it would be an unscheduled hibernate — survivable,
  // but it would cost every world the seconds since its last periodic snapshot.
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      void app.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  }

  await app.listen({ port: PORT, host: HOST });
  console.log(`[world] zone host listening on ${HOST}:${PORT} with the ${cage.kind} cage`);
}

main().catch((error) => {
  console.error('[world] failed to start:', error);
  process.exit(1);
});
