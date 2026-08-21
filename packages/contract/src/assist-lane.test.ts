import { describe, expect, it } from 'vitest';
import { ASSIST_LANES } from './assist-lane.js';

describe('ASSIST_LANES', () => {
  it('lists the editor-assist router outcomes', () => {
    expect(ASSIST_LANES).toEqual(['params', 'content', 'code', 'reject']);
  });
});
