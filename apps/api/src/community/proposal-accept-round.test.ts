import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceFile } from '../delivery/games-store.js';
import { contentDelivery } from '../creation/content-candidate.js';
import { bakeRemixEditorDefaults, collectEditorTextFields } from '../creation/remix-bake.js';
import { InMemoryStore } from '../platform/store.js';
import { settleProposalsOnPublish } from './proposal-lifecycle.js';
import { createProposalRoundStarter } from './proposal-round-start.js';
import { editorJson, gameFiles, memoryGamesStore } from './proposal-round-fixture.js';
import { acceptProposal, openProposal, reconcileProposalGate } from './proposals.js';

const NOW = Date.parse('2026-08-04T12:00:00Z');
const OWNER = 'g:kasia';
const PROPOSER = 'g:tomek';
const SLUG = 'dog-run';
const SEALS = { 'TRACE.json': '{}', 'PLAYTEST.json': '{}' };

type Started = { jobId: number; text: string; ownerUid?: string };

describe('accepting a creator-game proposal', () => {
  let store: InMemoryStore;
  let gamesStore: ReturnType<typeof memoryGamesStore>;
  let started: Started[];
  let gate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    store = new InMemoryStore();
    gamesStore = memoryGamesStore();
    started = [];
    gate = vi.fn();
    contentChecker = undefined;
    await store.upsertUser({ uid: OWNER, name: 'Kasia' });
    await store.upsertUser({ uid: PROPOSER, name: 'Tomek' });
    await store.createSubmission(10, OWNER, 'Dog Run');
    await store.setSubmissionSlug(10, SLUG);
    await store.recordJobTransition(10, { to: 'published', at: new Date(NOW).toISOString(), by: 'operator' });
    await store.setPublication({ slug: SLUG, state: 'published', currentVersion: 'live', publishedAt: 'x' });
    await store.putContributionSettings({ slug: SLUG, mode: 'review', updatedAt: new Date(NOW).toISOString() });
    gamesStore.put(SLUG, 'live', gameFiles(SEALS));
  });

  // Stands in for submissions' startImprovementRound: new job, then beforeDispatch.
  const startImprovementRound = vi.fn(async (input: Parameters<typeof fakeRound>[0]) => fakeRound(input));
  async function fakeRound(input: Started & { beforeDispatch?: (jobId: number) => Promise<boolean> }) {
    const jobId = await store.allocateJobId();
    await store.createSubmission(jobId, input.ownerUid ?? OWNER, 'Dog Run');
    started.push({ jobId: input.jobId, text: input.text, ownerUid: input.ownerUid });
    if (input.beforeDispatch && !(await input.beforeDispatch(jobId))) return null;
    return { route: 'job' as const, jobId };
  }

  let contentChecker: { check: ReturnType<typeof vi.fn>; checkFields: ReturnType<typeof vi.fn> } | undefined;

  function deps() {
    const startRound = createProposalRoundStarter({
      store,
      gamesStore,
      startImprovementRound: (input) => startImprovementRound(input),
      content: {
        bake: bakeRemixEditorDefaults,
        textFields: collectEditorTextFields,
        deliver: contentDelivery({ store, gamesStore, now: () => NOW, onSourcesDelivered: gate }),
      },
      ...(contentChecker ? { contentChecker } : {}),
      dailyImprovementQuota: 5,
      log: { error: () => {}, warn: () => {} },
      now: () => NOW,
    });
    return { store, gamesStore, now: () => NOW, startRound };
  }

  async function propose(files: SourceFile[]) {
    const opened = await openProposal(deps(), {
      targetSlug: SLUG,
      proposerUid: PROPOSER,
      title: 'Grippier dog',
      description: 'Corners feel floaty, so this raises the grip a little.',
      base: { kind: 'store', version: 'live' },
      files,
    });
    if (!opened.ok) throw new Error(opened.error);
    (await gamesStore.getManifest(SLUG, opened.proposal.version!))!.gate = { green: true, ranAt: 'x' };
    return (await reconcileProposalGate(deps(), opened.proposal.id))!;
  }

  const accept = (id: string) => acceptProposal(deps(), { id, byUid: OWNER, reviewer: 'creator' });

  it('opens an owner round on the live game with a summary brief, never the diff', async () => {
    const proposal = await propose(gameFiles({ ...SEALS, 'game.ts': 'export const grip = 0.82;\n' }));
    const result = await accept(proposal.id);
    expect(result).toMatchObject({ ok: true, proposal: { state: 'accepted' } });
    if (!result.ok) return;

    expect(started).toHaveLength(1);
    // Improves the live holder job; the proposer's version is never delivered.
    expect(started[0]).toMatchObject({ jobId: 10, ownerUid: OWNER });
    const round = await store.getSubmission(result.proposal.adoptedJobId!);
    expect(round?.deliveredVersion).toBeUndefined();
    expect((await gamesStore.getManifest(SLUG, proposal.version!))?.deliveryMode).toBe('proposal');

    const brief = started[0]!.text;
    expect(brief).toContain(`Accepted proposal ${proposal.id}`);
    expect(brief).toContain('Grippier dog');
    expect(brief).toContain('- game.ts (+1 −2)');
    expect(brief).toContain('get_proposal_summary');
    expect(brief).not.toContain('grip = 0.82');
    expect(gate).not.toHaveBeenCalled();
  });

  it('applies a params-only proposal as data, with no agent round', async () => {
    const dataOnly = await propose(gameFiles({ ...SEALS, 'EDITOR.json': editorJson(2) }));
    const result = await accept(dataOnly.id);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(started).toHaveLength(0);
    const job = await store.getSubmission(result.proposal.adoptedJobId!);
    expect(job).toMatchObject({ ownerUid: OWNER, state: 'submitted' });
    const version = job!.deliveredVersion!;
    expect(version).not.toBe(dataOnly.version);
    const editor = JSON.parse((await gamesStore.getSourceFile(SLUG, version, 'EDITOR.json'))!);
    expect(editor.params.dogScale.default).toBe(2);
    expect(await gamesStore.getSourceFile(SLUG, version, 'game.ts')).toBe(gameFiles()[1]!.content);
    expect(gate).toHaveBeenCalledWith({ jobId: job!.jobId, slug: SLUG, version });
  });

  it('moderates declared text a data-only proposal would ship', async () => {
    contentChecker = { check: vi.fn(), checkFields: vi.fn(async () => ({ allowed: false, category: 'hate' })) };
    const proposal = await propose(gameFiles({ ...SEALS, 'EDITOR.json': editorJson(1, 'Dog size', 'bad words') }));
    expect(await accept(proposal.id)).toMatchObject({ ok: false, status: 422, error: 'content_rejected' });
    expect(contentChecker.checkFields).toHaveBeenCalledWith(expect.arrayContaining(['bad words']));
    expect((await store.getProposal(proposal.id))?.state).toBe('in_review');
    expect(gate).not.toHaveBeenCalled();
  });

  it.each(['admission', 'active'])('stays in review while a round is %s', async (mode) => {
    const proposal = await propose(gameFiles({ ...SEALS, 'EDITOR.json': editorJson(2) }));
    if (mode === 'admission') await store.beginCheckoutRecovery(SLUG, 'held', Date.now());
    else {
      await store.createSubmission(11, OWNER, 'Dog Run');
      await store.setSubmissionSlug(11, SLUG);
      await store.recordJobTransition(11, { to: 'building', at: 'x', by: 'creator' });
    }
    expect(await accept(proposal.id)).toMatchObject({ ok: false, status: 409, error: 'round_in_progress' });
    const after = await store.getProposal(proposal.id);
    expect(after?.state).toBe('in_review');
    expect(after?.adoptedJobId).toBeUndefined();
    expect(gate).not.toHaveBeenCalled();
  });

  it('merges when the linked round publishes, and survives other publishes meanwhile', async () => {
    const proposal = await propose(gameFiles({ ...SEALS, 'game.ts': 'export const grip = 0.82;\n' }));
    const result = await accept(proposal.id);
    if (!result.ok) throw new Error(result.error);
    const jobId = result.proposal.adoptedJobId!;

    await settleProposalsOnPublish(deps(), { slug: SLUG, version: 'other', jobId: 999 });
    expect((await store.getProposal(proposal.id))?.state).toBe('accepted');

    const settled = await settleProposalsOnPublish(deps(), { slug: SLUG, version: 'rebuilt', jobId });
    expect(settled.merged).toBe(1);
    expect((await store.getProposal(proposal.id))?.state).toBe('merged');
  });
});
