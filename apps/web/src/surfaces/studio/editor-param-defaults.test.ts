import { describe, expect, it } from 'vitest';
import { parseEditorParams, withParamDefault } from './editorParamsScrub.js';

const label = { en: 'Value', pl: 'Wartość' };
const valid = { type: 'number', min: 0, max: 10, default: 5, label };
const malformed = [
  { ...valid, default: 'five' },
  { ...valid, default: {} },
  { ...valid, default: null },
  { ...valid, default: 11 },
  { ...valid, type: 'int', default: 1.5 },
  { ...valid, min: 10, max: 0 },
  { ...valid, type: 'int', min: 0.5 },
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
