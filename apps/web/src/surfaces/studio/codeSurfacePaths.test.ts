import { describe, expect, it } from 'vitest';
import {
  deliverablePathReason,
  folderPathReason,
  joinSourcePath,
  parentDir,
  stubForPath,
  wouldNestInsideSelf,
} from './codeSurfacePaths.js';

describe('codeSurfacePaths', () => {
  it('accepts fixed files and extra ts modules', () => {
    expect(deliverablePathReason('game.ts')).toBeNull();
    expect(deliverablePathReason('entities/player.ts')).toBeNull();
    expect(deliverablePathReason('SPEC.md')).toBeNull();
  });

  it('refuses reserved, hidden, media, and non-source paths', () => {
    expect(deliverablePathReason('shared/kit.ts')).toMatch(/read-only/i);
    expect(deliverablePathReason('.env')).toMatch(/hidden/i);
    expect(deliverablePathReason('media/shot.png')).toMatch(/media/i);
    expect(deliverablePathReason('sprite.png')).toMatch(/deliverable/i);
    expect(deliverablePathReason('../game.ts')).toMatch(/illegal/i);
  });

  it('joins and splits source paths', () => {
    expect(joinSourcePath('game', 'fx.ts')).toBe('game/fx.ts');
    expect(parentDir('game/fx.ts')).toBe('game');
    expect(parentDir('game.ts')).toBe('');
  });

  it('rejects nesting a folder inside itself', () => {
    expect(wouldNestInsideSelf('game', 'game/fx')).toBe(true);
    expect(wouldNestInsideSelf('game', 'gfx')).toBe(false);
  });

  it('validates folder names', () => {
    expect(folderPathReason('entities')).toBeNull();
    expect(folderPathReason('game/fx')).toBeNull();
    expect(folderPathReason('Shared')).toMatch(/lowercase/i);
    expect(folderPathReason('tools')).toMatch(/read-only/i);
  });

  it('stubs new files by extension', () => {
    expect(stubForPath('mod.ts')).toContain('export');
    expect(stubForPath('GAME.json')).toBe('{}\n');
  });
});
