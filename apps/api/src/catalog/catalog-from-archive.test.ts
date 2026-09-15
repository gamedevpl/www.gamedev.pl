import { describe, expect, it } from 'vitest';
import { buildCatalogFromArchive } from './catalog-from-archive.js';
import { catalogEntryFromSpec } from './github-client.js';

function spec(title: string): string {
  return ['---', `title: ${title}`, 'status: published', 'genre: arcade', '---', '', 'A game.'].join('\n');
}

describe('buildCatalogFromArchive effort', () => {
  it('ranks a richer game above a thin peer after 0..1 normalisation', async () => {
    const files = new Map<string, string>([
      ['games/thin/SPEC.md', spec('Thin')],
      ['games/thin/game.ts', 'const x = 1;\n'],
      ['games/rich/SPEC.md', spec('Rich')],
      ['games/rich/game.ts', 'const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\nconst e = 5;\n'],
      ['games/rich/game/model.ts', 'export const n = 1;\nexport const m = 2;\n'],
      ['games/rich/TRACE.json', '{"frames":200,"samples":[]}'],
      ['games/rich/ACCEPTANCE.json', '{"achieved":[{},{},{}]}'],
      ['games/rich/PLAYTEST.json', '{"expectProgress":["round-start","win"]}'],
      ['games/rich/media/opening.png', 'png'],
      ['games/rich/media/mid.png', 'png'],
    ]);

    const catalog = await buildCatalogFromArchive(
      'main',
      async (filePath) => files.get(filePath) ?? null,
      [...files.keys()],
      {
        entryFromSpec: catalogEntryFromSpec,
        commitCounts: new Map([
          ['thin', 1],
          ['rich', 20],
        ]),
      },
    );

    const thin = catalog.find((entry) => entry.slug === 'thin');
    const rich = catalog.find((entry) => entry.slug === 'rich');
    expect(rich?.effort).toBe(1);
    expect(thin?.effort).toBeGreaterThan(0);
    expect(thin!.effort!).toBeLessThan(rich!.effort!);
  });

  it('treats missing commit history as zero without dropping loc and artifacts', async () => {
    const files = new Map<string, string>([
      ['games/solo/SPEC.md', spec('Solo')],
      ['games/solo/game.ts', 'const x = 1;\nconst y = 2;\n'],
      ['games/solo/TRACE.json', '{"frames":12}'],
    ]);
    const catalog = await buildCatalogFromArchive(
      'main',
      async (filePath) => files.get(filePath) ?? null,
      [...files.keys()],
      { entryFromSpec: catalogEntryFromSpec },
    );
    expect(catalog[0]?.effort).toBe(0.8);
  });
});
