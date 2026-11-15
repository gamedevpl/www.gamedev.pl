import { expect, it } from 'vitest';
import { deliverySummary } from './delivery-summary.js';

it('keeps omitted descriptions optional and trims supplied descriptions', () => {
  expect(deliverySummary(undefined)).toBeUndefined();
  expect(deliverySummary('  Dodano podwójny skok  ')).toBe('Dodano podwójny skok');
  expect(deliverySummary('x'.repeat(1024))).toHaveLength(1024);
});

it.each([true, '', '   ', 'x'.repeat(1025)])('rejects an invalid description before delivery', (value) => {
  expect(() => deliverySummary(value)).toThrow('--summary needs a description of 1–1024 characters');
});
