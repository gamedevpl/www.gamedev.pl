// Who pays for a managed round on a game that changed hands.

import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import type { AgentBackend } from '../agent-surface/agent-backend.js';
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
