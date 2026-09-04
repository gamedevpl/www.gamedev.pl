import { describe, expect, it } from 'vitest';
import { resolveSeedStatus, seedNoticeFor, seedPayload } from './seed-status.js';
import { seedOutcomeFor } from '../platform/seed-outcome.js';

describe('seed-status', () => {
  it('prefers stored files over a stale pending flag', () => {
    expect(resolveSeedStatus({ seed: { slug: 'x', files: [], references: [] }, seedStatus: 'pending' })).toBe(
      'available',
    );
    expect(resolveSeedStatus({ seedStatus: 'pending' })).toBe('pending');
    expect(resolveSeedStatus({})).toBe('unavailable');
  });

  it('points every notice at get_sources, the one verb that reads a game', () => {
    expect(seedNoticeFor('available')).toMatch(/get_sources/);
    expect(seedNoticeFor('pending')).toMatch(/get_sources again/);
    expect(seedNoticeFor('pending')).toMatch(/still generating/i);
    expect(seedNoticeFor('unavailable')).toMatch(/npm run create.*read_kit_file/is);
    expect(seedNoticeFor('available')).not.toMatch(/get_seed/);
    expect(seedPayload({ seedStatus: 'pending' })).toMatchObject({
      seedAvailable: false,
      seedStatus: 'pending',
      seedNotice: expect.stringMatching(/still generating/i),
    });
  });

  describe('seedOutcomeFor', () => {
    const draft = { references: ['apex-sprint'], elapsedMs: 41_000, compiles: true, repaired: false };

    it('records nothing for a round that never attempted one', () => {
      expect(seedOutcomeFor({ attempt: undefined, placed: false, at: 'now' })).toBeNull();
    });

    it('records nothing when the deployment has no seeder at all', () => {
      expect(seedOutcomeFor({ attempt: { reason: 'not_configured' }, placed: false, at: 'now' })).toBeNull();
    });

    it('records a failure with its reason, so an outage is countable', () => {
      expect(
        seedOutcomeFor({ attempt: { reason: 'threw: vertex is having a day' }, placed: false, at: 'now' }),
      ).toEqual({
        at: 'now',
        generated: false,
        reason: 'threw: vertex is having a day',
        references: [],
        ms: 0,
        compiles: false,
        repaired: false,
        staged: false,
      });
    });

    it('carries the attempted provider on a failure, so an outage names its vendor', () => {
      expect(
        seedOutcomeFor({
          attempt: { reason: 'threw: anthropic is having a day', provider: 'anthropic' },
          placed: false,
          at: 'now',
        }),
      ).toMatchObject({ generated: false, provider: 'anthropic' });
    });

    it('reports placement as what happened, not as which delivery mode was picked', () => {
      expect(seedOutcomeFor({ attempt: { draft }, placed: true, at: 'now' })).toMatchObject({
        generated: true,
        staged: true,
        references: ['apex-sprint'],
      });
      expect(seedOutcomeFor({ attempt: { draft }, placed: false, at: 'now' })).toMatchObject({ staged: false });
    });
  });
});
