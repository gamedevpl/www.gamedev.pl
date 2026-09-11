import { describe, expect, it, vi } from 'vitest';
import { collectUploadEntries, planSourceUpload } from './codeSurfaceUpload.js';

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

  it('strips a folder-picker wrapper that contains a fixed source file', () => {
    const plan = planSourceUpload({
      entries: [
        { relativePath: 'my-game/game.ts', content: 'export {};\n' },
        { relativePath: 'my-game/GAME.json', content: '{}\n' },
      ],
      existing: new Set(),
      stripRoot: true,
    });
    expect(plan.add.map((file) => file.path).sort()).toEqual(['GAME.json', 'game.ts']);
  });

  it('does not read oversized or illegal folder entries', async () => {
    const huge = new File(['x'], 'blob.bin');
    Object.defineProperty(huge, 'size', { value: 5_000_000 });
    Object.defineProperty(huge, 'webkitRelativePath', { value: 'my-game/node_modules/blob.bin' });
    const ok = new File(['export {};\n'], 'game.ts');
    Object.defineProperty(ok, 'webkitRelativePath', { value: 'my-game/game.ts' });
    const readHuge = vi.spyOn(huge, 'arrayBuffer');
    const readOk = vi.spyOn(ok, 'arrayBuffer');
    const { entries, skipped } = await collectUploadEntries([{ file: huge }, { file: ok }], { stripRoot: true });
    expect(readHuge).not.toHaveBeenCalled();
    expect(readOk).toHaveBeenCalled();
    expect(entries.map((entry) => entry.relativePath)).toEqual(['my-game/game.ts']);
    expect(skipped.some((item) => item.reason !== '')).toBe(true);
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
