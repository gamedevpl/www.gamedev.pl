import { describe, expect, it } from 'vitest';
import { GATE_PROGRESS_LANES } from './gate-progress.js';

describe('GATE_PROGRESS_LANES', () => {
  it('lists the four lanes the API and web both derive', () => {
    expect(GATE_PROGRESS_LANES).toEqual(['preview', 'publish', 'health', 'proposal']);
  });
});
