import { createPatch } from 'diff';
import { describe, expect, it } from 'vitest';
import {
  applyExactReplace,
  applyMultipleExactReplaces,
  applySourcePatch,
  normalizePatchPath,
  normalizeUnifiedDiff,
  SourcePatchError,
} from './source-patch.js';

describe('normalizePatchPath', () => {
  it('strips a/b prefixes, tabs, and quotes', () => {
    expect(normalizePatchPath('a/game/render.ts')).toBe('game/render.ts');
    expect(normalizePatchPath('b/game/render.ts')).toBe('game/render.ts');
    expect(normalizePatchPath('game/render.ts\t2026-01-01 00:00:00')).toBe('game/render.ts');
    expect(normalizePatchPath('"game/render.ts"')).toBe('game/render.ts');
  });
});

describe('normalizeUnifiedDiff', () => {
  it('rewrites bare @@ hunks with counts derived from the body', () => {
    const normalized = normalizeUnifiedDiff(
      ['--- a/game/model.ts', '+++ b/game/model.ts', '@@', ' line1', '-line2', '+line2x', ' line3', ''].join('\n'),
    );
    expect(normalized).toContain('@@ -1,3 +1,3 @@');
    expect(normalized).toContain('-line2');
    expect(normalized).toContain('+line2x');
  });

  it('recounts wrong @@ line counts while keeping the start lines', () => {
    const normalized = normalizeUnifiedDiff(
      ['--- a/game.ts', '+++ b/game.ts', '@@ -10,1 +10,1 @@', ' line1', '-line2', '+line2x', ' line3', ''].join('\n'),
    );
    expect(normalized).toContain('@@ -10,3 +10,3 @@');
  });

  it('prefixes context lines that are missing the leading space', () => {
    const normalized = normalizeUnifiedDiff(
      ['--- a/game.ts', '+++ b/game.ts', '@@', 'line1', '-line2', '+line2x', 'line3', ''].join('\n'),
    );
    expect(normalized.split('\n')).toEqual(expect.arrayContaining([' line1', '-line2', '+line2x', ' line3']));
  });
});

describe('applySourcePatch', () => {
  const content = 'line1\nline2\nline3\n';

  it('applies a unified diff hunk', () => {
    const patch = createPatch('game/render.ts', content, 'line1\nline2x\nline3\n');
    const result = applySourcePatch({ content, path: 'game/render.ts', patch });
    expect(result.content).toBe('line1\nline2x\nline3\n');
    expect(result.replacements).toBe(1);
  });

  it('accepts git-style a/ b/ headers', () => {
    const patch = [
      '--- a/game/render.ts',
      '+++ b/game/render.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+line2x',
      ' line3',
      '',
    ].join('\n');
    const result = applySourcePatch({ content, path: 'game/render.ts', patch });
    expect(result.content).toBe('line1\nline2x\nline3\n');
  });

  it('applies a CRLF unified diff against LF source', () => {
    const patch = [
      '--- a/game/render.ts',
      '+++ b/game/render.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+line2x',
      ' line3',
      '',
    ].join('\r\n');
    const result = applySourcePatch({ content, path: 'game/render.ts', patch });
    expect(result.content).toBe('line1\nline2x\nline3\n');
  });

  it('applies a bare @@ hunk matched by context (no line numbers needed)', () => {
    const patch = [
      '--- a/game/model.ts',
      '+++ b/game/model.ts',
      '@@',
      '   news: { icon: "x" },',
      ' };',
      ' ',
      '+export const GENRES = [];',
      '+',
      ' export type Programme = { id: number };',
      '',
    ].join('\n');
    const base = ['  news: { icon: "x" },', '};', '', 'export type Programme = { id: number };', ''].join('\n');
    const result = applySourcePatch({ content: base, path: 'game/model.ts', patch });
    expect(result.content).toContain('export const GENRES = [];');
    expect(result.content).toContain('export type Programme');
    expect(result.replacements).toBe(1);
  });

  it('applies when @@ line numbers are approximate but context matches', () => {
    const patch = [
      '--- a/game/render.ts',
      '+++ b/game/render.ts',
      '@@ -99,3 +99,3 @@',
      ' line1',
      '-line2',
      '+line2x',
      ' line3',
      '',
    ].join('\n');
    const result = applySourcePatch({ content, path: 'game/render.ts', patch });
    expect(result.content).toBe('line1\nline2x\nline3\n');
  });

  it('applies when @@ line counts are wrong but the body is complete', () => {
    const patch = [
      '--- a/game/render.ts',
      '+++ b/game/render.ts',
      '@@ -1,1 +1,1 @@',
      ' line1',
      '-line2',
      '+line2x',
      ' line3',
      '',
    ].join('\n');
    const result = applySourcePatch({ content, path: 'game/render.ts', patch });
    expect(result.content).toBe('line1\nline2x\nline3\n');
  });

  // Production refusal: "patch is not a valid unified diff" when agents invent
  // @@ -N,M counts that do not match the body (jsdiff throws mid-parse).
  it('applies a multi-hunk patch with invented wrong @@ counts (TV Tycoon shape)', () => {
    const base = [
      '// TV Tycoon — station data, economy, staff routines and the day simulation.',
      '',
      'export const CANVAS_W = 960;',
      'export const CANVAS_H = 600;',
      "export type Phase = 'planning' | 'evening' | 'morning';",
      'export type ReportLine = { slot: number; title: string; viewers: number; contract: string; ok: boolean };',
      'export type Round = {',
      '  rivalNote: string;',
      '',
      '  progIds: number;',
      '  contractIds: number;',
      '};',
      'export function createRound() {',
      '  return {',
      "    rivalNote: '',",
      '',
      '    progIds: 1,',
      '    contractIds: 1,',
      '  };',
      '}',
      '',
    ].join('\n');
    const patch = [
      '--- a/game/model.ts',
      '+++ b/game/model.ts',
      '@@ -1,4 +1,6 @@',
      ' // TV Tycoon — station data, economy, staff routines and the day simulation.',
      '+',
      "+import type { RivalSlot } from './rival.ts';",
      ' ',
      ' export const CANVAS_W = 960;',
      ' export const CANVAS_H = 600;',
      '@@ -430,7 +432,16 @@',
      " export type Phase = 'planning' | 'evening' | 'morning';",
      '-export type ReportLine = { slot: number; title: string; viewers: number; contract: string; ok: boolean };',
      '+export type ReportLine = {',
      '+  slot: number;',
      '+  title: string;',
      '+  viewers: number;',
      '+  contract: string;',
      '+  ok: boolean;',
      '+  rivalTitle: string;',
      '+  rivalGenre: Genre | null;',
      '+  contested: boolean;',
      '+};',
      '@@ -470,6 +481,9 @@',
      '   rivalNote: string;',
      '+  /** What TVMAX is airing tonight, slot by slot. */',
      '+  rivalSchedule: RivalSlot[];',
      '+  lastReason: string;',
      ' ',
      '   progIds: number;',
      '   contractIds: number;',
      '@@ -540,6 +554,8 @@',
      "     rivalNote: '',",
      '+    rivalSchedule: [],',
      "+    lastReason: '',",
      ' ',
      '     progIds: 1,',
      '     contractIds: 1,',
      '',
    ].join('\n');
    const result = applySourcePatch({ content: base, path: 'game/model.ts', patch });
    expect(result.replacements).toBe(4);
    expect(result.content).toContain("import type { RivalSlot } from './rival.ts';");
    expect(result.content).toContain('rivalSchedule: RivalSlot[]');
    expect(result.content).toContain('contested: boolean');
  });

  it('applies two bare @@ hunks in one file', () => {
    const base = 'alpha\nbeta\ngamma\n';
    const patch = [
      '--- a/game.ts',
      '+++ b/game.ts',
      '@@',
      ' alpha',
      '-beta',
      '+BETA',
      ' gamma',
      '@@',
      ' gamma',
      '+delta',
      '',
    ].join('\n');
    const result = applySourcePatch({ content: base, path: 'game.ts', patch });
    expect(result.content).toBe('alpha\nBETA\ngamma\ndelta\n');
    expect(result.replacements).toBe(2);
  });

  it('refuses an empty patch', () => {
    expect(() => applySourcePatch({ content, path: 'game.ts', patch: '   ' })).toThrow(SourcePatchError);
  });

  it('refuses a path mismatch', () => {
    const patch = createPatch('other.ts', content, 'line1\nx\nline3\n');
    expect(() => applySourcePatch({ content, path: 'game.ts', patch })).toThrow(/does not match/);
  });

  it('refuses a multi-file patch', () => {
    const one = createPatch('a.ts', 'a\n', 'b\n');
    const two = createPatch('b.ts', 'c\n', 'd\n');
    expect(() => applySourcePatch({ content: 'a\n', path: 'a.ts', patch: `${one}\n${two}` })).toThrow(/touches/);
  });

  it('refuses a stale context (no fuzzy apply)', () => {
    const patch = createPatch('game.ts', content, 'line1\nline2x\nline3\n');
    expect(() => applySourcePatch({ content: 'different\n', path: 'game.ts', patch })).toThrow(/did not apply/);
  });
});

