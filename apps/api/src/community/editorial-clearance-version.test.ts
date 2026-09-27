import { describe, expect, it } from 'vitest';
import { decideEditorialClearance } from './editorial-clearance.js';
import { resolveEditorialPublish } from '../creation/job-admin-publish.js';
import type { GameAssessment } from '../platform/store.js';

function keep(version: string | null): GameAssessment {
  return {
    slug: 'game',
    reviewerUid: 'reviewer',
    source: 'creator',
    verdict: 'keep',
    gameVersion: version,
    checklist: { graphics: 'ok', gameplay: 'ok', fun: 'ok', sound: 'ok', controls: 'ok' },
  } as GameAssessment;
}

describe('editorial clearance belongs to the reviewed version', () => {
  it.each(['old-version', null])('refuses stale or unversioned keep: %s', (version) => {
    expect(decideEditorialClearance([keep(version)], 'game', 'candidate').decision).toBe('pending');
  });
  it('clears the exact candidate', () => {
    expect(decideEditorialClearance([keep('candidate')], 'game', 'candidate').decision).toBe('clear');
  });
  it('passes the publication candidate into the clearance policy', async () => {
    const result = await resolveEditorialPublish({
      slug: 'game',
      version: 'candidate',
      ownerUid: 'g:owner',
      body: {},
      editorialClearance: async (slug, version) => decideEditorialClearance([keep('old-version')], slug, version),
    });
    expect(result).toMatchObject({ status: 409, body: { error: 'editorial_pending' } });
  });
});
