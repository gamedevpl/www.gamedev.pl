import { expect, it } from 'vitest';
import { overlayGameSources } from './game-overlay.js';

it('drops a legacy EDITOR.ts carried forward from a delivered or seed base', () => {
  const overlay = overlayGameSources({
    staged: [{ path: 'game.ts', content: 'new' }],
    delivered: [
      { path: 'game.ts', content: 'old' },
      { path: 'EDITOR.ts', content: 'export default {};' },
      { path: 'EDITOR.json', content: '{"version":2}' },
    ],
    seed: [{ path: 'EDITOR.ts', content: 'export default {};' }],
  });
  expect(overlay).toEqual({ 'game.ts': 'new', 'EDITOR.json': '{"version":2}' });
});
