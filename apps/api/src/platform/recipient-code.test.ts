import { describe, expect, it } from 'vitest';
import { generateRecipientCode, isRecipientCodeShape } from './recipient-code.js';

describe('recipient code shape', () => {
  it('generates codes matching its own shape check', () => {
    const code = generateRecipientCode();
    expect(isRecipientCodeShape(code)).toBe(true);
    expect(code.startsWith('rc_')).toBe(true);
  });

  it('never repeats across many draws', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateRecipientCode()));
    expect(codes.size).toBe(1000);
  });

  it('rejects the wrong prefix, wrong charset, and empty input', () => {
    expect(isRecipientCodeShape('')).toBe(false);
    expect(isRecipientCodeShape('not-a-code')).toBe(false);
    expect(isRecipientCodeShape(`xx_${generateRecipientCode().slice(3)}`)).toBe(false);
    expect(isRecipientCodeShape(`rc_${'!'.repeat(22)}`)).toBe(false);
  });
});
