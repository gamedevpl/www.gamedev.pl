import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import type { GamesStore, SourceFile, VersionManifest } from '../delivery/games-store.js';
import { InMemoryStore, type ProposalBase } from '../platform/store.js';
import { canProposeTo, openProposal, reconcileProposalGate, transitionProposal } from '../community/proposals.js';
import { isProposerTurn, toPublicProposalState } from '../community/proposal-state.js';
import { mintCreatorAgentKey } from './agent-creator-key.js';
import { createProposalTools } from './mcp-proposal-tools.js';

const SECRET = 'mcp-proposal-secret';
const NOW = Date.parse('2026-09-01T12:00:00Z');
const PROPOSER = 'g:tomek';
const BASE_FILES: SourceFile[] = [
  { path: 'index.html', content: '<canvas></canvas>' },
  { path: 'game.ts', content: 'export const grip = 0.5;' },
];

function fakeGamesStore() {
  const manifests = new Map<string, VersionManifest>();
  let counter = 0;
  return {
    async putCandidateSources(input: { slug: string; files: SourceFile[]; mode?: string; proposal?: unknown }) {
      const version = `v${++counter}`;
      const manifest = {
        slug: input.slug,
        version,
        deliveryMode: input.mode,
        proposal: input.proposal,
      } as VersionManifest;
      manifests.set(`${input.slug}@${version}`, manifest);
      return { version, manifest };
    },
    async getManifest(slug: string, version: string) {
      return manifests.get(`${slug}@${version}`) ?? null;
    },
    async getSourceFile(_slug: string, _version: string, path: string) {
      return BASE_FILES.find((file) => file.path === path)?.content ?? null;
    },
    green(slug: string, version: string) {
      const manifest = manifests.get(`${slug}@${version}`);
      if (manifest) manifest.gate = { green: true, ranAt: new Date(NOW).toISOString() };
    },
  };
}

async function setup(owner: 'creator' | 'platform', base: ProposalBase = { kind: 'store', version: 'base-1' }) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: PROPOSER });
  await store.ensureCreatorAgentKey(PROPOSER, new Date(NOW).toISOString());
  if (owner === 'creator') {
    await store.upsertUser({ uid: 'g:kasia' });
    const job = await store.createSubmission(1_000_001, 'g:kasia', 'Neon');
    await store.setSubmissionSlug(job.jobId, 'neon');
    await store.putContributionSettings({ slug: 'neon', mode: 'review', updatedAt: 'x' });
  }
  await store.setPublication({ slug: 'neon', state: 'published', currentVersion: 'base-1', publishedAt: 'x' });
  const gamesStore = fakeGamesStore();
  const gated: string[] = [];
  const tools = createProposalTools({
    store,
    proposals: {
      canProposeTo,
      openProposal,
      reconcileProposalGate,
      transitionProposal,
      isProposerTurn,
      toPublicProposalState,
    },
    agentTokenSecret: SECRET,
    platformConnectorSecret: undefined,
    now: () => NOW,
    missingCredentialHint: 'no key',
    gamesStore: gamesStore as unknown as GamesStore,
    resolveProposalBase: async () => ({ base, files: BASE_FILES }),
    contentChecker: undefined,
    onSourcesDelivered: (input) => {
      gated.push(`${input.version}:${input.mode}`);
    },
  });
  const key = mintCreatorAgentKey(SECRET, { creatorUid: PROPOSER, keyGeneration: 1, now: NOW });
  const ctx = { request: { log: { error: () => {} } } as unknown as FastifyRequest, sessionId: null, bearerToken: key };
  const call = async (name: string, args: Record<string, unknown>) =>
    (await tools[name].handler(args, ctx)).structuredContent as Record<string, unknown>;
  return { store, gamesStore, gated, call };
}

const OPEN_ARGS = {
  slug: 'neon',
  title: 'Better grip',
  description: 'Corners feel floaty at speed, so this raises the grip a little.',
};

describe('MCP proposal round', () => {
  it('opens a draft, submits it, and reports the gate verdict', async () => {
    const { store, gamesStore, gated, call } = await setup('creator');
    const opened = await call('open_proposal_round', OPEN_ARGS);
    expect(opened.proposalId).toEqual(expect.any(String));
    const id = opened.proposalId as string;
    expect((await store.getProposal(id))?.state).toBe('draft');

    const files = [BASE_FILES[0], { path: 'game.ts', content: 'export const grip = 0.9;' }];
    expect(await call('submit_proposal', { proposalId: id, files })).toEqual({ proposalId: id, state: 'checking' });
    const submitted = (await store.getProposal(id))!;
    expect(submitted.state).toBe('submitted');
    expect(gated).toEqual([`${submitted.version}:proposal`]);

    gamesStore.green('neon', submitted.version!);
    expect(await call('get_proposal_status', { proposalId: id })).toMatchObject({ state: 'in_review' });
  });

  it('never exports a platform game’s sources', async () => {
    const { store, call } = await setup('platform');
    const refused = await call('open_proposal_round', OPEN_ARGS);
    expect(refused).toMatchObject({ code: 'feature_unavailable' });
    expect(refused).not.toHaveProperty('files');
    expect(await store.listProposals()).toHaveLength(0);
  });

  it('never exports a repo-lane game’s sources', async () => {
    const { call } = await setup('creator', { kind: 'repo', snapshotId: 's', sha: 'abc' });
    const refused = await call('open_proposal_round', OPEN_ARGS);
    expect(refused).toMatchObject({ code: 'feature_unavailable' });
    expect(refused).not.toHaveProperty('files');
  });
});
