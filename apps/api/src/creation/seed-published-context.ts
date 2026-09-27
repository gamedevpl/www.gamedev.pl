import type { GameSnapshotReader } from '../catalog/game-snapshot.js';
import {
  createArchiveSeedContextSource,
  type ArchiveSeedContextOptions,
  type SeedContextSource,
} from './seed-context.js';

type Options = Omit<ArchiveSeedContextOptions, 'ref' | 'getCatalog'> & {
  snapshotReader?: GameSnapshotReader | null;
};

export function createPublishedSeedContextSource(options: Options): SeedContextSource {
  let cached: { key: string; source: SeedContextSource } | null = null;
  const inFlight = new Map<string, ReturnType<SeedContextSource['load']>>();
  const load = (key: string, source: SeedContextSource) => {
    const loading = source.load().finally(() => inFlight.delete(key));
    inFlight.set(key, loading);
    return loading;
  };
  return {
    async load() {
      const reader = options.snapshotReader;
      if (!reader) return null;
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const before = await reader.getPointer();
          if (!before?.commitSha || !/^[a-f0-9]{40}$/i.test(before.commitSha)) return null;
          const key = `${before.snapshotId}:${before.commitSha}`;
          const active = inFlight.get(key);
          if (active) return await active;
          if (cached?.key === key) return await load(key, cached.source);
          const catalog = await reader.getCatalog();
          const after = await reader.getPointer();
          if (after?.snapshotId !== before.snapshotId || after.commitSha !== before.commitSha) continue;
          if (!catalog) return null;
          const pending = inFlight.get(key);
          if (pending) return await pending;
          if (cached?.key !== key) {
            cached = {
              key,
              source: createArchiveSeedContextSource({
                ...options,
                ref: before.commitSha,
                getCatalog: async () => catalog,
              }),
            };
          }
          return await load(key, cached.source);
        }
        return null;
      } catch (error) {
        options.log?.warn({ err: error }, 'published seed context unavailable');
        return null;
      }
    },
  };
}
