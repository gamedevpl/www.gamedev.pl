import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KIT_ROOT_DIR } from '../platform/kit-registry.js';
import type { KitTree } from '../agent-surface/kit-files.js';
import { sharedSourcesFromKitTree, typecheckDeliverySources } from './typecheck-preflight.js';

const KIT_DTS = `
interface GameKitGameContext {
  draw: { circle(x: number, y: number, r: number): void };
  width: number;
  height: number;
}
declare const GameKit: { defineGame(): unknown };
`;

function kitTree(files: Record<string, string>): KitTree {
  const map = new Map<string, Buffer>();
  for (const [rel, body] of Object.entries(files)) {
    map.set(`${KIT_ROOT_DIR}/${rel}`, Buffer.from(body, 'utf8'));
  }
  return { engineRef: 'abc', sha256: 'a'.repeat(64), files: map };
}

describe('typecheck preflight', () => {
  it('extracts shared declarations from a kit tree', () => {
    const shared = sharedSourcesFromKitTree(
      kitTree({
        'shared/game-kit.d.ts': KIT_DTS,
        'shared/modules/core.ts': 'export const core = 1;\n',
        'shared/sim/box-world.ts': 'export const boxWorld = 1;\n',
        'SKILL.md': '# ignore\n',
        'shared/audio/beep.wav': 'not-text',
      }),
    );
    expect(Object.keys(shared).sort()).toEqual([
      'shared/game-kit.d.ts',
      'shared/modules/core.ts',
      'shared/sim/box-world.ts',
    ]);
  });

  it('refuses the Round-field transcript failure with one grouped line', () => {
    const result = typecheckDeliverySources({
      slug: 'comet',
      kitShared: { 'shared/game-kit.d.ts': KIT_DTS },
      sources: {
        'game/model.ts': `export type Round = { score: number };\n`,
        'game/runtime.ts': `
import type { Round } from './model.ts';
export function tick(round: Round) {
  return round.lane + round.speed + round.combo + round.heat;
}
`,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/type `Round` has no properties/);
    expect(result.message).toMatch(/`lane`/);
    expect(result.message).toMatch(/`speed`/);
    expect(result.message).toMatch(/`combo`/);
    expect(result.message).toMatch(/`heat`/);
    // One grouped finding, not four separate property lines.
    expect(result.message.split('\n').filter((l) => l.includes('has no propert')).length).toBe(1);
  });

  it('accepts a consistent multi-file delivery', () => {
    const result = typecheckDeliverySources({
      slug: 'ok-game',
      kitShared: {
        'shared/game-kit.d.ts': KIT_DTS,
        'shared/modules/core.ts': 'export function clamp(n: number): number { return n; }\n',
      },
      sources: {
        'game.ts': `import { start } from './game/runtime.ts';\nexport const g = start;\n`,
        'game/model.ts': `export type Round = { score: number };\n`,
        'game/runtime.ts': `
import type { Round } from './model.ts';
export function start(): Round { return { score: 0 }; }
`,
      },
    });
    expect(result.ok).toBe(true);
  });

  it('skips when the kit declaration is absent', () => {
    const result = typecheckDeliverySources({
      slug: 'x',
      kitShared: {},
      sources: { 'game.ts': 'export const n: number = "no";\n' },
    });
    expect(result).toMatchObject({ ok: true, skipped: 'no_kit' });
  });

  it('pluralizes a single missing property correctly', () => {
    const result = typecheckDeliverySources({
      slug: 'one',
      kitShared: { 'shared/game-kit.d.ts': KIT_DTS },
      sources: {
        'game/model.ts': 'export type Round = { score: number };\n',
        'game.ts': `
import type { Round } from './game/model.ts';
export function tick(round: Round) { return round.lane; }
`,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/has no property `lane`/);
    expect(result.message).not.toMatch(/has no properties/);
  });

  it('does not read arbitrary host filesystem paths from delivery imports', () => {
    const result = typecheckDeliverySources({
      slug: 'escape',
      kitShared: { 'shared/game-kit.d.ts': KIT_DTS },
      sources: {
        'game.ts': `import secret from '/etc/passwd';\nexport const s = secret;\n`,
      },
    });
    // Must not surface file contents; missing-module / resolve failure is fine.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).not.toMatch(/root:|daemon:|nobody:/);
  });

  it('uses kit shared modules for resolution, not only ambient dts', () => {
    const result = typecheckDeliverySources({
      slug: 'mod-game',
      kitShared: {
        'shared/game-kit.d.ts': KIT_DTS,
        'shared/modules/util.ts': 'export function twice(n: number): number { return n * 2; }\n',
      },
      sources: {
        'game.ts': `
import { twice } from '../../shared/modules/util.ts';
export const n = twice(2);
`,
      },
    });
    expect(result.ok).toBe(true);
  });
});

describe('typecheck preflight latency (measured)', () => {
  it('reports duration for a staged-sized tree against real game-kit.d.ts', () => {
    // Prefer the games-repo checkout when present; else the tiny fixture above.
    let kitDts = KIT_DTS;
    try {
      const gamesShared = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../../../www.gamedev.pl-games/shared/game-kit.d.ts',
      );
      kitDts = readFileSync(gamesShared, 'utf8');
    } catch {
      try {
        kitDts = readFileSync('/agent/repos/www.gamedev.pl-games/shared/game-kit.d.ts', 'utf8');
      } catch {
        // Fixture kit is enough for a lower-bound measurement.
      }
    }

    const model = `export type Round = {\n  score: number;\n  lane: number;\n};\n`;
    const runtime = `
import type { Round } from './model.ts';
export function tick(round: Round, kit: GameKitGameContext) {
  kit.draw.circle(round.lane, round.score, 4);
  return round.score;
}
`;
    const sources: Record<string, string> = {
      'game.ts': `import { tick } from './game/runtime.ts';\nexport { tick };\n`,
      'game/model.ts': model,
      'game/runtime.ts': runtime,
    };
    // Warm lib cache once, then measure.
    typecheckDeliverySources({
      slug: 'bench',
      kitShared: { 'shared/game-kit.d.ts': kitDts },
      sources,
    });
    const samples: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const result = typecheckDeliverySources({
        slug: 'bench',
        kitShared: { 'shared/game-kit.d.ts': kitDts },
        sources,
      });
      expect(result.ok).toBe(true);
      samples.push(result.durationMs);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)]!;
    expect(p95).toBeLessThan(10_000);
    expect(p95, `measured p95=${p95}ms`).toBeGreaterThanOrEqual(0);
  });
});
