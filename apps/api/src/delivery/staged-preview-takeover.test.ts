import { expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createStagedPreviewPublisher, type StagedPreviewOptions } from './staged-preview.js';

it.each(['staged', 'candidate'])('rejects a revoked %s preview after assembly', async (mode) => {
  const store = new InMemoryStore();
  await store.createSubmission(7, 'g:owner', 'Preview');
  await store.setSubmissionSlug(7, 'preview');
  await store.ensureRoundGeneration(7);
  const files = [
    { path: 'index.html', content: '<div>Game</div>' },
    { path: 'game.ts', content: 'export {};' },
    { path: 'style.css', content: 'body{margin:0}' },
    { path: 'GAME.json', content: '{"modules":[]}' },
  ];
  const options: StagedPreviewOptions = {
    store,
    gamesStore: { getStagedSourceFiles: async () => files } as unknown as StagedPreviewOptions['gamesStore'],
    githubClient: {
      getGameSources: vi.fn(async () => {
        await store.bumpRoundGeneration(7);
        return {
          indexHtml: '<div>Game</div>',
          gameJs: 'console.log("play");',
          styleCss: 'body{margin:0}',
          title: 'Preview',
        };
      }),
    } as unknown as StagedPreviewOptions['githubClient'],
    engineRef: 'master',
    log: { warn: vi.fn(), error: vi.fn() },
  };
  const publisher = createStagedPreviewPublisher(options);
  try {
    if (mode === 'staged') await publisher.publishNow(7);
    else await publisher.publishCandidate({ jobId: 7, slug: 'preview', version: 'v1', roundGeneration: 1, files });
    expect(options.githubClient.getGameSources).toHaveBeenCalledOnce();
    expect(await store.listBuildPreviews(7)).toEqual([]);
  } finally {
    publisher.stop();
  }
});
