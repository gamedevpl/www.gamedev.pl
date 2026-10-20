import { describe, expect, it } from 'vitest';
import { BETA_INVITE_STATUSES, CONTRIBUTION_MODES, VOTE_VALUES, WAITLIST_STATUSES } from './community-vocab.js';

describe('community vocab', () => {
  it('lists vote values', () => {
    expect(VOTE_VALUES).toEqual(['up', 'down']);
  });

  it('lists contribution modes', () => {
    expect(CONTRIBUTION_MODES).toEqual(['off', 'review']);
  });

  it('lists waitlist statuses', () => {
    expect(WAITLIST_STATUSES).toEqual(['pending', 'approved', 'rejected']);
  });

  it('lists beta invite statuses', () => {
    expect(BETA_INVITE_STATUSES).toEqual(['available', 'claimed', 'revoked']);
  });
});
