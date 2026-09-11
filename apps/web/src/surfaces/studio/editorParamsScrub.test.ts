import { describe, expect, it } from 'vitest';
import { clampParamValue, parseEditorParams, scrubStep, withParamDefault } from './editorParamsScrub.js';

const EDITOR_JSON = JSON.stringify({
  version: 1,
  params: {
    speed: { type: 'number', min: 1, max: 10, default: 4, label: { en: 'Speed', pl: 'Prędkość' } },
    lives: { type: 'int', min: 1, max: 9, default: 3, label: { en: 'Lives', pl: 'Życia' } },
    color: { type: 'enum', values: ['red', 'blue'], default: 'red', label: { en: 'Color', pl: 'Kolor' } },
  },
});

describe('parseEditorParams', () => {
  it('extracts declared params and everything else as rest', () => {
    const result = parseEditorParams(EDITOR_JSON);
    expect(result).not.toBeNull();
    expect(Object.keys(result!.params)).toEqual(['speed', 'lives', 'color']);
    expect(result!.params.speed).toEqual({
      type: 'number',
      min: 1,
      max: 10,
      default: 4,
      label: { en: 'Speed', pl: 'Prędkość' },
    });
    expect(result!.rest).toEqual({ version: 1 });
  });

  it('returns an empty param map for a file with no params key', () => {
    const result = parseEditorParams(JSON.stringify({ version: 1 }));
    expect(result).toEqual({ params: {}, rest: { version: 1 } });
  });

  it('returns null for invalid JSON', () => {
    expect(parseEditorParams('{not json')).toBeNull();
  });

  it('returns null when params is not an object', () => {
    expect(parseEditorParams(JSON.stringify({ params: [] }))).toBeNull();
  });

  it('skips a malformed param entry rather than failing the whole file', () => {
    const result = parseEditorParams(JSON.stringify({ params: { ok: EDITOR_JSON, broken: { foo: 'bar' } } }));
    expect(result).toEqual({ params: {}, rest: {} });
  });

  it('skips a param missing its label, even with type and default present', () => {
    const result = parseEditorParams(
      JSON.stringify({ params: { speed: { type: 'number', min: 1, max: 10, default: 4 } } }),
    );
    expect(result).toEqual({ params: {}, rest: {} });
  });

  it('skips an enum param missing its values array', () => {
    const result = parseEditorParams(
      JSON.stringify({ params: { color: { type: 'enum', default: 'red', label: { en: 'Color', pl: 'Kolor' } } } }),
    );
    expect(result).toEqual({ params: {}, rest: {} });
  });
});

describe('withParamDefault', () => {
  it('rewrites only the named param, leaving everything else intact', () => {
    const next = withParamDefault(EDITOR_JSON, 'speed', 7);
    expect(next).not.toBeNull();
    const parsed = JSON.parse(next!);
    expect(parsed.params.speed.default).toBe(7);
    expect(parsed.params.lives.default).toBe(3);
    expect(parsed.params.color.default).toBe('red');
    expect(parsed.version).toBe(1);
  });

  it('round-trips through the tier-1 diff as a pure default change', async () => {
    const { declaredParamDefaultChanges } = await import('./editorJsonLiveDiff.js');
    const next = withParamDefault(EDITOR_JSON, 'lives', 5)!;
    const changes = declaredParamDefaultChanges(EDITOR_JSON, next);
    expect(changes).toEqual([{ key: 'lives', value: 5 }]);
  });

  it('returns null for an unknown param key', () => {
    expect(withParamDefault(EDITOR_JSON, 'nope', 1)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(withParamDefault('{not json', 'speed', 1)).toBeNull();
  });
});

describe('scrubStep', () => {
  it('is 1 for an int param regardless of range', () => {
    expect(scrubStep({ type: 'int', min: 1, max: 9 })).toBe(1);
  });

  it('is one hundredth of the range for a number param', () => {
    expect(scrubStep({ type: 'number', min: 1, max: 10 })).toBeCloseTo(0.09);
  });

  it('falls back to a small positive step for a zero-span range', () => {
    expect(scrubStep({ type: 'number', min: 5, max: 5 })).toBeGreaterThan(0);
  });
});

describe('clampParamValue', () => {
  it('clamps to the declared range', () => {
    expect(clampParamValue({ type: 'number', min: 1, max: 10 }, 15)).toBe(10);
    expect(clampParamValue({ type: 'number', min: 1, max: 10 }, -3)).toBe(1);
  });

  it('rounds an int param after clamping', () => {
    expect(clampParamValue({ type: 'int', min: 1, max: 9 }, 4.6)).toBe(5);
  });

  it('leaves a number param fractional', () => {
    expect(clampParamValue({ type: 'number', min: 1, max: 10 }, 4.6)).toBe(4.6);
  });
});
