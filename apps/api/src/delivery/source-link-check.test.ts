import { describe, expect, it } from 'vitest';
import {
  collectExports,
  findUnresolvedSourceLinks,
  formatSourceLinkError,
  parseRelativeImports,
  resolveRelativeImport,
  sourceFilesToMap,
  type KitSharedLookup,
} from './source-link-check.js';

describe('source-link-check', () => {
  it('defers pinned Kit imports and still rejects missing Kit, local, and other external modules', () => {
    const kit = new Set(['shared/editor-def.ts']);
    const check = (from: string, target: string, kitShared?: KitSharedLookup) =>
      findUnresolvedSourceLinks(new Map([[from, `import { defineEditor } from '${target}';`]]), kitShared);
    expect(check('EDITOR.ts', '../../shared/editor-def.ts', kit)).toEqual([]);
    expect(check('EDITOR.ts', '../../shared/editor-def.js', kit)).toEqual([]);
    expect(check('game/editor.ts', '../../../shared/editor-def.ts', kit)).toEqual([]);
    expect(check('EDITOR.ts', '../../shared/editor-def.ts', 'defer')).toEqual([]);
    expect(check('EDITOR.ts', '../../shared/missing.ts', 'defer')).toEqual([]);
    expect(check('EDITOR.ts', '../../shared/missing.ts', kit)).toHaveLength(1);
    expect(check('EDITOR.ts', '../../shared/editor-def.ts')).toHaveLength(1);
    expect(check('EDITOR.ts', './shared/editor-def.ts', kit)).toHaveLength(1);
    expect(check('EDITOR.ts', '../../shared/../private/editor-def.ts', kit)).toHaveLength(1);
    expect(check('EDITOR.ts', '../../other-game/editor-def.ts', kit)).toHaveLength(1);
  });

  it('sees every declarator in one export statement', () => {
    const info = collectExports(
      `export const TURN = -0.2, CT = Math.cos(TURN), ST = Math.sin(TURN);\nexport const PREP_T = 60, BREAK_T = 40, WAVE_MAX = 70, COUNTER_T = 150;\n`,
    );
    for (const name of ['TURN', 'CT', 'ST', 'PREP_T', 'BREAK_T', 'WAVE_MAX', 'COUNTER_T']) {
      expect(info.named.has(name)).toBe(true);
    }
    expect(info.reexportsAll).toBe(false);
  });

  it('accepts an import of a later declarator in the same statement', () => {
    const files = sourceFilesToMap([
      { path: 'game/city.ts', content: `import { B } from './townplan.js';\nexport const used = B;\n` },
      { path: 'game/townplan.ts', content: `export const A = 1, B = 2;\n` },
    ]);
    expect(findUnresolvedSourceLinks(files)).toEqual([]);
  });

  it('collects each export form an importer can name', () => {
    const info = collectExports(`
      export { a, b as c };
      export { x } from './y.ts';
      export * as ns from './barrel.ts';
      export function spawn() {}
      export class Unit {}
      export type Round = { lane: number };
      export interface Lane { n: number }
      export enum Side { Left }
      export default class Game {}
      export const { a: renamed, b } = obj;
      const local = 1;
      export { local as publicName };
    `);
    for (const name of ['a', 'c', 'x', 'ns', 'spawn', 'Unit', 'Round', 'Lane', 'Side', 'renamed', 'b', 'publicName']) {
      expect(info.named.has(name), name).toBe(true);
    }
    expect(info.hasDefault).toBe(true);
    expect(info.reexportsAll).toBe(false);
    const star = collectExports(`export * from './other.js';`);
    expect(star.reexportsAll).toBe(true);
  });

  it('collects named exports, default, renames, and export *', () => {
    const info = collectExports(`
      export const WIN_SCORE = 10;
      export function spawnDebris() {}
      export type Round = { lane: number };
      export { localName as publicName };
      export default class Game {}
      export * from './other.js';
    `);
    expect(info.named.has('WIN_SCORE')).toBe(true);
    expect(info.named.has('spawnDebris')).toBe(true);
    expect(info.named.has('Round')).toBe(true);
    expect(info.named.has('publicName')).toBe(true);
    expect(info.hasDefault).toBe(true);
    expect(info.reexportsAll).toBe(true);
  });

  it('parses relative named and default imports; skips type and namespace', () => {
    const imports = parseRelativeImports(`
      import { WIN_SCORE, spawnDebris } from './model.js';
      import Game from './game.js';
      import type { Round } from './model.js';
      import { type Lane } from './model.js';
      import * as ns from './model.js';
      import { ok } from 'gamekit';
    `);
    expect(imports).toHaveLength(5);
    expect(imports[0]!.names.map((n) => n.imported)).toEqual(['WIN_SCORE', 'spawnDebris']);
    expect(imports[1]!.hasDefault).toBe(true);
    expect(imports[2]!.isTypeOnly).toBe(true);
    expect(imports[3]!.names).toEqual([]); // inline type binding skipped
    expect(imports[4]!.isNamespace).toBe(true);
  });

  it('resolves .js imports onto .ts delivery keys', () => {
    const files = new Map([['game/model.ts', 'export const X = 1;']]);
    expect(resolveRelativeImport('game/runtime.ts', './model.js', files)).toBe('game/model.ts');
  });

  it('flags the WIN_SCORE / spawnDebris transcript failure as one grouped message', () => {
    const files = sourceFilesToMap([
      {
        path: 'game/runtime.ts',
        content: `import { WIN_SCORE, spawnDebris } from './model.js';\nexport function tick() { return WIN_SCORE + spawnDebris(); }\n`,
      },
      {
        path: 'game/model.ts',
        content: `export type Round = { score: number };\nexport const START = 0;\n`,
      },
    ]);
    const findings = findUnresolvedSourceLinks(files);
    expect(findings.map((f) => f.symbol).sort()).toEqual(['WIN_SCORE', 'spawnDebris']);
    const msg = formatSourceLinkError(findings);
    expect(msg).toMatch(/game\/model\.ts does not export `WIN_SCORE`, `spawnDebris`/);
    expect(msg).toMatch(/imported by game\/runtime\.ts/);
    // One grouped finding, not six separate diagnostics.
    expect(msg.split('\n').length).toBeLessThanOrEqual(3);
  });

  it('accepts a valid multi-file delivery with export * and renames', () => {
    const files = sourceFilesToMap([
      {
        path: 'game.ts',
        content: `import { publicName, Helper } from './barrel.js';\nexport { publicName, Helper };\n`,
      },
      { path: 'barrel.ts', content: `export * from './lib.js';\n` },
      {
        path: 'lib.ts',
        content: `const localName = 1;\nexport { localName as publicName };\nexport class Helper {}\n`,
      },
    ]);
    // Direct rename/class import must stay clean.
    const direct = sourceFilesToMap([
      {
        path: 'game.ts',
        content: `import { publicName, Helper } from './lib.js';\nexport { publicName, Helper };\n`,
      },
      {
        path: 'lib.ts',
        content: `const localName = 1;\nexport { localName as publicName };\nexport class Helper {}\n`,
      },
    ]);
    expect(findUnresolvedSourceLinks(direct)).toEqual([]);
    expect(findUnresolvedSourceLinks(files)).toEqual([]);
  });

  it('never refuses bare / engine imports', () => {
    const files = sourceFilesToMap([
      {
        path: 'game.ts',
        content: `import { GameKit } from '@gamedevpl/game-kit';\nimport fs from 'node:fs';\nexport const g = GameKit;\n`,
      },
    ]);
    expect(findUnresolvedSourceLinks(files)).toEqual([]);
  });

  it('reports a missing target module', () => {
    const files = sourceFilesToMap([
      { path: 'game.ts', content: `import { x } from './missing.js';\nexport { x };\n` },
    ]);
    const findings = findUnresolvedSourceLinks(files);
    expect(findings).toEqual([{ from: 'game.ts', target: null, importPath: './missing.js', symbol: null }]);
    expect(formatSourceLinkError(findings)).toMatch(/missing from the delivery/);
  });

  it('caps grouped findings and reports how many were suppressed', () => {
    const entries: { path: string; content: string }[] = [];
    for (let i = 0; i < 12; i += 1) {
      entries.push({
        path: `mod${i}.ts`,
        content: `export const keep${i} = ${i};\n`,
      });
      entries.push({
        path: `use${i}.ts`,
        content: `import { missing${i} } from './mod${i}.js';\nexport const u = missing${i};\n`,
      });
    }
    const findings = findUnresolvedSourceLinks(sourceFilesToMap(entries));
    expect(findings.length).toBe(12);
    const msg = formatSourceLinkError(findings);
    expect(msg).toMatch(/\d+ more target files? suppressed/);
    expect(msg.length).toBeLessThanOrEqual(800);
    // At most 8 grouped findings appear before the footer.
    const groupLines = msg.split('\n').filter((line) => line.includes('does not export'));
    expect(groupLines.length).toBeLessThanOrEqual(8);
  });

  it('holds the binding scan budget when 30 symbols are missing from one import', () => {
    const names = Array.from({ length: 30 }, (_, i) => `sym${i}`);
    const files = sourceFilesToMap([
      {
        path: 'game.ts',
        content: `import { ${names.join(', ')} } from './model.js';\nexport const n = ${names[0]};\n`,
      },
      { path: 'model.ts', content: `export const only = 1;\n` },
    ]);
    const findings = findUnresolvedSourceLinks(files);
    expect(findings.length).toBe(30);
    const msg = formatSourceLinkError(findings);
    expect(msg).toMatch(/model\.ts does not export/);
    expect(msg.length).toBeLessThanOrEqual(800);
  });
});
