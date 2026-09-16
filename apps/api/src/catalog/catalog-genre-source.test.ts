import { describe, expect, it } from 'vitest';
import { createCatalogGenreSource } from './catalog-genre-source.js';

describe('createCatalogGenreSource', () => {
  it('forwards bake-time effort onto RecommendGame rows', async () => {
    const source = createCatalogGenreSource({
      client: {
        async getCatalog() {
          return [
            {
              slug: 'rich',
              title: 'Rich',
              genre: 'Arcade',
              controls: '',
              status: 'published',
              media: null,
              multiplayer: null,
              saves: null,
              world: null,
              sensing: null,
              editor: null,
              orientation: 'any',
              submittedBy: null,
              effort: 0.9,
            },
            {
              slug: 'thin',
              title: 'Thin',
              genre: 'Puzzle',
              controls: '',
              status: 'published',
              media: null,
              multiplayer: null,
              saves: null,
              world: null,
              sensing: null,
              editor: null,
              orientation: 'any',
              submittedBy: null,
            },
          ];
        },
      },
      ttlMs: 60_000,
      now: () => 0,
    });

    await expect(source.listPublished()).resolves.toEqual([
      { slug: 'rich', genre: 'Arcade', effort: 0.9 },
      { slug: 'thin', genre: 'Puzzle' },
    ]);
  });
});
