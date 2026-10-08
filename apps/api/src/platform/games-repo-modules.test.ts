import { it, expect } from 'vitest';
import { GAME_KIT_MODULES } from './games-repo-contract.js';

it('lists GameKit modules in the post-draw-surface canonical order', () => {
  expect([...GAME_KIT_MODULES]).toEqual([
    'input',
    'collision',
    'world',
    'grid',
    'path',
    'ai',
    'gameplay',
    'rng',
    'cards',
    'vehicles',
    'urban',
    'drawing',
    'actors',
    'gfx',
    'ui',
    'gfx3d',
    'racing',
    'football',
    'platformer',
    'effects',
    'audio',
    'party',
    'save',
    'commons',
    'presence',
    'mascot',
    'zone',
    'sensing',
    'voice',
    'editor',
    'settings',
    'inspect',
  ]);
});
