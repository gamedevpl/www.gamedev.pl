import { describe, expect, it } from 'vitest';
import { clampParamValue, parseEditorParams, scrubStep, withParamDefault } from './editorParamsScrub.js';

const label = { en: 'Value', pl: 'Wartość' };
const valid = { type: 'number', min: 0, max: 10, default: 5, label };
const malformed = [
  { ...valid, default: 'five' },
  { ...valid, default: {} },
  { ...valid, default: null },
  { ...valid, default: 11 },
  { ...valid, type: 'int', default: 1.5 },
  { ...valid, min: 10, max: 0 },
  { ...valid, type: 'int', min: 0.5, max: 3.5, default: 4 },
  { type: 'text', max: 10, default: {}, label },
  { type: 'text', max: 2, default: 'long', label },
  { type: 'enum', values: ['red'], default: 'blue', label },
  { type: 'bool', default: 'true', label },
];

describe('staged editor parameter defaults', () => {
  it.each(malformed)('omits invalid controls while preserving safe params: %j', (invalid) => {
    const text = JSON.stringify({ params: { unsafe: invalid, safe: valid } });
    expect(parseEditorParams(text)?.params).toEqual({ safe: valid });
    expect(withParamDefault(text, 'unsafe', 5)).toBeNull();
  });
  it('rejects non-finite JSON numbers', () => {
    const text = JSON.stringify({ params: { unsafe: valid } }).replace('"default":5', '"default":1e999');
    expect(parseEditorParams(text)?.params).toEqual({});
  });
  it('refuses a scrub value outside the declared contract', () => {
    const text = JSON.stringify({ params: { safe: valid } });
    expect(withParamDefault(text, 'safe', 'wrong')).toBeNull();
    expect(withParamDefault(text, 'safe', 11)).toBeNull();
    expect(withParamDefault(text, 'safe', 7)).not.toBeNull();
  });
});

it('keeps server-valid integer params with fractional bounds editable', () => {
  const spec = { ...valid, type: 'int', min: 0.5, max: 3.5, default: 1 };
  const text = JSON.stringify({ params: { lives: spec } });
  expect(parseEditorParams(text)?.params.lives).toEqual(spec);
  expect(JSON.parse(withParamDefault(text, 'lives', 2)!).params.lives.default).toBe(2);
  expect(withParamDefault(text, 'lives', 1.5)).toBeNull();
});
it.each([
  { min: 0.5, max: 3.5, value: 4, expected: 3 },
  { min: -3.5, max: -0.5, value: 0, expected: -1 },
])('clamps integer scrubs to legal values inside fractional bounds: %j', ({ min, max, value, expected }) => {
  expect(clampParamValue({ type: 'int', min, max }, value)).toBe(expected);
});

it.each(['number', 'int'] as const)('keeps finite %s endpoints when their span overflows', (type) => {
  const spec = { type, min: -1e308, max: 1e308, default: 0, label };
  const text = JSON.stringify({ params: { wide: spec } });
  expect(parseEditorParams(text)?.params.wide).toEqual(spec);
  expect(JSON.parse(withParamDefault(text, 'wide', 1)!).params.wide.default).toBe(1);
});
it('uses a finite positive step when endpoint subtraction overflows', () => {
  expect(scrubStep({ type: 'number', min: -1e308, max: 1e308 })).toBe(2e306);
});
it('uses a positive step when dividing a tiny span underflows', () => {
  expect(scrubStep({ type: 'number', min: 0, max: Number.MIN_VALUE })).toBeGreaterThan(0);
});
