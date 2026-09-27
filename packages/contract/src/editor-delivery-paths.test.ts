import { expect, it } from 'vitest';
import { deliveryPathRefusal, withoutRetiredPaths } from './delivery-paths.js';

it('refuses executable authoring source while preserving ordinary runtime editor modules', () => {
  expect(deliveryPathRefusal('EDITOR.ts')).toContain('compiled EDITOR.json only');
  expect(deliveryPathRefusal('game/editor.ts')).toBeNull();
  expect(deliveryPathRefusal('EDITOR.json')).toBeNull();
  expect(deliveryPathRefusal('EDITOR.content.json')).toBeNull();
});

it('drops retired paths from persisted file sets', () => {
  const files = [{ path: 'game.ts' }, { path: 'EDITOR.ts' }, { path: 'EDITOR.json' }];
  expect(withoutRetiredPaths(files).map((file) => file.path)).toEqual(['game.ts', 'EDITOR.json']);
});