describe('applyExactReplace', () => {
  const content = 'line1\nline2\nline3\n';

  it('replaces a unique substring', () => {
    const result = applyExactReplace({
      content,
      path: 'game.ts',
      old: 'line2\n',
      new: 'line2x\n',
    });
    expect(result.content).toBe('line1\nline2x\nline3\n');
    expect(result.replacements).toBe(1);
  });

  it('refuses a missing substring', () => {
    expect(() => applyExactReplace({ content, path: 'game.ts', old: 'missing', new: 'x' })).toThrow(/not found/);
  });

  it('refuses a non-unique substring', () => {
    expect(() =>
      applyExactReplace({
        content: 'aa\naa\n',
        path: 'game.ts',
        old: 'aa\n',
        new: 'b\n',
      }),
    ).toThrow(/more than once/);
  });

  it('refuses overlapping non-unique matches', () => {
    expect(() =>
      applyExactReplace({
        content: 'aaaa',
        path: 'game.ts',
        old: 'aaa',
        new: 'b',
      }),
    ).toThrow(/more than once/);
  });
});

describe('applyMultipleExactReplaces', () => {
  const content = 'line1\nline2\nline3\nline4\n';

  it('applies sequential exact replacements to a file', () => {
    const result = applyMultipleExactReplaces({
      content,
      path: 'game.ts',
      patches: [
        { old: 'line2\n', new: 'line2_mod\n' },
        { old: 'line4\n', new: 'line4_mod\n' },
      ],
    });
    expect(result.content).toBe('line1\nline2_mod\nline3\nline4_mod\n');
    expect(result.replacements).toBe(2);
  });

  it('refuses empty patches array', () => {
    expect(() =>
      applyMultipleExactReplaces({
        content,
        path: 'game.ts',
        patches: [],
      }),
    ).toThrow(/at least one replacement/);
  });

  it('fails if any replacement in sequence is not found', () => {
    expect(() =>
      applyMultipleExactReplaces({
        content,
        path: 'game.ts',
        patches: [
          { old: 'line1\n', new: 'LINE1\n' },
          { old: 'not_existing\n', new: 'x\n' },
        ],
      }),
    ).toThrow(/not found in game.ts/);
  });
});
