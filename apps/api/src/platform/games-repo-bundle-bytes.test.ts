import { describe, expect, it } from 'vitest';
import { extractMaxBundleBytes, MAX_PROJECT_BYTES } from './games-repo-contract.js';

describe('extractMaxBundleBytes (raster-inclusive)', () => {
  it('evaluates MAX_BUNDLE_BYTES from the single platform ceiling', () => {
    const source = `
      const GAME_BUDGET_BYTES = 936 * 1024;
      const GAMEKIT_PLATFORM_BYTES = 410_000;
      const RASTER_ASSET_BUDGET_BYTES = 24 * 1024 * 1024;
      const MAX_BUNDLE_BYTES = GAME_BUDGET_BYTES + GAMEKIT_PLATFORM_BYTES + RASTER_ASSET_BUDGET_BYTES;
    `;
    expect(extractMaxBundleBytes(source)).toBe(MAX_PROJECT_BYTES);
  });

  it('still evaluates a + b allowance expressions when a tip uses them', () => {
    const source = `
      const GAME_BUDGET_BYTES = 936 * 1024;
      const GAMEKIT_TOUCH_BYTES = 7_501 + 5_560;
      const GAMEKIT_PLATFORM_BYTES = GAMEKIT_TOUCH_BYTES + 396_939;
      const RASTER_ASSET_BUDGET_BYTES = 24 * 1024 * 1024;
      const MAX_BUNDLE_BYTES = GAME_BUDGET_BYTES + GAMEKIT_PLATFORM_BYTES + RASTER_ASSET_BUDGET_BYTES;
    `;
    expect(extractMaxBundleBytes(source)).toBe(MAX_PROJECT_BYTES);
  });
});
