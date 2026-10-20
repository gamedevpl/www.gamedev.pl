import { describe, expect, it } from 'vitest';
import { bakeEditorDefaults } from './editor-bake.js';
import { parseEditorDefinition } from './editor-contract.js';

const EDITOR_JSON = JSON.stringify({
  version: 1,
  params: {
    dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'Dog size', pl: 'Pies' } },
    tagline: { type: 'text', max: 40, default: 'go!', label: { en: 'Tagline', pl: 'Hasło' } },
  },
  content: {
    maps: {
      widget: 'collection',
      label: { en: 'Maps', pl: 'Mapy' },
      itemLabel: { en: 'Map', pl: 'Mapa' },
      min: 1,
      max: 3,
      item: {
        widget: 'tilemap',
        grid: { minCols: 3, maxCols: 8, minRows: 3, maxRows: 8 },
        tiles: [
          { key: 'path', char: '.', label: { en: 'Path', pl: 'Ścieżka' } },
          { key: 'wall', char: '#', label: { en: 'Wall', pl: 'Mur' } },
        ],
        properties: {},
        constraints: [],
      },
      defaults: [{ properties: {}, rows: ['...', '.#.', '...'] }],
    },
  },
});

describe('bakeEditorDefaults', () => {
  it('writes param and content defaults into EDITOR.json and regenerates the L1 module', () => {
    const definition = parseEditorDefinition(EDITOR_JSON).definition!;
    const files = [
      { path: 'EDITOR.json', content: EDITOR_JSON },
      { path: 'game/editor-content.ts', content: '// stale\n' },
      { path: 'SPEC.md', content: '---\ntitle: Dog Dash\n---\n' },
      { path: 'index.html', content: '<canvas></canvas>' },
      { path: 'game.ts', content: "import './game/runtime.ts';\n" },
    ];

    bakeEditorDefaults(
      files,
      definition,
      { dogScale: 2.5, tagline: 'woof' },
      { maps: [{ properties: {}, rows: ['###', '.#.', '###'] }] },
    );

    const editor = JSON.parse(files.find((file) => file.path === 'EDITOR.json')!.content) as {
      params: { dogScale: { default: number }; tagline: { default: string } };
      content: { maps: { defaults: unknown } };
    };
    expect(editor.params.dogScale.default).toBe(2.5);
    expect(editor.params.tagline.default).toBe('woof');
    expect(editor.content.maps.defaults).toEqual([{ properties: {}, rows: ['###', '.#.', '###'] }]);

    const generated = files.find((file) => file.path === 'game/editor-content.ts')!.content;
    expect(generated).toContain('2.5');
    expect(generated).toContain('woof');
    expect(generated).not.toContain('// stale');
  });
});
