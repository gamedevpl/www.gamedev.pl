import { describe, expect, it } from 'vitest';
import { assembleGameHtml, MAX_PROJECT_BYTES, ProjectTooLargeError } from './assemble.js';

function project(overrides: Partial<Parameters<typeof assembleGameHtml>[0]> = {}) {
  return { title: 'Game', description: '', html: '<canvas></canvas>', js: 'const x = 1;', css: 'body{}', ...overrides };
}

describe('the size cap', () => {
  /**
   * The number that matters is not this one on its own — it is whether it still matches
   * `MAX_BUNDLE_BYTES` in the games repo's tools/validate.ts. A game that clears Check 4
   * gets merged and published, and then has to assemble here to be playable at all. When
   * the games repo raised its cap for the touch layer and this side was left behind,
   * block-cascade and rooftop-dash went live and answered 422.
   *
   * If this fails because the games repo moved, move this to match it — do not relax the
   * assertion.
   */
  it('matches the budget the games repo enforces in Check 4', () => {
    const gamesRepoCap = 200 * 1024 + 7_501;
    expect(MAX_PROJECT_BYTES).toBe(gamesRepoCap);
  });

  it('accepts a game that fills the budget', () => {
    const filler = 'x'.repeat(MAX_PROJECT_BYTES - 100);
    expect(() => assembleGameHtml(project({ js: filler }))).not.toThrow();
  });

  it('rejects a game one byte over it', () => {
    const overBy = MAX_PROJECT_BYTES + 1 - '<canvas></canvas>'.length - 'body{}'.length;
    expect(() => assembleGameHtml(project({ js: 'x'.repeat(overBy) }))).toThrow(ProjectTooLargeError);
  });
});
