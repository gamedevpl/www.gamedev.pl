import { describe, expect, it } from 'vitest';
import { DELIVERY_FIXED_FILES, deliveryPathRefusal } from '@gamedevpl/contract';
import { deliverablePathReason, FIXED_SOURCE_FILES } from './codeSurfacePaths.js';

describe('codeSurfacePaths against the shared delivery allowlist', () => {
  it('reads the fixed files from the contract', () => {
    expect(FIXED_SOURCE_FILES).toBe(DELIVERY_FIXED_FILES);
  });

  it('never accepts a path the upload API would refuse', () => {
    const samples = ['game.ts', 'SPEC.md', 'AGENT.json', 'game/level.ts', 'tsconfig.json', 'a.sh', 'Game.ts', 'x.md'];
    for (const path of samples) {
      if (deliverablePathReason(path) === null) expect(deliveryPathRefusal(path), path).toBeNull();
    }
  });
});
