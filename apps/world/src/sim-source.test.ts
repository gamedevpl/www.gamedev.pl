import { describe, expect, it } from 'vitest';
import { createNodeVmCage } from '@gamedevpl/zone-core';
import { createGithubSimSource, type GamesRepoFiles } from './sim-source.js';

const sources: Record<string, string> = {
  'shared/sim-math.ts': 'globalThis.__SIM_MATH__ = Math;',
  'games/quack-arena/sim.ts':
    "import { height } from './arena.ts'; export function init() { return { y: height() }; } export function tick(s) { return s; } export function wake(s) { return s; }",
  'games/quack-arena/arena.ts':
    "import { boxHeight } from '../../shared/sim/box-world.ts'; export const height = boxHeight;",
  'shared/sim/box-world.ts': "import { floor } from './queries3d.ts'; export const boxHeight = () => floor(3);",
  'shared/sim/queries3d.ts': 'export const floor = (value: number) => value;',
};

function sourceWith(files: Record<string, string>) {
  const readPaths: string[] = [];
  const reader: GamesRepoFiles = {
    async readText(path) {
      readPaths.push(path);
      return files[path] ?? null;
    },
  };
  return { source: createGithubSimSource({ files: reader }), readPaths };
}

describe('games repo sim source', () => {
  it('loads nested pure shared sim imports and runs the bundle', async () => {
    const { source, readPaths } = sourceWith(sources);
    const bundle = await source.load('quack-arena');
    expect(bundle).not.toBeNull();
    expect(readPaths).toContain('shared/sim/box-world.ts');
    expect(readPaths).toContain('shared/sim/queries3d.ts');
    const cage = createNodeVmCage();
    const sim = await cage.load({ ...bundle!, timeoutMs: 2000, memoryMb: 32 });
    sim.init(1);
    expect(JSON.parse(sim.snapshot().state)).toMatchObject({ y: 3 });
    sim.dispose();
    cage.dispose();
  });

  it.each([
    '../../shared/modules/zone.ts',
    '../../games/other-game/sim.ts',
    '../../shared/sim/../modules/zone.ts',
    '../../../outside.ts',
  ])('rejects imports outside the sim roots: %s', async (specifier) => {
    const { source, readPaths } = sourceWith({
      ...sources,
      'games/quack-arena/arena.ts': `import '${specifier}'; export const height = () => 1;`,
    });
    await expect(source.load('quack-arena')).rejects.toThrow(/may only import from/);
    expect(readPaths).not.toContain(specifier);
  });
});
