import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailMessage, Mailer } from '../notifications/mailer.js';
import { emitProposalFeedbackAlert, PROPOSAL_FEEDBACK_LINK } from '../notifications/proposal-feedback-alert.js';
import { InMemoryStore } from '../platform/store.js';
import { gameFiles, memoryGamesStore } from './proposal-round-fixture.js';
import { sweepProposals } from './proposal-lifecycle.js';
import { openProposal, reconcileProposalGate, type ProposalDeps } from './proposals.js';

const NOW = Date.parse('2026-08-04T12:00:00Z');
const PROPOSER = 'g:tomek';
const ADMINS = ['g:boss', 'g:ops'];

describe('admin alert for catalog proposals', () => {
  let store: InMemoryStore;
  let gamesStore: ReturnType<typeof memoryGamesStore>;
  let sent: EmailMessage[];

  beforeEach(async () => {
    store = new InMemoryStore();
    gamesStore = memoryGamesStore();
    sent = [];
    await store.upsertUser({ uid: PROPOSER, name: 'Tomek' });
    await store.upsertUser({ uid: 'g:boss', name: 'Boss', email: 'boss@example.test' });
    await store.upsertUser({ uid: 'g:ops', name: 'Ops' });
  });

  function deps(): ProposalDeps {
    const mailer: Mailer = { send: async (message) => void sent.push(message) } as Mailer;
    return {
      store,
      gamesStore,
      now: () => NOW,
      notifyOperators: (event) =>
        emitProposalFeedbackAlert({ store, adminUids: ADMINS, mailer, appBaseUrl: 'https://x.test' }, event),
    };
  }

  async function propose(slug: string, green: boolean) {
    const opened = await openProposal(deps(), {
      targetSlug: slug,
      proposerUid: PROPOSER,
      title: 'Faster start',
      description: 'The first level drags, so this shortens the intro.',
      base: { kind: 'repo', snapshotId: 'snap-1', sha: 'abc' },
      files: gameFiles({ 'game.ts': 'export const intro = 1;\n' }),
    });
    if (!opened.ok) throw new Error(opened.error);
    (await gamesStore.getManifest(slug, opened.proposal.version!))!.gate = { green, ranAt: 'x' };
    return opened.proposal;
  }

  const alertsFor = async (uid: string) =>
    (await store.listNotifications(uid)).filter((row) => row.type === 'operator.proposal_feedback');

  it('tells every admin once when a catalog proposal reaches review', async () => {
    const proposal = await propose('sky-dodge', true);
    expect((await reconcileProposalGate(deps(), proposal.id))?.state).toBe('in_review');

    for (const uid of ADMINS) {
      const alerts = await alertsFor(uid);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ link: PROPOSAL_FEEDBACK_LINK, params: { title: 'sky-dodge' } });
    }
    // Mail goes to admins with an address, linking to proposals.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('boss@example.test');
    expect(sent[0]?.text).toContain('https://x.test/admin/proposals');

    // Re-reconciling or sweeping must not alert twice.
    await reconcileProposalGate(deps(), proposal.id);
    await sweepProposals(deps());
    expect(await alertsFor('g:boss')).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('stays quiet on a red gate', async () => {
    const proposal = await propose('sky-dodge', false);
    expect((await reconcileProposalGate(deps(), proposal.id))?.state).toBe('needs_work');
    expect(await alertsFor('g:boss')).toHaveLength(0);
  });

  it('never alerts admins about a creator-owned game', async () => {
    await store.upsertUser({ uid: 'g:kasia', name: 'Kasia' });
    const job = await store.createSubmission(1_000_001, 'g:kasia', 'Neon Drift');
    await store.setSubmissionSlug(job.jobId, 'neon-drift');
    await store.putContributionSettings({ slug: 'neon-drift', mode: 'review', updatedAt: 'x' });
    const notifyOperators = vi.fn(async () => undefined);
    const proposal = await propose('neon-drift', true);
    await reconcileProposalGate({ ...deps(), notifyOperators }, proposal.id);
    expect(notifyOperators).not.toHaveBeenCalled();
  });

  it('keeps the proposal in review when the alert fails', async () => {
    const proposal = await propose('sky-dodge', true);
    const failing = { ...deps(), notifyOperators: async () => Promise.reject(new Error('down')) };
    expect((await reconcileProposalGate(failing, proposal.id))?.state).toBe('in_review');
  });
});
