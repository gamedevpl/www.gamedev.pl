import { describe, expect, it } from 'vitest';
import { resolveSeedStatus, seedNoticeFor, seedPayload } from './seed-status.js';

describe('seed-status', () => {
  it('prefers stored files over a stale pending flag', () => {
    expect(resolveSeedStatus({ seed: { slug: 'x', files: [], references: [] }, seedStatus: 'pending' })).toBe(
      'available',
    );
    expect(resolveSeedStatus({ seedStatus: 'pending' })).toBe('pending');
    expect(resolveSeedStatus({})).toBe('unavailable');
  });

  it('returns actionable notices only when the agent should act', () => {
    expect(seedNoticeFor('available')).toMatch(/get_seed/);
    expect(seedNoticeFor('pending')).toMatch(/get_seed again|still generating/i);
    expect(seedNoticeFor('unavailable')).toMatch(/no seed draft is available/i);
    expect(seedPayload({ seedStatus: 'pending' })).toMatchObject({
      seedAvailable: false,
      seedStatus: 'pending',
      seedNotice: expect.stringMatching(/still generating/i),
    });
  });
});
