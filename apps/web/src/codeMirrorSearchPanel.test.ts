import { SearchQuery } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { countMatches, describeCount, MATCH_LIMIT } from './codeMirrorSearchPanel.js';

// The panel needs a laid-out EditorView; only the counter is pure.

const DOC = `lem.y += lem.vy;
if (Lem.y > 0) {
  lem.done = true;
}`;

function stateWith(doc: string, selection?: { anchor: number; head: number }) {
  return EditorState.create({ doc, selection });
}

describe('countMatches', () => {
  it('counts every match when the cursor is not on one', () => {
    const state = stateWith(DOC);
    expect(countMatches(state, new SearchQuery({ search: 'lem' }))).toEqual({
      total: 4,
      current: 0,
      capped: false,
    });
  });

  it('honours case sensitivity', () => {
    const state = stateWith(DOC);
    const query = new SearchQuery({ search: 'lem', caseSensitive: true });
    expect(countMatches(state, query).total).toBe(3);
  });

  it('reports the 1-based index of the match under the selection', () => {
    // The second `lem`, at "lem.vy".
    const at = DOC.indexOf('lem', 4);
    const state = stateWith(DOC, { anchor: at, head: at + 3 });
    expect(countMatches(state, new SearchQuery({ search: 'lem' }))).toEqual({
      total: 4,
      current: 2,
      capped: false,
    });
  });

  it('treats a partially covered match as no current match', () => {
    const at = DOC.indexOf('lem');
    const state = stateWith(DOC, { anchor: at, head: at + 2 });
    expect(countMatches(state, new SearchQuery({ search: 'lem' })).current).toBe(0);
  });

  it('returns nothing for an invalid query', () => {
    const state = stateWith(DOC);
    const query = new SearchQuery({ search: 'lem(', regexp: true });
    expect(query.valid).toBe(false);
    expect(countMatches(state, query)).toEqual({ total: 0, current: 0, capped: false });
  });

  it('stops counting at the cap instead of walking a huge document', () => {
    const state = stateWith('x '.repeat(MATCH_LIMIT + 50));
    const counted = countMatches(state, new SearchQuery({ search: 'x' }));
    expect(counted).toEqual({ total: MATCH_LIMIT, current: 0, capped: true });
  });
});

describe('describeCount', () => {
  it('names the empty case rather than showing a zero', () => {
    expect(describeCount({ total: 0, current: 0, capped: false })).toBe('No results');
  });

  it('reads as a position when the cursor sits on a match', () => {
    expect(describeCount({ total: 14, current: 3, capped: false })).toBe('3 of 14');
  });

  it('reads as a total when it does not', () => {
    expect(describeCount({ total: 14, current: 0, capped: false })).toBe('14 results');
  });

  it('marks a capped count as approximate', () => {
    expect(describeCount({ total: 999, current: 0, capped: true })).toBe('999+ results');
    expect(describeCount({ total: 999, current: 5, capped: true })).toBe('5 of 999+');
  });
});
