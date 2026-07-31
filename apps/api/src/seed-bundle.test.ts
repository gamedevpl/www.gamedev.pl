import { describe, expect, it } from 'vitest';
import { checkSeedBundles } from './seed-bundle.js';

/**
 * Real esbuild, no stubs: the whole value of this check is that it agrees with the play
 * path's bundler, and a stubbed bundler would test the agreement of nothing with nothing.
 */
describe('checkSeedBundles', () => {
  const GOOD = [
    { path: 'game.ts', content: "import { startGame } from './game/runtime.ts';\nstartGame();\n" },
    {
      path: 'game/runtime.ts',
      content: "import { SPEED } from './model.ts';\nexport function startGame() {\n  return SPEED;\n}\n",
    },
    { path: 'game/model.ts', content: 'export const SPEED = 3;\n' },
  ];

  it('accepts a draft whose modules resolve and parse', async () => {
    expect(await checkSeedBundles('my-game', GOOD)).toEqual({ ok: true });
  });

  it('accepts type errors — esbuild transpiles, and a preview does not typecheck', async () => {
    // The Step-1 puzzle draft failed the gate on exactly this shape (a bad property on a
    // typed object) yet would have played fine. The check must not be stricter than the
    // serve path it predicts.
    const files = [
      {
        path: 'game.ts',
        content: 'const style: { width: number } = { width: 1, lineCap: "round" } as never;\nstyle;\n',
      },
    ];
    expect(await checkSeedBundles('my-game', files)).toEqual({ ok: true });
  });

  it('reports a syntax error with its file and line', async () => {
    const files = [
      { path: 'game.ts', content: "import { startGame } from './game/runtime.ts';\nstartGame();\n" },
      { path: 'game/runtime.ts', content: 'export function startGame() {\n  const = broken;\n}\n' },
    ];

    const result = await checkSeedBundles('my-game', files);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('game/runtime.ts');
      expect(result.errors[0]).toMatch(/:2:/);
    }
  });

  it('reports a module the draft imports but never wrote', async () => {
    // The most common flash failure shape: an import of a file that exists only in the
    // model's imagination. The message names the missing path so the repair round can
    // either write it or drop the import.
    const files = [{ path: 'game.ts', content: "import { paint } from './game/render.ts';\npaint();\n" }];

    const result = await checkSeedBundles('my-game', files);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('game/render.ts');
  });

  it('refuses bare package imports — games have no runtime dependencies', async () => {
    const files = [{ path: 'game.ts', content: "import _ from 'lodash';\n_;\n" }];

    const result = await checkSeedBundles('my-game', files);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('forbidden');
  });

  it('fails without an entry point instead of throwing', async () => {
    expect(await checkSeedBundles('my-game', [{ path: 'SPEC.md', content: '# spec\n' }])).toEqual({
      ok: false,
      errors: ['game.ts is missing'],
    });
  });
});
