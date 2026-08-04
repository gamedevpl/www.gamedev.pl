import { describe, expect, it } from 'vitest';
import { decodeCanonicalBase64, decodeCanonicalBase64Utf8, InvalidBase64Error } from './canonical-base64.js';

describe('decodeCanonicalBase64', () => {
  it('decodes valid padded base64', () => {
    expect(decodeCanonicalBase64Utf8('YWJj')).toBe('abc');
    expect(decodeCanonicalBase64('YWI=').toString('utf8')).toBe('ab');
  });

  it('allows whitespace inside the payload', () => {
    expect(decodeCanonicalBase64Utf8('YW Jj\n')).toBe('abc');
  });

  it('rejects the silent corruption Node would otherwise accept', () => {
    // Buffer.from('YWJj!!!', 'base64') === 'abc' — that must not pass here.
    expect(() => decodeCanonicalBase64('YWJj!!!')).toThrow(InvalidBase64Error);
    expect(() => decodeCanonicalBase64('YWI')).toThrow(InvalidBase64Error);
    expect(() => decodeCanonicalBase64('')).toThrow(InvalidBase64Error);
    expect(() => decodeCanonicalBase64('@@@@')).toThrow(InvalidBase64Error);
  });
});
