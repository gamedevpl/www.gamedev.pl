import { describe, expect, it } from 'vitest';
import { readPublishOverride, resolveEditorialPublish, type EditorialPublishCounts } from './job-admin-publish.js';

const pending: EditorialPublishCounts = {
  decision: 'pending',
  reviewers: 0,
  keep: 0,
  cut: 0,
  skip: 0,
  weakOrBad: { graphics: 0, gameplay: 0, fun: 0, sound: 0, controls: 0 },
};

const blocked: EditorialPublishCounts = {
  decision: 'blocked',
  reviewers: 2,
  keep: 0,
  cut: 2,
  skip: 0,
  weakOrBad: { graphics: 0, gameplay: 1, fun: 0, sound: 0, controls: 0 },
};

const clear: EditorialPublishCounts = {
  decision: 'clear',
  reviewers: 1,
  keep: 1,
  cut: 0,
  skip: 0,
  weakOrBad: { graphics: 0, gameplay: 0, fun: 0, sound: 0, controls: 0 },
};

describe('readPublishOverride', () => {
  it('treats a missing body as no override', () => {
    expect(readPublishOverride(undefined)).toEqual({ override: false, reason: '' });
  });

  it('refuses an override with no written reason', () => {
    expect(readPublishOverride({ override: true })).toEqual({ error: 'reason_required' });
    expect(readPublishOverride({ override: true, overrideReason: '   ' })).toEqual({ error: 'reason_required' });
  });

  it('sanitizes and bounds an override reason before it can be stored', () => {
    expect(readPublishOverride({ override: true, overrideReason: '**still** the call' })).toEqual({
      override: true,
      reason: 'still the call',
    });
    expect(readPublishOverride({ override: true, overrideReason: 'x'.repeat(501) })).toEqual({
      error: 'reason_too_long',
    });
  });
});

describe('resolveEditorialPublish', () => {
  it('skips the check for bot-owned jobs', async () => {
    const result = await resolveEditorialPublish({
      editorialClearance: async () => pending,
      ownerUid: 'bot:e2e',
      slug: 'comet-courier',
      body: undefined,
    });
    expect(result).toEqual({ reason: 'approved' });
  });

  it('degrades to today when the policy is not wired', async () => {
    const result = await resolveEditorialPublish({
      ownerUid: 'g:creator',
      slug: 'comet-courier',
      body: undefined,
    });
    expect(result).toEqual({ reason: 'approved' });
  });

  it('records which clearance an override bypassed', async () => {
    const cut = await resolveEditorialPublish({
      editorialClearance: async () => blocked,
      ownerUid: 'g:creator',
      slug: 'comet-courier',
      body: { override: true, overrideReason: 'still the right call' },
    });
    expect(cut).toEqual({ reason: 'override:editorial_cut:still the right call' });

    const silence = await resolveEditorialPublish({
      editorialClearance: async () => pending,
      ownerUid: 'g:creator',
      slug: 'comet-courier',
      body: { override: true, overrideReason: 'reviewers are offline' },
    });
    expect(silence).toEqual({ reason: 'override:editorial_pending:reviewers are offline' });
  });

  it('does not record an override that overrode nothing', async () => {
    const result = await resolveEditorialPublish({
      editorialClearance: async () => clear,
      ownerUid: 'g:creator',
      slug: 'comet-courier',
      body: { override: true, overrideReason: 'already clear' },
    });
    expect(result).toEqual({ reason: 'approved' });
  });
});
