import { expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { NoopTranslator } from '../platform/translate.js';
import { createSourceDeliveryService } from './source-delivery.js';
import type { GamesStore } from './games-store.js';

it.each([
  {
    source:
      'GameKit.defineGame().input({}).audio({}).init(() => ({})).update(() => {}).render(() => {}).snapshot(() => ({})).start();',
    modules: ['input', 'gfx', 'audio'],
    error: /add \["effects"\]/,
  },
  {
    source: 'const builder = GameKit.defineGame(); builder.start();',
    modules: ['input', 'gfx', 'effects', 'audio'],
    error: /missing \.input\(\.\.\.\)/,
  },
])(
  'refuses an incomplete GameKit builder before candidate storage or Cloud Build ($source)',
  async ({ source, modules, error }) => {
    const store = new InMemoryStore();
    await store.createSubmission(701, 'owner', 'Incomplete game');
    await store.setSubmissionSlug(701, 'incomplete-game');
    const putCandidateSources = vi.fn();
    const gate = vi.fn();
    const service = createSourceDeliveryService({
      store,
      gamesStore: { putCandidateSources } as unknown as GamesStore,
      translator: new NoopTranslator(),
      parseSpecTitle: () => null,
      runTypecheckPreflight: async () => ({ ok: true, durationMs: 0 }),
      sharedSourcesFromKitTree: () => ({}),
      typecheckPreflightMaxRefusals: 2,
      onSourcesDelivered: gate,
    });

    await expect(
      service.deliver({
        jobId: 701,
        slug: 'incomplete-game',
        mode: 'preview',
        files: [
          {
            path: 'game.ts',
            content: source,
          },
          { path: 'GAME.json', content: JSON.stringify({ engine: { modules } }) },
        ],
      }),
    ).rejects.toThrow(error);
    expect(putCandidateSources).not.toHaveBeenCalled();
    expect(gate).not.toHaveBeenCalled();
  },
);
