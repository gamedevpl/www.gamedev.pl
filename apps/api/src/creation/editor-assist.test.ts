import { describe, expect, it } from 'vitest';
import { applyAssistPatches, assistEnabled } from './editor-assist.js';
import { parseEditorDefinition } from './editor-contract.js';

/*
 * The router's safety boundary is `applyAssistPatches`, not the prompt: whatever
 * the model returns — confused, hallucinated, or steered by injected text in the
 * utterance — only declared keys with in-range values may reach a draft. These
 * tests pin that, because the prompt is advice and this is the enforcement.
 */

const DEFINITION = parseEditorDefinition(
  JSON.stringify({
    version: 1,
    params: {
      dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'Dog size', pl: 'Wielkość psa' } },
      spawnRate: { type: 'int', min: 1, max: 20, default: 6, label: { en: 'Spawn rate', pl: 'Tempo' } },
      hardMode: { type: 'bool', default: false, label: { en: 'Hard mode', pl: 'Tryb trudny' } },
      theme: {
        type: 'enum',
        values: ['day', 'night'],
        default: 'day',
        label: { en: 'Theme', pl: 'Motyw' },
      },
    },
  }),
).definition!;

const CONTENT = { params: { dogScale: 1, spawnRate: 6, hardMode: false, theme: 'day' } };

describe('applyAssistPatches', () => {
  it('applies declared params and reports what changed', () => {
    const result = applyAssistPatches(DEFINITION, CONTENT, [
      { key: 'dogScale', value: 1.3 },
      { key: 'hardMode', value: true },
    ]);
    expect(result.patches).toEqual([
      { key: 'dogScale', value: 1.3 },
      { key: 'hardMode', value: true },
    ]);
    expect(result.content.params).toMatchObject({ dogScale: 1.3, hardMode: true, spawnRate: 6 });
  });

  it('clamps an overshoot instead of refusing it, and rounds ints', () => {
    const result = applyAssistPatches(DEFINITION, CONTENT, [
      { key: 'dogScale', value: 12 },
      { key: 'spawnRate', value: 7.6 },
    ]);
    expect(result.patches).toEqual([
      { key: 'dogScale', value: 3 },
      { key: 'spawnRate', value: 8 },
    ]);
  });

  it('drops undeclared keys, wrong types, and undeclared enum options', () => {
    const result = applyAssistPatches(DEFINITION, CONTENT, [
      { key: 'somethingElse', value: 5 },
      { key: '__proto__', value: 'polluted' },
      { key: 'hardMode', value: 'yes' },
      { key: 'theme', value: 'apocalypse' },
      { key: 'dogScale', value: 'big' },
    ]);
    expect(result.patches).toEqual([]);
    expect(result.content).toEqual(CONTENT);
  });

  it('reports no patch when the model proposes the value already set', () => {
    expect(applyAssistPatches(DEFINITION, CONTENT, [{ key: 'dogScale', value: 1 }]).patches).toEqual([]);
  });

  it('leaves collections untouched while patching params', () => {
    const combined = parseEditorDefinition(
      JSON.stringify({
        version: 1,
        params: {
          spawnRate: { type: 'int', min: 1, max: 20, default: 6, label: { en: 'Spawn rate', pl: 'Tempo' } },
        },
        content: {
          gardens: {
            widget: 'collection',
            label: { en: 'Gardens', pl: 'Ogrody' },
            itemLabel: { en: 'Garden', pl: 'Ogród' },
            min: 1,
            max: 4,
            item: {
              widget: 'tilemap',
              grid: { minCols: 2, maxCols: 8, minRows: 1, maxRows: 4 },
              tiles: [
                { key: 'path', char: '.', label: { en: 'Path', pl: 'Ścieżka' } },
                { key: 'wall', char: '#', label: { en: 'Wall', pl: 'Mur' } },
              ],
              properties: {},
              constraints: [],
            },
            defaults: [{ properties: {}, rows: ['##'] }],
          },
        },
      }),
    ).definition!;
    const gardens = [{ properties: {}, rows: ['#.'] }];
    const doc = { params: { spawnRate: 6 }, gardens };
    const result = applyAssistPatches(combined, doc, [{ key: 'spawnRate', value: 9 }]);
    expect(result.patches).toEqual([{ key: 'spawnRate', value: 9 }]);
    expect(result.content.gardens).toBe(gardens);
  });

  it('drops the whole patch set when the result would not validate', () => {
    // A params-only game handed a document carrying an undeclared collection:
    // the document was already invalid, and half-applying onto it would hand the
    // draft write a body it must reject anyway.
    const stray = { ...CONTENT, gardens: [{ properties: {}, rows: ['##'] }] };
    expect(applyAssistPatches(DEFINITION, stray, [{ key: 'spawnRate', value: 9 }]).patches).toEqual([]);
  });
});

describe('assistEnabled', () => {
  it('is off unless the deploy flag says exactly true', () => {
    expect(assistEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(assistEnabled({ EDITOR_ASSIST: '1' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(assistEnabled({ EDITOR_ASSIST: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});
