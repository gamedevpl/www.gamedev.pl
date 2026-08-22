import { describe, expect, it } from 'vitest';
import { GATE_PROGRESS_LANES, GATE_PROGRESS_STAGES } from './gate-progress.js';

describe('GATE_PROGRESS_LANES', () => {
  it('lists the four lanes the API and web both derive', () => {
    expect(GATE_PROGRESS_LANES).toEqual(['preview', 'publish', 'health', 'proposal']);
  });
});

describe('GATE_PROGRESS_STAGES', () => {
  it('lists the twelve stages a gate run reports, in order', () => {
    expect(GATE_PROGRESS_STAGES).toEqual([
      'preparing',
      'installing',
      'typecheck',
      'smoke',
      'build',
      'trace',
      'capture',
      'validate',
      'accept',
      'agent-play',
      'agency',
      'playtest',
    ]);
  });
});
