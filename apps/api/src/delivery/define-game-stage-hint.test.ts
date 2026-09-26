import { expect, it } from 'vitest';
import { computeStageAdvisories, type StageAdvisoriesInput } from './stage-hints.js';

it('warns while staging a manifest that omits a defineGame engine module', async () => {
  const result = await computeStageAdvisories({
    slug: 'my-game',
    jobId: 1,
    roundGeneration: 1,
    engineRef: 'engine-1',
    path: 'GAME.json',
    content: JSON.stringify({ engine: { modules: ['input', 'gfx', 'audio'] } }),
    record: {},
    kitFileStore: {
      loadTree: async () => ({ files: new Map() }),
    } as unknown as NonNullable<StageAdvisoriesInput['kitFileStore']>,
    gamesStore: {
      getStagedSourceFiles: async () => [
        { path: 'game.ts', content: 'const builder = GameKit.defineGame(); builder.start();' },
      ],
    } as unknown as StageAdvisoriesInput['gamesStore'],
    store: {} as StageAdvisoriesInput['store'],
  });

  expect(result.typecheckHint).toContain('"effects"');
});
