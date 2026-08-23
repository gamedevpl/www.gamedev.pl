import { describe, expect, it } from 'vitest';
import { COMPILER_OPTIONS as apiOptions } from './creation/type-check.js';

// GA-03: divergence would let the editor suggest members the server refuses.
describe('the browser language service stays in lockstep with the server typecheck', () => {
  it('uses the exact same COMPILER_OPTIONS as type-check.ts', async () => {
    const { COMPILER_OPTIONS: webOptions } = await import('../../web/src/tsCompilerOptions.js');
    expect(webOptions).toEqual(apiOptions);
  });
});
