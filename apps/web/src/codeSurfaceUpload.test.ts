import { describe, expect, it } from 'vitest';
import { planSourceUpload } from './codeSurfaceUpload.js';

describe('codeSurfaceUpload', () => {
  it('adds new files, flags overwrites, and skips illegal paths', () => {
    const plan = planSourceUpload({
      entries: [
        { relativePath: 'entities/player.ts', content: 'export {};\n' },
        { relativePath: 'game.ts', content: 'export const boot = () => {};\n' },
        { relativePath: 'sprite.png', content: 'nope' },
        { relativePath: 'shared/kit.ts', content: 'export {};\n' },
      ],
      existing: new Set(['game.ts']),
    });
    expect(plan.add.map((file) => file.path)).toEqual(['entities/player.ts']);
    expect(plan.overwrite.map((file) => file.path)).toEqual(['game.ts']);
    expect(plan.skipped.map((file) => file.path)).toEqual(['sprite.png', 'shared/kit.ts']);
  });

  it('strips a shared archive root and prefixes the target folder', () => {
    const plan = planSourceUpload({
      entries: [
        { relativePath: 'bundle/game.ts', content: 'export {};\n' },
        { relativePath: 'bundle/SPEC.md', content: '# spec\n' },
      ],
      existing: new Set(),
      intoFolder: '',
      stripRoot: true,
    });
    expect(plan.add.map((file) => file.path).sort()).toEqual(['SPEC.md', 'game.ts']);
  });

  it('keeps a sole source folder instead of treating it as a zip wrapper', () => {
    const plan = planSourceUpload({
      entries: [
        { relativePath: 'entities/player.ts', content: 'export {};\n' },
        { relativePath: 'entities/enemy.ts', content: 'export {};\n' },
      ],
      existing: new Set(),
      stripRoot: true,
    });
    expect(plan.add.map((file) => file.path).sort()).toEqual(['entities/enemy.ts', 'entities/player.ts']);
  });

  it('keeps the chosen folder name when stripRoot is off', () => {
    const plan = planSourceUpload({
      entries: [{ relativePath: 'entities/player.ts', content: 'export {};\n' }],
      existing: new Set(),
      intoFolder: 'game',
      stripRoot: false,
    });
    expect(plan.add.map((file) => file.path)).toEqual(['game/entities/player.ts']);
  });
});
