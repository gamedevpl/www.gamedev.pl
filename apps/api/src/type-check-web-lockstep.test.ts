import { describe, expect, it } from 'vitest';
import { COMPILER_OPTIONS as apiOptions } from './type-check.js';

/**
 * GA-03 (creator-code-gamekit-autocomplete-plan.md in the ops repo): the browser
 * language service's compiler options (`apps/web/src/tsCompilerOptions.ts`) must
 * exactly match this file's own — divergence would let the editor suggest members
 * the server's typecheck gate then refuses, or refuse what the gate accepts.
 */
describe('the browser language service stays in lockstep with the server typecheck', () => {
  it('uses the exact same COMPILER_OPTIONS as type-check.ts', async () => {
    const { COMPILER_OPTIONS: webOptions } = await import('../../web/src/tsCompilerOptions.js');
    expect(webOptions).toEqual(apiOptions);
  });
});
