import { describe, expect, it } from 'vitest';
import { valueProblem, validateEditorContent, type EditorDefinition, type PropertySpec } from './index.js';

const label = { en: 'Width', pl: 'Szerokość' };

describe('valueProblem', () => {
  it('names a string that is too long', () => {
    const spec: PropertySpec = { type: 'text', max: 4 };
    expect(valueProblem(spec, 'abcde')).toContain('at most 4 characters');
    expect(valueProblem(spec, 'ab')).toBeNull();
  });

  it('names an integer outside min/max', () => {
    const spec: PropertySpec = { type: 'int', min: 2, max: 5 };
    expect(valueProblem(spec, 9)).toContain('integer 2-5');
    expect(valueProblem(spec, 3)).toBeNull();
  });
});

describe('validateEditorContent params', () => {
  const definition: EditorDefinition = {
    version: 1,
    content: {},
    params: { width: { type: 'int', min: 80, max: 200, label, default: 140 } },
  };

  it('reports a param that does not fit', () => {
    expect(validateEditorContent(definition, { params: { width: 12 } }).join()).toContain('80-200');
  });

  it('accepts a param that fits', () => {
    expect(validateEditorContent(definition, { params: { width: 140 } })).toEqual([]);
  });
});
