import { describe, expect, it } from 'vitest';
import { generateEditorContentModule, parseEditorDefinition, validateEditorContent } from './editor-contract.js';

/*
 * This file mirrors the games repo's tools/lib/editor-contract.ts (the
 * authority — its Check 31 gates every delivery). These tests pin the behaviors
 * the publish path depends on; the generator fixture below must produce output
 * byte-identical to the games repo's `npm run editor:gen`, because the gate
 * regenerates and byte-compares on every content publish.
 */

const DEFINITION = {
  version: 1,
  content: {
    gardens: {
      widget: 'collection',
      label: { en: 'Gardens', pl: 'Ogrody' },
      itemLabel: { en: 'Garden', pl: 'Ogród' },
      min: 1,
      max: 10,
      item: {
        widget: 'tilemap',
        grid: { minCols: 6, maxCols: 16, minRows: 3, maxRows: 8 },
        tiles: [
          { key: 'path', char: '.', label: { en: 'Path', pl: 'Ścieżka' } },
          { key: 'hedge', char: '#', label: { en: 'Hedge', pl: 'Żywopłot' } },
          { key: 'seed', char: '*', label: { en: 'Seed', pl: 'Nasiono' } },
          { key: 'start', char: '@', label: { en: 'Start', pl: 'Start' } },
        ],
        properties: {
          name: { type: 'text', max: 24 },
          parSteps: { type: 'int', min: 1, max: 999 },
        },
        constraints: [
          { tile: 'start', exactly: 1 },
          { tile: 'seed', min: 1 },
        ],
      },
      defaults: [
        {
          properties: { name: 'First Sprouts', parSteps: 18 },
          rows: ['########', '#@*....#', '########'],
        },
      ],
    },
  },
};

describe('editor-contract mirror', () => {
  it('accepts a well-formed definition and refuses unknown widgets', () => {
    const { definition, errors } = parseEditorDefinition(JSON.stringify(DEFINITION));
    expect(errors).toEqual([]);
    expect(definition).not.toBeNull();

    const broken = JSON.parse(JSON.stringify(DEFINITION));
    broken.content.gardens.widget = 'spriteAtlas';
    expect(parseEditorDefinition(JSON.stringify(broken)).definition).toBeNull();
  });

  it('validates draft content against the declared schema and constraints', () => {
    const { definition } = parseEditorDefinition(JSON.stringify(DEFINITION));
    expect(definition).not.toBeNull();
    expect(
      validateEditorContent(definition!, {
        gardens: [{ properties: { name: 'Edited', parSteps: 20 }, rows: ['########', '#.*..@.#', '########'] }],
      }),
    ).toEqual([]);
    // No start tile → constraint failure the Studio shows and the API refuses.
    const errors = validateEditorContent(definition!, {
      gardens: [{ properties: { name: 'Edited', parSteps: 20 }, rows: ['########', '#.*....#', '########'] }],
    });
    expect(errors.some((message) => message.includes('exactly 1 "start"'))).toBe(true);
  });

  it('accepts declared params, refuses bad defaults, and validates values', () => {
    const withParams = JSON.parse(JSON.stringify(DEFINITION));
    withParams.params = {
      walkSpeed: { type: 'number', min: 2, max: 12, default: 6, label: { en: 'Walking speed', pl: 'Prędkość' } },
      showSteps: { type: 'bool', default: true, label: { en: 'Show steps', pl: 'Licznik kroków' } },
    };
    const { definition, errors } = parseEditorDefinition(JSON.stringify(withParams));
    expect(errors).toEqual([]);
    expect(definition?.params?.walkSpeed).toEqual({
      type: 'number',
      min: 2,
      max: 12,
      default: 6,
      label: { en: 'Walking speed', pl: 'Prędkość' },
    });

    // An out-of-range default is refused at declaration time, not discovered live.
    const bad = JSON.parse(JSON.stringify(withParams));
    bad.params.walkSpeed.default = 99;
    expect(parseEditorDefinition(JSON.stringify(bad)).errors.some((m) => m.includes('default'))).toBe(true);

    // Content documents carry values under the reserved key and are clamped by validation.
    const content = {
      params: { walkSpeed: 8, showSteps: false },
      gardens: [{ properties: { name: 'Edited', parSteps: 20 }, rows: ['########', '#.*..@.#', '########'] }],
    };
    expect(validateEditorContent(definition!, content)).toEqual([]);
    expect(
      validateEditorContent(definition!, { ...content, params: { walkSpeed: 99, showSteps: false } }).some((m) =>
        m.includes('walkSpeed'),
      ),
    ).toBe(true);
    expect(validateEditorContent(definition!, { gardens: content.gardens }).some((m) => m.includes('params'))).toBe(
      true,
    );

    // A tunables-only definition (no collections) is legal; "params" is reserved.
    const paramsOnly = { version: 1, params: withParams.params };
    expect(parseEditorDefinition(JSON.stringify(paramsOnly)).definition).not.toBeNull();
    const reserved = JSON.parse(JSON.stringify(DEFINITION));
    reserved.content.params = reserved.content.gardens;
    expect(parseEditorDefinition(JSON.stringify(reserved)).errors.some((m) => m.includes('reserved'))).toBe(true);
  });

  it('generates params into the L1 module and keeps param-less output unchanged', () => {
    const withParams = JSON.parse(JSON.stringify(DEFINITION));
    withParams.params = {
      walkSpeed: { type: 'number', min: 2, max: 12, default: 6, label: { en: 'Walking speed', pl: 'Prędkość' } },
    };
    const generated = generateEditorContentModule(parseEditorDefinition(JSON.stringify(withParams)).definition!);
    expect(generated).toContain('export interface EditorParams {\n  walkSpeed: number;\n}');
    expect(generated).toContain('  params: EditorParams;');
    expect(generated).toContain('"walkSpeed": 6');
  });

  it('generates the L1 module deterministically, matching the games-repo shape', () => {
    const { definition } = parseEditorDefinition(JSON.stringify(DEFINITION));
    const generated = generateEditorContentModule(definition!);
    expect(generated).toBe(generateEditorContentModule(definition!));
    // The exact header + shape the games repo's editor:gen writes — a drift here
    // makes the gate's Check 31 byte-compare fail on every editor publish.
    expect(generated.startsWith('// Generated from EDITOR.json by npm run editor:gen.\n')).toBe(true);
    expect(generated).toContain('export interface GardensItemProperties {\n  name: string;\n  parSteps: number;\n}');
    expect(generated).toContain('export const DEFAULT_CONTENT: EditorContent = {');
    expect(generated).toContain('"name": "First Sprouts"');
  });
});
