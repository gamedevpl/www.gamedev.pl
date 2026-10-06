import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { GamesStore, SourceFile } from '../delivery/games-store.js';
import { InMemoryStore, type ProposalRecord } from '../platform/store.js';
import { registerProposalRoutes } from './proposal-routes.js';

const BASE: SourceFile[] = [
  { path: 'game.ts', content: '// secret tuning notes\nexport const grip = 0.5;\nexport const boost = 2;\n' },
];
const PROPOSED: SourceFile[] = [
  { path: 'game.ts', content: '// secret tuning notes\nexport const grip = 0.9;\nexport const boost = 2;\n' },
];

function record(state: ProposalRecord['state']): ProposalRecord {
  return {
    id: 'p1',
    targetSlug: 'neon',
    targetOwnerUid: 'g:owner',
    proposerUid: 'g:proposer',
    base: { kind: 'store', version: 'base-1' },
    version: 'v2',
    state,
    stateSince: 'x',
    transitions: [],
    title: 't',
    description: 'd',
    thread: [],
    createdAt: 'x',
    updatedAt: 'x',
  };
}

const gamesStore = {
  getManifest: async () => ({ sourceFiles: PROPOSED.map((file) => file.path) }),
  getSourceFile: async (_slug: string, _version: string, path: string) =>
    PROPOSED.find((file) => file.path === path)?.content ?? null,
} as unknown as GamesStore;

async function serve(store: InMemoryStore, base: SourceFile[] | null): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    const uid = request.headers['x-test-uid'];
    (request as { user?: unknown }).user = typeof uid === 'string' ? { uid, tier: 'standard' } : null;
  });
  await registerProposalRoutes(app, { store, gamesStore, resolveBase: async () => (base ? { files: base } : null) });
  await app.ready();
  return app;
}

describe('proposal diff readership', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function setup(base: SourceFile[] | null = BASE) {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    await store.upsertUser({ uid: 'g:proposer' });
    const job = await store.createSubmission(1_000_001, 'g:owner', 'Neon');
    await store.setSubmissionSlug(job.jobId, 'neon');
    await store.putProposal(record('in_review'));
    const app = await serve(store, base);
    apps.push(app);
    return app;
  }

  const diffAs = async (app: FastifyInstance, uid: string) =>
    (await app.inject({ method: 'GET', url: '/api/proposals/p1/diff', headers: { 'x-test-uid': uid } })).json()
      .diff as { files: Array<{ lines: Array<{ kind: string; text: string }> }>; additions: number; deletions: number };

  it('shows the proposer only the lines they added', async () => {
    const app = await setup();
    const diff = await diffAs(app, 'g:proposer');
    expect(diff.files[0].lines).toEqual([expect.objectContaining({ kind: 'add', text: 'export const grip = 0.9;' })]);
    expect(JSON.stringify(diff)).not.toContain('secret tuning notes');
    expect(JSON.stringify(diff)).not.toContain('0.5');
    expect(diff).toMatchObject({ additions: 1, deletions: 1 });
  });

  it('shows the owner the full diff', async () => {
    const app = await setup();
    const diff = await diffAs(app, 'g:owner');
    const kinds = diff.files[0].lines.map((line) => line.kind);
    expect(kinds).toEqual(expect.arrayContaining(['context', 'del', 'add']));
  });

  it('shows the proposer nothing when the base cannot be read', async () => {
    const app = await setup(null);
    expect(await diffAs(app, 'g:proposer')).toEqual({ files: [], additions: 0, deletions: 0, omittedFiles: 0 });
  });
});
