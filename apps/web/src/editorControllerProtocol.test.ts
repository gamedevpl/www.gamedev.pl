import { describe, expect, it } from 'vitest';
import { parseEditorControllerEnvelope } from './editorControllerProtocol.js';

const envelope = (body: Record<string, unknown>) => ({ ns: 'gdp', v: 1, ...body });

describe('EditorKit controller protocol', () => {
  it.each([
    [
      'ui',
      envelope({
        t: 'editor:ui',
        doc: [
          { type: 'toolbar', tools: ['paint'], active: 'paint' },
          {
            type: 'board',
            layers: ['terrain'],
            rows: ['..'],
            tiles: [{ char: '.', color: '#123456' }],
          },
          {
            type: 'propertySheet',
            layer: 'terrain',
            index: 0,
            fields: [{ name: 'speed', label: 'Speed', type: 'number', value: 1 }],
          },
        ],
      }),
      'editor:ui',
    ],
    ['change', envelope({ t: 'editor:change', id: 'change-1', patch: { op: 'replace' } }), 'editor:change'],
    ['selection', envelope({ t: 'editor:select', selection: { layer: 'actors', index: 2 } }), 'editor:select'],
    ['cleared selection', envelope({ t: 'editor:select', selection: null }), 'editor:select'],
    [
      'canvas',
      envelope({
        t: 'editor:canvas',
        box: { width: 640, height: 360, x: -12, y: 8, insetX: 4, insetY: 6, scale: 1.5 },
      }),
      'editor:canvas',
    ],
  ])('accepts a valid %s envelope', (_name, raw, type) => {
    expect(parseEditorControllerEnvelope(raw)?.t).toBe(type);
  });

  it.each([
    ['missing namespace', { v: 1, t: 'editor:change', id: 'x' }],
    ['wrong namespace', { ns: 'other', v: 1, t: 'editor:change', id: 'x' }],
    ['wrong version', { ns: 'gdp', v: 2, t: 'editor:change', id: 'x' }],
    ['unknown type', envelope({ t: 'editor:future' })],
    ['non-object', 'editor:hello'],
    ['array', []],
  ])('rejects %s', (_name, raw) => {
    expect(parseEditorControllerEnvelope(raw)).toBeNull();
  });

  it('enforces UI depth and child-count budgets', () => {
    let deep: Record<string, unknown> = { type: 'note', text: 'leaf' };
    for (let level = 0; level < 7; level += 1) deep = { type: 'group', children: [deep] };
    expect(parseEditorControllerEnvelope(envelope({ t: 'editor:ui', doc: deep }))).toBeNull();
    expect(
      parseEditorControllerEnvelope(
        envelope({ t: 'editor:ui', doc: { type: 'group', children: Array(33).fill({ type: 'note', text: 'x' }) } }),
      ),
    ).toBeNull();
    expect(
      parseEditorControllerEnvelope(envelope({ t: 'editor:ui', doc: Array(33).fill({ type: 'note', text: 'x' }) })),
    ).toBeNull();
    const wide = Array(16).fill({ type: 'group', children: Array(16).fill({ type: 'note', text: 'x' }) });
    expect(parseEditorControllerEnvelope(envelope({ t: 'editor:ui', doc: wide }))).toBeNull();
  });

  it.each([
    ['unknown node', { type: 'video' }],
    ['missing children', { type: 'panel' }],
    ['bad label', { type: 'note', text: { en: 'Only English' } }],
    ['fractional property index', { type: 'propertySheet', layer: 'actors', index: 0.5 }],
    [
      'nonfinite field value',
      { type: 'propertySheet', layer: 'actors', index: 0, fields: [{ name: 'x', label: 'X', type: 'number', value: Infinity }] },
    ],
    ['oversized toolbar', { type: 'toolbar', tools: Array(33).fill('paint') }],
    ['invalid toolbar selection', { type: 'toolbar', tools: ['paint'], active: 2 }],
    ['malformed board tile', { type: 'board', layers: ['terrain'], tiles: [{ char: '' }] }],
  ])('rejects malformed UI: %s', (_name, doc) => {
    expect(parseEditorControllerEnvelope(envelope({ t: 'editor:ui', doc }))).toBeNull();
  });

  it.each([
    ['missing selection', undefined],
    ['primitive selection', 'actors'],
    ['missing layer', { index: 0 }],
    ['fractional index', { layer: 'actors', index: 1.5 }],
    ['negative index', { layer: 'actors', index: -1 }],
    ['string index', { layer: 'actors', index: '1' }],
  ])('rejects invalid selection: %s', (_name, selection) => {
    expect(parseEditorControllerEnvelope(envelope({ t: 'editor:select', selection }))).toBeNull();
  });

  const nonfiniteCanvasValues = ['width', 'height', 'x', 'y', 'insetX', 'insetY', 'scale'].flatMap((field) =>
    [Number.NaN, Infinity, -Infinity].map((value) => [field, value] as const),
  );

  it.each(nonfiniteCanvasValues)('rejects nonfinite canvas %s=%s', (field, value) => {
    const box = { width: 640, height: 360, x: 0, y: 0, insetX: 0, insetY: 0, scale: 1, [field]: value };
    expect(parseEditorControllerEnvelope(envelope({ t: 'editor:canvas', box }))).toBeNull();
  });

  it.each([
    ['width', 0],
    ['width', -1],
    ['height', 0],
    ['height', -1],
    ['insetX', -1],
    ['insetY', -1],
    ['scale', 0],
    ['scale', -1],
  ])('rejects out-of-range canvas %s=%s', (field, value) => {
    const box = { width: 640, height: 360, x: 0, y: 0, insetX: 0, insetY: 0, scale: 1, [field]: value };
    expect(parseEditorControllerEnvelope(envelope({ t: 'editor:canvas', box }))).toBeNull();
  });

  it('does not partially preserve invalid optional canvas fields', () => {
    const parsed = parseEditorControllerEnvelope(
      envelope({ t: 'editor:canvas', box: { width: 640, height: 360, x: 0, y: 0, insetX: '4' } }),
    );
    expect(parsed).toBeNull();
  });

  it.each([
    ['empty id', ''],
    ['oversized id', 'x'.repeat(129)],
    ['numeric id', 3],
  ])('rejects an invalid change id: %s', (_name, id) => {
    expect(parseEditorControllerEnvelope(envelope({ t: 'editor:change', id, patch: {} }))).toBeNull();
  });
});
