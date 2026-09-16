import { describe, expect, it } from 'vitest';
import {
  clampEffort,
  countArtifactRichness,
  countCodeLines,
  countTraceFrames,
  isGameLocPath,
  normalizeEffort,
  parseOptionalEffort,
} from './catalog-effort.js';

describe('countCodeLines', () => {
  it('skips blanks and comment-only lines', () => {
    expect(countCodeLines(['const x = 1;\n\n// note\nreturn x;\n'])).toBe(2);
  });

  it('uses the same per-line prefixes as games-repo npm run loc', () => {
    expect(countCodeLines(['const x = 1;\n/*\n inner\n*/\n'])).toBe(2);
  });
});

describe('isGameLocPath', () => {
  it('counts game.ts and game/ modules only', () => {
    expect(isGameLocPath('game.ts')).toBe(true);
    expect(isGameLocPath('game/model.ts')).toBe(true);
    expect(isGameLocPath('EDITOR.ts')).toBe(false);
    expect(isGameLocPath('TRACE.json')).toBe(false);
  });
});

describe('artifact counts', () => {
  it('reads TRACE frames from the parsed JSON object', () => {
    expect(countTraceFrames('{"formatVersion":2,"frames":840,"samples":[]}')).toBe(840);
    expect(countTraceFrames(null)).toBe(0);
  });

  it('ignores a frames fragment that is not valid JSON', () => {
    expect(countTraceFrames('not json "frames": 99')).toBe(0);
  });

  it('reads parsed.frames when the key sits past the first 2 KiB', () => {
    expect(countTraceFrames(JSON.stringify({ padding: 'x'.repeat(3000), frames: 840, samples: [1, 2, 3] }))).toBe(840);
  });

  it('sums frames, acceptance, playtest steps, and media pngs', () => {
    expect(
      countArtifactRichness({
        trace: '{"frames":10}',
        acceptance: '{"achieved":[{},{}]}',
        playtest: '{"expectProgress":["a","b","c"]}',
        mediaPngCount: 4,
      }),
    ).toBe(19);
  });
});

describe('normalizeEffort', () => {
  it('is 0..1, with the richest game at 1 when it leads every axis', () => {
    const scores = normalizeEffort(
      new Map([
        ['thin', { loc: 10, artifacts: 1, commits: 1 }],
        ['rich', { loc: 1000, artifacts: 100, commits: 50 }],
      ]),
    );
    expect(scores.get('rich')).toBe(1);
    expect(scores.get('thin')).toBeGreaterThan(0);
    expect(scores.get('thin')!).toBeLessThan(1);
  });

  it('stays 0 when every input is empty', () => {
    expect(normalizeEffort(new Map([['empty', { loc: 0, artifacts: 0, commits: 0 }]])).get('empty')).toBe(0);
  });
});

describe('parseOptionalEffort', () => {
  it('accepts 0..1 and rejects the rest', () => {
    expect(parseOptionalEffort(0.42)).toBe(0.42);
    expect(parseOptionalEffort(clampEffort(0.1234))).toBe(0.123);
    expect(parseOptionalEffort(1.2)).toBeUndefined();
    expect(parseOptionalEffort('0.5')).toBeUndefined();
  });
});
