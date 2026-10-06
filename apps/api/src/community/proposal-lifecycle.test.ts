import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GamesStore, SourceFile, VersionManifest } from '../delivery/games-store.js';
import { GATE_VERDICT_PATH, registerGateVerdictRoutes } from '../delivery/gate-verdict-routes.js';
import { mintGateVerdictToken } from '../delivery/gate-verdict-token.js';
import { InMemoryStore } from '../platform/store.js';
import { createProposalLifecycle, settleProposalsOnPublish, sweepProposals } from './proposal-lifecycle.js';
import { acceptProposal, canProposeTo, isNotedFeedback, openProposal, reconcileProposalGate } from './proposals.js';
import { PROPOSAL_EXPIRY_MS } from './proposal-state.js';

const NOW = Date.parse('2026-09-01T12:00:00Z');
const PROPOSER = 'g:tomek';
const SECRET = 'lifecycle-test-secret';

// Manifests in a map; putGateResult writes verdicts like GCS does.
function fakeGamesStore() {
  const manifests = new Map<string, VersionManifest>();
  let counter = 0;
  const key = (slug: string, version: string) => `${slug}@${version}`;
  const store = {
    async putCandidateSources(input: {
      slug: string;
      jobId: number;
      files: SourceFile[];
      mode?: string;
      proposal?: unknown;
    }) {
      const version = `v${++counter}`;
      const manifest = {
        slug: input.slug,
        version,
        createdAt: new Date(NOW).toISOString(),
        jobId: input.jobId,
        deliveryMode: input.mode ?? 'publish',
        ...(input.proposal ? { proposal: input.proposal } : {}),
        sourceFiles: input.files.map((file) => file.path),
      } as VersionManifest;
      manifests.set(key(input.slug, version), manifest);
      return { version, manifest };
    },
    async getManifest(slug: string, version: string) {
      return manifests.get(key(slug, version)) ?? null;
    },
    async putGateResult(slug: string, version: string, result: { green: boolean }) {
      const manifest = manifests.get(key(slug, version));
      if (manifest) manifest.gate = { ...result, ranAt: new Date(NOW).toISOString() } as VersionManifest['gate'];
    },
  };
  return store as unknown as GamesStore;
}

const FILES: SourceFile[] = [{ path: 'game.ts', content: 'export const grip = 0.9;' }];

async function openOn(store: InMemoryStore, gamesStore: GamesStore, slug: string, base: 'store' | 'repo' = 'store') {
  const result = await openProposal(
    { store, gamesStore, now: () => NOW },
    {
      targetSlug: slug,
      proposerUid: PROPOSER,
      title: 'Better grip',
      description: 'Corners feel floaty at speed, so this raises the grip a little.',
      base: base === 'store' ? { kind: 'store', version: 'base-1' } : { kind: 'repo', snapshotId: 's1', sha: 'abc' },
      files: FILES,
    },
  );
  if (!result.ok) throw new Error(`open failed: ${result.error}`);
  return result.proposal;
}

describe('proposal lifecycle', () => {
  let store: InMemoryStore;
  let gamesStore: ReturnType<typeof fakeGamesStore>;
  const deps = () => ({ store, gamesStore, now: () => NOW });

  beforeEach(async () => {
    store = new InMemoryStore();
    gamesStore = fakeGamesStore();
    await store.upsertUser({ uid: PROPOSER });
    // No submission: platform-owned, open to feedback by default.
    await store.setPublication({ slug: 'orbit', state: 'published', currentVersion: 'base-1', publishedAt: 'x' });
  });

  it('advances a proposal when its gate verdict lands, with nobody polling', async () => {
    const proposal = await openOn(store, gamesStore, 'orbit');
    const app = Fastify();
    const lifecycle = createProposalLifecycle(deps());
    registerGateVerdictRoutes(app, { store: gamesStore, secret: SECRET, onVerdict: lifecycle.onVerdict });
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: GATE_VERDICT_PATH,
      headers: { authorization: `Bearer ${mintGateVerdictToken('orbit', proposal.version!, SECRET)}` },
      payload: { slug: 'orbit', version: proposal.version, kind: 'gate', result: { green: true } },
    });
    await app.close();
    expect(response.statusCode).toBe(204);
    expect((await store.getProposal(proposal.id))?.state).toBe('in_review');
  });

  it('accepts a platform proposal as noted feedback: no job, no adoption, no slot held', async () => {
    const proposal = await openOn(store, gamesStore, 'orbit');
    await gamesStore.putGateResult('orbit', proposal.version!, { green: true } as never);
    await reconcileProposalGate(deps(), proposal.id);
    const startRound = vi.fn();
    const result = await acceptProposal(
      { ...deps(), startRound },
      { id: proposal.id, byUid: 'g:admin', reviewer: 'platform' },
    );
    expect(result).toMatchObject({ ok: true, proposal: { state: 'accepted' } });
    if (!result.ok) return;
    expect(result.proposal.transitions.at(-1)).toMatchObject({ to: 'accepted', reason: 'noted', by: 'operator' });
    expect(startRound).not.toHaveBeenCalled();
    expect(result.proposal.adoptedJobId).toBeUndefined();
    expect(isNotedFeedback(result.proposal)).toBe(true);

    // A later publish of the game leaves the decision standing.
    await settleProposalsOnPublish(deps(), { slug: 'orbit', version: 'base-2' });
    expect((await store.getProposal(proposal.id))?.state).toBe('accepted');
  });

  it('treats a repo-lane proposal as feedback too', async () => {
    const proposal = await openOn(store, gamesStore, 'orbit', 'repo');
    await gamesStore.putGateResult('orbit', proposal.version!, { green: true } as never);
    await reconcileProposalGate(deps(), proposal.id);
    const startRound = vi.fn();
    const result = await acceptProposal(
      { ...deps(), startRound },
      { id: proposal.id, byUid: null, reviewer: 'platform' },
    );
    expect(result.ok).toBe(true);
    expect(startRound).not.toHaveBeenCalled();
    expect((await canProposeTo(store, 'orbit', PROPOSER)).ok).toBe(true);
  });

  it('supersedes stale live proposals on publish', async () => {
    const proposal = await openOn(store, gamesStore, 'orbit');
    const settled = await settleProposalsOnPublish(deps(), { slug: 'orbit', version: 'base-2' });
    expect(settled).toEqual({ merged: 0, superseded: 1 });
    expect((await store.getProposal(proposal.id))?.state).toBe('superseded');
  });

  it('sweeps: reconciles a verdict the push missed and expires a silent review', async () => {
    const pending = await openOn(store, gamesStore, 'orbit');
    await gamesStore.putGateResult('orbit', pending.version!, { green: true } as never);
    const stale = await openOn(store, gamesStore, 'orbit');
    const record = (await store.getProposal(stale.id))!;
    await store.putProposal({
      ...record,
      state: 'in_review',
      stateSince: new Date(NOW - PROPOSAL_EXPIRY_MS - 1).toISOString(),
    });

    const result = await sweepProposals(deps());
    expect(result).toEqual({ reconciled: 1, expired: 1 });
    expect((await store.getProposal(pending.id))?.state).toBe('in_review');
    expect((await store.getProposal(stale.id))?.state).toBe('expired');
  });
});
