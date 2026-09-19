import { describe, expect, it } from 'vitest';
import { shelfReadsFromDocument } from './shelf-reads-env.js';

// This lever shipped dead once already, so the parsing is pinned.
describe('shelfReadsFromDocument', () => {
  it('defaults on, because an unset variable must not disable the read path', () => {
    expect(shelfReadsFromDocument({})).toBe(true);
    expect(shelfReadsFromDocument({ SHELF_DOCUMENT_READS: undefined })).toBe(true);
  });

  it('turns off only on the two values the runbook tells an operator to use', () => {
    expect(shelfReadsFromDocument({ SHELF_DOCUMENT_READS: 'false' })).toBe(false);
    expect(shelfReadsFromDocument({ SHELF_DOCUMENT_READS: '0' })).toBe(false);
  });

  it('forgives the casing and whitespace a hurried operator types', () => {
    for (const value of ['FALSE', ' false ', 'False', '\t0\n']) {
      expect(shelfReadsFromDocument({ SHELF_DOCUMENT_READS: value })).toBe(false);
    }
  });

  // An empty value is what a missing _VAL expands to.
  it('stays on for anything else, including an empty value', () => {
    for (const value of ['', 'true', '1', 'no', 'off', 'disabled']) {
      expect(shelfReadsFromDocument({ SHELF_DOCUMENT_READS: value })).toBe(true);
    }
  });
});
