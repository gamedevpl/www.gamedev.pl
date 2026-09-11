import { describe, expect, it } from 'vitest';
import { diffLines } from './diffLines.js';

describe('diffLines', () => {
  it('reports pure context for identical text', () => {
    const text = 'a\nb\nc';
    expect(diffLines(text, text)).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'context', text: 'b' },
      { kind: 'context', text: 'c' },
    ]);
  });

  it('marks a single changed line as removed+added, keeping context around it', () => {
    const base = 'const SPEED = 4;\nconst LIVES = 3;';
    const next = 'const SPEED = 8;\nconst LIVES = 3;';
    expect(diffLines(base, next)).toEqual([
      { kind: 'removed', text: 'const SPEED = 4;' },
      { kind: 'added', text: 'const SPEED = 8;' },
      { kind: 'context', text: 'const LIVES = 3;' },
    ]);
  });

  it('reports every line as added when base is empty', () => {
    expect(diffLines('', 'a\nb')).toEqual([
      { kind: 'removed', text: '' },
      { kind: 'added', text: 'a' },
      { kind: 'added', text: 'b' },
    ]);
  });

  it('reports every line as removed when next is empty', () => {
    expect(diffLines('a\nb', '')).toEqual([
      { kind: 'removed', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: '' },
    ]);
  });

  it('finds an insertion in the middle without disturbing unrelated lines', () => {
    const base = 'one\ntwo\nfour';
    const next = 'one\ntwo\nthree\nfour';
    expect(diffLines(base, next)).toEqual([
      { kind: 'context', text: 'one' },
      { kind: 'context', text: 'two' },
      { kind: 'added', text: 'three' },
      { kind: 'context', text: 'four' },
    ]);
  });
});
