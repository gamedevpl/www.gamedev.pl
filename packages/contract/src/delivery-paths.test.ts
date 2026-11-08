import { describe, expect, it } from 'vitest';
import {
  DELIVERY_FIXED_FILES,
  deliveryPathRefusal,
  isDeliverablePath,
  isDeliveryTestPath,
  isRasterSourcePath,
} from './delivery-paths.js';

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

  it('accepts test suffixes without admitting arbitrary dots or harness paths', () => {
    for (const path of ['audit.test.ts', 'game/audit.test.ts', 'game/model.spec.ts', 'tests/model.test.ts']) {
      expect(isDeliverablePath(path), path).toBe(true);
    }
    for (const path of [
      'game/audit.unit.ts',
      'game/audit.test.spec.ts',
      'game.test/audit.ts',
      'game/.test.ts',
      'game//audit.test.ts',
      '../audit.test.ts',
      'shared/audit.test.ts',
      'tools/audit.spec.ts',
      'vitest.config.ts',
    ]) {
      expect(isDeliverablePath(path), path).toBe(false);
    }
  });

  it('identifies test roots and their helpers for the browser preflight', () => {
    for (const path of ['audit.test.ts', 'game/model.spec.ts', 'tests/helper.ts', 'tests/nested/model.test.ts']) {
      expect(isDeliveryTestPath(path), path).toBe(true);
    }
    for (const path of ['game.ts', 'game/audit.ts', 'game/test.ts', 'tests-helper.ts']) {
      expect(isDeliveryTestPath(path), path).toBe(false);
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
