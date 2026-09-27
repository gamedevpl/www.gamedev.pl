import { expect, it } from 'vitest';
import { deliveryPathRefusal } from './delivery-paths.js';

it('refuses executable authoring source while preserving ordinary runtime editor modules', () => {
  expect(deliveryPathRefusal('EDITOR.ts')).toContain('compiled EDITOR.json only');
  expect(deliveryPathRefusal('game/editor.ts')).toBeNull();
  expect(deliveryPathRefusal('EDITOR.json')).toBeNull();
  expect(deliveryPathRefusal('EDITOR.content.json')).toBeNull();
});
