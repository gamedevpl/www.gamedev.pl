import { describe, expect, it } from 'vitest';
import { looksLikeCode, safeSummary, scanLiterals, screenCodeLaneOutput } from './code-lane-filter.js';

const ORIGINAL = {
  'game/runtime.ts':
    '// Enemy waves ramp slowly here so new players survive the opening minute of play.\n' +
    'import { tune } from "./tuning.ts";\n' +
    'export function startGame(speed: number): number {\n' +
    '  const label = "Ready?";\n' +
    '  return tune(speed) * 0.16 + label.length;\n' +
    '}\n',
  'game/tuning.ts':
    'export function tune(value: number): number {\n  return Math.max(0, Math.min(10, value * 1.5));\n}\n',
};

const SUMMARY = { en: 'Made the game a bit faster.', pl: 'Gra jest trochę szybsza.' };

describe('scanLiterals', () => {
  it('splits literals from code and comments', () => {
    const scanned = scanLiterals('const a = "x\\"y"; // note\nconst b = `t ${a}`;');
    expect(scanned.literals).toEqual(['x"y', 't ${a}']);
    expect(scanned.rest).toContain('// note');
    expect(scanned.rest).not.toContain('x"y');
  });
});

describe('screenCodeLaneOutput', () => {
  it('passes a legitimate edit', () => {
    const overrides = {
      'game/runtime.ts': ORIGINAL['game/runtime.ts'].replace('0.16', '0.08').replace('"Ready?"', '"Go go go!"'),
    };
    expect(screenCodeLaneOutput({ original: ORIGINAL, overrides, summary: SUMMARY })).toEqual({ ok: true });
  });

  it('refuses a literal that echoes another file', () => {
    const overrides = {
      'game/runtime.ts':
        'export function startGame(): number {\n' +
        '  const leak = `export function tune(value: number): number { return Math.max(0, Math.min(10, value * 1.5)); }`;\n' +
        '  return leak.length;\n}\n',
    };
    expect(screenCodeLaneOutput({ original: ORIGINAL, overrides })).toEqual({ ok: false, why: 'source_echo' });
  });

  it('refuses a literal that echoes an original comment', () => {
    const overrides = {
      'game/runtime.ts':
        'export function startGame(): number {\n' +
        "  const hint = 'Enemy waves ramp slowly here so new players survive the opening minute of play.';\n" +
        '  return hint.length;\n}\n',
    };
    expect(screenCodeLaneOutput({ original: ORIGINAL, overrides })).toEqual({ ok: false, why: 'source_echo' });
  });

  it('refuses a literal that echoes the kit declaration', () => {
    const kit = 'declare namespace GameKit { function spawnParticles(x: number, y: number, count: number): void; }';
    const overrides = {
      'game/runtime.ts': `export const text = "${kit.replace(/"/g, '')}";\n`,
    };
    expect(screenCodeLaneOutput({ original: ORIGINAL, overrides, kit })).toEqual({
      ok: false,
      why: 'source_echo',
    });
  });

  it('refuses a sudden wall of literal bytes', () => {
    const blob = 'abcdefghij '.repeat(300);
    const overrides = {
      'game/runtime.ts': `export const blob = "${blob}";\nexport function startGame() { return 1; }\n`,
    };
    expect(screenCodeLaneOutput({ original: ORIGINAL, overrides })).toEqual({ ok: false, why: 'literal_bloat' });
  });

  it('refuses a code-like or echoing summary', () => {
    const overrides = { 'game/runtime.ts': ORIGINAL['game/runtime.ts'].replace('0.16', '0.08') };
    const codeSummary = { en: 'export function startGame() { return 1; }', pl: 'ok' };
    expect(screenCodeLaneOutput({ original: ORIGINAL, overrides, summary: codeSummary })).toEqual({
      ok: false,
      why: 'summary',
    });
    const echo = { en: 'Enemy waves ramp slowly here so new players survive the opening minute of play.', pl: 'ok' };
    expect(screenCodeLaneOutput({ original: ORIGINAL, overrides, summary: echo })).toEqual({
      ok: false,
      why: 'summary',
    });
  });
});

describe('summary helpers', () => {
  it('reads prose as prose and code as code', () => {
    expect(looksLikeCode('Made the car yellow (#ffcc00).')).toBe(false);
    expect(looksLikeCode('const speed = 4;')).toBe(true);
    expect(looksLikeCode('use `GameKit.spawn` instead')).toBe(true);
  });

  it('drops a failure summary that looks like code', () => {
    expect(safeSummary({ en: 'x => y', pl: 'ok' })).toBeUndefined();
    expect(safeSummary(SUMMARY)).toEqual(SUMMARY);
  });
});
