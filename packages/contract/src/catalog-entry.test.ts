import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from './catalog-entry.js';

describe('CatalogEntry', () => {
  it('accepts an entry built from a snapshot bake, which carries touch', () => {
    const entry: CatalogEntry = {
      slug: 'airtime',
      title: 'Airtime',
      genre: 'arcade',
      controls: 'keys',
      status: 'published',
      media: null,
      multiplayer: null,
      saves: 'player',
      world: null,
      sensing: 'tilt',
      orientation: 'landscape',
      touch: 'gamekit',
      submittedBy: null,
    };
    expect(entry.touch).toBe('gamekit');
  });

  it('accepts the SPEC-only fallback, which omits touch entirely', () => {
    const entry: CatalogEntry = {
      slug: 'ashenmere-online',
      title: 'Ashenmere',
      genre: 'rpg',
      controls: 'keys',
      status: 'published',
      media: null,
      multiplayer: null,
      saves: null,
      world: 'shared',
      sensing: null,
      orientation: 'landscape',
      submittedBy: 'gamedev-platform',
    };
    expect('touch' in entry).toBe(false);
  });

  it('accepts touch normalized to null by the web parser', () => {
    const touch: CatalogEntry['touch'] = null;
    expect(touch).toBeNull();
  });
});
