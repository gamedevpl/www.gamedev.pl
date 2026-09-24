import { describe, expect, it } from 'vitest';
import { DELIVERY_FIXED_FILES, deliveryPathRefusal, isDeliverablePath, isRasterSourcePath } from './delivery-paths.js';

describe('isDeliverablePath', () => {
  it('accepts every fixed file, own modules and raster assets', () => {
    for (const path of DELIVERY_FIXED_FILES) expect(isDeliverablePath(path)).toBe(true);
    for (const path of ['game/level.ts', 'entities/player.ts', 'images/hero.png', 'scenes/a/b.webp']) {
      expect(isDeliverablePath(path)).toBe(true);
    }
  });

  it('refuses notes, media, config, hidden and harness paths', () => {
    for (const path of [
      'NOTATKI-I-POMYSLY.md',
      'notes.txt',
      'README.md',
      'media/cover.png',
      'tsconfig.json',
      'setup.js',
      '.env',
      'shared/x.ts',
      'node_modules/a.ts',
      '../x.ts',
      'Game.ts',
      'game//x.ts',
      'game.ts ',
      ' SPEC.md',
    ]) {
      expect(isDeliverablePath(path), path).toBe(false);
    }
  });

  it('agrees with the refusal text it shares with the API', () => {
    expect(deliveryPathRefusal('game.ts')).toBeNull();
    expect(deliveryPathRefusal('NOTATKI-I-POMYSLY.md')).toMatch(
      /^path not deliverable: NOTATKI-I-POMYSLY\.md\. Deliver only your own game's files \(SPEC\.md, /,
    );
    expect(deliveryPathRefusal('/abs.ts')).toBe('illegal path: /abs.ts');
  });

  it('matches raster paths without doubled slashes', () => {
    expect(isRasterSourcePath('cast/hero.PNG')).toBe(true);
    expect(isRasterSourcePath('cast//hero.png')).toBe(false);
  });
});
