// Who pays for a managed round on a game that changed hands.

import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
import { roundAuthorityCurrent, resolveGameAccess } from '../platform/game-access-resolve.js';
import { verifyAgentToken } from '../platform/agent-token.js';
import { createResumeBuild } from './resume-build.js';

const log = { error: () => {} };

function backendStub(): AgentBackend {
  return {
    name: 'managed:test',
    dispatch: async () => ({ ref: 'ref-1', workspace: undefined }),
    resume: async () => ({ ref: 'ref-1', workspace: undefined }),
    observe: async () => null,
    cancel: async () => ({ enforced: true }),
  };
}

async function transferredGame(store: InMemoryStore): Promise<number> {
  const at = new Date().toISOString();
  await store.upsertUser({ uid: 'g:ada' });
  await store.upsertUser({ uid: 'g:grace' });
  const jobId = await store.allocateJobId();
  await store.createSubmission(jobId, 'g:ada', 'Sky Dodge');
  await store.setSubmissionSlug(jobId, 'sky-dodge');
  await store.ensureGameAccess('sky-dodge', 'g:ada', at, at);
  const later = new Date(Date.now() + 1000).toISOString();
  const code = (await store.ensureRecipientCode('g:grace', later))!;
  const revision = (await store.getGameAccess('sky-dodge'))!.accessRevision;
  await store.createGameTransferInvitation('sky-dodge', 'g:ada', 'g:grace', revision, later, code);
  const invite = (await store.getActiveGameTransfer('sky-dodge', later))!;
  await store.acceptGameTransferInvitation('sky-dodge', 'g:grace', later, invite.invitationId);
  return jobId;
}

describe('managed quota on a transferred game', () => {
  it('spends the current owner allowance when no caller uid is passed', async () => {
    const store = new InMemoryStore();
    const jobId = await transferredGame(store);
    const checkAndSpend = vi.fn(async () => ({ available: true as const }));
    const backend = backendStub();

    const resumeBuild = createResumeBuild({
      store,
      submissionTokenSecret: 'secret',
      managedAvailabilityGate: { checkAndSpend },
      now: () => Date.now(),
      notifyAppBaseUrl: 'https://example.test',
      backendFor: async () => backend,
      backendByStoredName: () => backend,
      builderOf: () => 'platform',
      recordSessionCost: async () => {},
      releaseWorkspace: async () => {},
      seedFromLatestDelivery: async () => undefined,
    });

    // An acknowledged handoff has no authenticated caller to pass.
    const outcome = await resumeBuild({ jobId, feedback: 'carry on', locale: 'en', log, builder: 'platform' });

    expect(outcome.started).toBe(true);
    expect(checkAndSpend).toHaveBeenCalledTimes(1);
    expect(checkAndSpend.mock.calls[0]![0]).toBe('g:grace');
  });
});

describe('undelivered resume authority', () => {
  it.each([false, true])('remints a revoked round; transfer=%s', async (transferred) => {
    const store = new InMemoryStore();
    let jobId: number;
    if (transferred) {
      jobId = await transferredGame(store);
    } else {
      await store.upsertUser({ uid: 'g:ada' });
      jobId = await store.allocateJobId();
      await store.createSubmission(jobId, 'g:ada', 'Sky Dodge');
      await store.setSubmissionSlug(jobId, 'sky-dodge');
    }
    await store.ensureRoundGeneration(jobId);
    const before = (await store.getSubmission(jobId))!;
    const access = await resolveGameAccess(store, 'sky-dodge');
    expect(roundAuthorityCurrent(before, access)).toBe(!transferred);
    const backend = backendStub();
    const dispatch = vi.spyOn(backend, 'dispatch');
    const checkAndSpend = vi.fn(async () => ({ available: true as const }));
    const resume = createResumeBuild({
      store,
      submissionTokenSecret: 'secret',
      managedAvailabilityGate: { checkAndSpend },
      now: Date.now,
      notifyAppBaseUrl: 'https://example.test',
      backendFor: async () => backend,
      backendByStoredName: () => backend,
      builderOf: () => 'platform',
      recordSessionCost: async () => {},
      releaseWorkspace: async () => {},
      seedFromLatestDelivery: async () => undefined,
    });
    expect(await resume({ jobId, feedback: 'continue', locale: 'en', log, undelivered: true })).toEqual({
      started: true,
    });
    const after = (await store.getSubmission(jobId))!;
    expect(after.roundGeneration).toBe(before.roundGeneration! + (transferred ? 1 : 0));
    expect(roundAuthorityCurrent(after, access)).toBe(true);
    expect(checkAndSpend).not.toHaveBeenCalled();
    const brief = dispatch.mock.calls[0]![0];
    expect(verifyAgentToken(brief.channelToken, 'secret').roundGeneration).toBe(after.roundGeneration);
    expect(after.ownerUid).toBe('g:ada');
  });
});
