import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { acknowledgeHandoff } from './builder-handoff.js';

describe('acknowledgeHandoff', () => {
  it('resumes the round for whoever requested the handoff', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(9, 'g:owner', 'Sky Dodge');
    await store.setRoundBuilder(9, 'self');
    await store.requestBuilderHandoff(9, 'platform', '2026-10-20T00:00:00.000Z', true, 'g:editor');
    const resumeBuild = vi.fn(async () => ({ started: true as const }));

    await acknowledgeHandoff(
      { jobId: 9, acknowledgedAt: '2026-10-20T00:01:00.000Z', log: { error: () => {} } },
      { store, resumeBuild: resumeBuild as never, invalidateStatusCache: () => {} },
    );

    expect(resumeBuild).toHaveBeenCalledWith(expect.objectContaining({ ownerUid: 'g:editor', builder: 'platform' }));
  });
});
