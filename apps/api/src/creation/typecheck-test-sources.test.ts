import { describe, expect, it } from 'vitest';
import { typecheckDeliverySources } from './typecheck-preflight.js';
import { typeCheckGame } from './type-check.js';

const kitShared = { 'shared/game-kit.d.ts': 'declare const GameKit: unknown;\n' };
const sources = {
  'game.ts': "export { score } from './game/model.ts';\n",
  'game/model.ts': 'export const score: number = 7;\n',
  'game/model.test.ts': `import test from 'node:test';
import assert from 'node:assert/strict';
import { score } from './model.ts';
test('score', () => assert.equal(score, 7));
`,
  'game/model.spec.ts': "import { describe } from 'node:test';\ndescribe('model', () => {});\n",
  'tests/helper.ts': "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n",
};

describe('test sources in the browser typecheck preflight', () => {
  it('accepts Node test roots and helpers without adding Node globals to game code', () => {
    expect(typecheckDeliverySources({ slug: 'test-game', kitShared, sources }).ok).toBe(true);
  });

  it('still reports errors in production modules delivered alongside tests', () => {
    const result = typecheckDeliverySources({
      slug: 'test-game',
      kitShared,
      sources: { ...sources, 'game/model.ts': 'export const score: number = "wrong";\n' },
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('game/model.ts') });
  });

  it('checks test files when the production game imports them', () => {
    const result = typecheckDeliverySources({
      slug: 'test-game',
      kitShared,
      sources: { ...sources, 'game.ts': "import './game/model.test.ts';\n" },
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('node:test') });
  });
});

describe('test sources in the Studio browser typecheck', () => {
  const check = (files: Record<string, string>) => typeCheckGame(files, kitShared['shared/game-kit.d.ts']);

  it('accepts Node test roots and helpers', () => {
    expect(check(sources)).toEqual({ ok: true });
  });

  it('still checks production modules delivered alongside tests', () => {
    expect(check({ ...sources, 'game/model.ts': 'export const score: number = "wrong";\n' })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.stringContaining('game/model.ts')]),
    });
  });

  it('checks test files when the production game imports them', () => {
    expect(check({ ...sources, 'game.ts': "import './game/model.test.ts';\n" })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.stringContaining('node:test')]),
    });
  });
});
