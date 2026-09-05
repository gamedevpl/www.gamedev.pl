import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentBackend, BuildBrief, SeedFiles } from './agent-surface/agent-backend.js';
import { mintAgentToken, STALE_AGENT_TOKEN_REASON } from './platform/agent-token.js';
import { buildApp } from './platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './platform/auth.js';
import type { GamesStore } from './delivery/games-store.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './catalog/github-client.js';
import { InMemoryStore } from './platform/store.js';
import { mintToken } from './platform/submission-token.js';

const secret = 'self-build-test-secret';
const sessionSecret = 'dev-session-secret-change-me';
const CONCEPT = 'A squad tactics game about clearing rooms with careful timing and cover.';

function stubGitHub(): GitHubClient {
  return {
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    ensureOpenPullRequest: async () => ({ number: 1 }),
    deleteBranch: async () => {},
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
  };
}

function platformStub() {
  const briefs: BuildBrief[] = [];
  const canceledRefs: string[] = [];
  const backend: AgentBackend = {
    name: 'copilot',
    dispatch: async (brief) => {
      briefs.push(brief);
      return { ref: `copilot-${briefs.length}`, workspace: `copilot/branch-${briefs.length}` };
    },
    resume: async (brief) => {
      briefs.push(brief);
      return { ref: `copilot-r-${briefs.length}`, workspace: `copilot/branch-r-${briefs.length}` };
    },
    observe: async () => null,
    cancel: async (ref) => {
      canceledRefs.push(ref);
      return { enforced: false };
    },
  };
  return { backend, briefs, canceledRefs };
}

// index.html is refused — GAME.json.howToPlay supplies markup instead.
const MINIMAL_FILES = [
  { path: 'SPEC.md', content: '---\ntitle: Self Built\n---\n' },
  { path: 'game.ts', content: 'export {};' },
  { path: 'TRACE.json', content: '{"samples":[]}' },
  { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
  { path: 'AGENT.json', content: '{"policy":"capture"}' },
  {
    path: 'GAME.json',
    content: JSON.stringify({
      engine: { modules: [] },
      howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
    }),
  },
];

function stubGamesStore(options?: {
  /** When set, getManifest reports this gate verdict for every stored version. */
  gateGreen?: boolean;
}) {
  const stored: Array<{
    slug: string;
    jobId: number;
    backend?: string;
    kitEngineRef?: string;
    mode?: 'preview' | 'publish';
    files: unknown[];
  }> = [];
  const versions = new Map<
    string,
    {
      files: typeof MINIMAL_FILES;
      backend?: string;
      kitEngineRef?: string;
      deliveryMode?: 'preview' | 'publish';
    }
  >();
  const derived = new Map<string, Buffer>();
  const gamesStore = {
    putCandidateSources: async (input: {
      slug: string;
      jobId: number;
      files: typeof MINIMAL_FILES;
      backend?: string;
      kitEngineRef?: string;
      mode?: 'preview' | 'publish';
    }) => {
      stored.push(input);
      const version = `v${stored.length}`;
      versions.set(`${input.slug}:${version}`, {
        files: input.files,
        backend: input.backend,
        kitEngineRef: input.kitEngineRef,
        deliveryMode: input.mode === 'preview' ? 'preview' : 'publish',
      });
      return {
        version,
        manifest: {
          slug: input.slug,
          version,
          createdAt: new Date().toISOString(),
          jobId: input.jobId,
          backend: input.backend,
          kitEngineRef: input.kitEngineRef,
          deliveryMode: input.mode === 'preview' ? 'preview' : 'publish',
          sourceFiles: input.files.map((f) => f.path),
        },
      };
    },
    getManifest: async (slug: string, version: string) => {
      const hit = versions.get(`${slug}:${version}`);
      if (!hit) return null;
      return {
        slug,
        version,
        createdAt: new Date().toISOString(),
        jobId: 0,
        backend: hit.backend,
        kitEngineRef: hit.kitEngineRef,
        deliveryMode: hit.deliveryMode,
        sourceFiles: hit.files.map((f) => f.path),
        ...(options?.gateGreen !== undefined
          ? { gate: { green: options.gateGreen, ranAt: new Date().toISOString() } }
          : {}),
      };
    },
    getSourceFile: async (slug: string, version: string, path: string) => {
      const hit = versions.get(`${slug}:${version}`);
      return hit?.files.find((f) => f.path === path)?.content ?? null;
    },
    putGateResult: async () => {},
    putHealthResult: async () => {},
    putDerivedArtifact: async (slug: string, version: string, name: string, body: Buffer) => {
      derived.set(`${slug}:${version}:${name}`, body);
    },
    getDerivedArtifact: async (slug: string, version: string, name: string) =>
      derived.get(`${slug}:${version}:${name}`) ?? null,
    getKitRegistry: async () => null,
  } as unknown as GamesStore;
  return { gamesStore, stored, derived };
}

const KIT_REF = 'abcdef1234567890';

async function createApp(options: {
  platform?: AgentBackend;
  gameSeeder?: {
    seed: (input: { slug: string; title: string; spec: string }) => Promise<
      SeedFiles & {
        compiles: boolean;
        usage: { model: string; inputTokens: number; outputTokens: number };
        elapsedMs: number;
      }
    >;
  };
  gamesStore?: GamesStore;
  now?: () => number;
  internalAuthVerifier?: { verify: (header: string | undefined) => Promise<boolean> };
}) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:creator', email: 'c@example.com', betaStatus: 'approved' });
  const app = await buildApp({
    store,
    sessionSecret,
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh',
      submissionTokenSecret: secret,
      now: options.now,
      internalAuthVerifier: options.internalAuthVerifier,
      ...(options.platform ? { agentBackend: options.platform } : {}),
      ...(options.gameSeeder ? { gameSeeder: options.gameSeeder } : {}),
      ...(options.gamesStore ? { agentChannel: { gamesStore: options.gamesStore } } : {}),
    },
  });
  return { app, store };
}

function authHeaders(uid = 'g:creator') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function agentHeaders(jobId: number, roundGeneration = 1) {
  return {
    authorization: `Bearer ${mintAgentToken(jobId, secret, { roundGeneration })}`,
  };
}

describe('self builder (BY-02)', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
    delete process.env.SELF_BUILD_DELIVERY_CAP;
    delete process.env.SELF_BUILD_CONNECT_DAYS;
  });

  it('routes self vs platform per round and leaves Copilot path unchanged for platform', async () => {
    const { backend, briefs } = platformStub();
    const created = await createApp({ platform: backend });
    app = created.app;
    const { store } = created;

    const platformSubmit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Platform Game', concept: CONCEPT, builder: 'platform' },
    });
    expect(platformSubmit.statusCode).toBe(200);
    // Background dispatch — wait briefly for the voided promise.
    await vi.waitFor(async () => {
      const records = await store.listSubmissionsByOwner('g:creator');
      expect(records[0]?.dispatch?.backend).toBe('copilot');
    });
    expect(briefs).toHaveLength(1);
    expect(briefs[0]?.seed).toBeUndefined();

    const selfSubmit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Self Game', concept: CONCEPT, builder: 'self' },
    });
    expect(selfSubmit.statusCode).toBe(200);
    await vi.waitFor(async () => {
      const records = await store.listSubmissionsByOwner('g:creator');
      const selfJob = records.find((r) => r.title === 'Self Game');
      expect(selfJob?.builder).toBe('self');
      expect(selfJob?.defaultBuilder).toBe('self');
      expect(selfJob?.dispatch?.backend).toBe('self');
      expect(selfJob?.dispatch?.refs.at(-1)).toMatch(/^self:\d+$/);
    });
    // Platform stub was not called again for the self round.
    expect(briefs).toHaveLength(1);
  });

  it('stores a generated seed on the job for self rounds (no seed branch)', async () => {
    const seedFiles: SeedFiles = {
      slug: 'seeded-self',
      files: [{ path: 'SPEC.md', content: '# Seed\n' }],
      references: ['ref-a'],
    };
    const gameSeeder = {
      seed: async () => ({
        ...seedFiles,
        compiles: true,
        elapsedMs: 1,
        usage: { model: 'test-model', inputTokens: 1, outputTokens: 1 },
      }),
    };
    const created = await createApp({ gameSeeder });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Seeded Self', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);

    await vi.waitFor(async () => {
      const record = (await store.listSubmissionsByOwner('g:creator'))[0];
      expect(record?.seed?.files).toEqual(seedFiles.files);
      expect(record?.dispatch?.seedWorkspace).toBeUndefined();
      expect(record?.dispatch?.refs?.[0]).toMatch(/^self:/);
    });
  });

  it('walks queued→building→submitted on channel signals for a self round', async () => {
    const { gamesStore, stored } = stubGamesStore();
    const created = await createApp({ gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Walk State', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const slug = submit.json().slug as string;

    let jobId = 0;
    await vi.waitFor(async () => {
      const record = (await store.listSubmissionsByOwner('g:creator'))[0];
      expect(record?.state).toBe('dispatched');
      jobId = record!.jobId;
    });

    const statusWaiting = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(jobId, secret)}`,
    });
    expect(statusWaiting.json().stall).toBe('no_agent_yet');
    // Studio defaults from these — not localStorage alone (Codex P2 on BY-07).
    expect(statusWaiting.json()).toMatchObject({ builder: 'self', defaultBuilder: 'self' });

    const progress = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(jobId),
      payload: { text: 'Scaffolding the loop.' },
    });
    expect(progress.statusCode).toBe(200);
    expect((await store.getSubmission(jobId))?.state).toBe('building');

    const delivery = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    expect(delivery.json()).toMatchObject({ accepted: true });
    expect((await store.getSubmission(jobId))?.state).toBe('submitted');
    expect(stored[0]?.backend).toBe('self');
  });

  it('re-delivers from the latest candidate without re-uploading the tree', async () => {
    const { gamesStore, stored } = stubGamesStore();
    const created = await createApp({ gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Reuse Delivery', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const slug = submit.json().slug as string;
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
    });

    const first = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF, mode: 'preview' },
    });
    expect(first.json()).toMatchObject({ accepted: true });
    expect(stored).toHaveLength(1);

    const nextKit = 'fedcba0987654321';
    const reused = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: {
        slug,
        fromLatestDelivery: true,
        kitEngineRef: nextKit,
        mode: 'preview',
        files: [{ path: 'SPEC.md', content: '# Patched only\n' }],
      },
    });
    expect(reused.statusCode).toBe(200);
    expect(reused.json()).toMatchObject({ accepted: true, mode: 'preview' });
    expect(stored).toHaveLength(2);
    expect(stored[1]?.kitEngineRef).toBe(nextKit);
    expect(stored[1]?.mode).toBe('preview');
    const secondFiles = stored[1]?.files as Array<{ path: string; content: string }>;
    expect(secondFiles.find((f) => f.path === 'SPEC.md')?.content).toBe('# Patched only\n');
    expect(secondFiles.find((f) => f.path === 'game.ts')?.content).toBe(
      MINIMAL_FILES.find((f) => f.path === 'game.ts')!.content,
    );
  });

  it('fromLatestDelivery without mode reuses the previous candidate lane', async () => {
    const { gamesStore, stored } = stubGamesStore();
    const created = await createApp({ gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Infer Preview Lane', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const slug = submit.json().slug as string;
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
    });

    // Preview candidates may omit TRACE/PLAYTEST — kit_outdated recovery must not
    // silently flip to publish and 400 on those seals.
    const previewOnly = MINIMAL_FILES.filter((f) => f.path !== 'TRACE.json' && f.path !== 'PLAYTEST.json');
    const first = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: previewOnly, kitEngineRef: KIT_REF, mode: 'preview' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ accepted: true, mode: 'preview' });

    const reused = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: {
        slug,
        fromLatestDelivery: true,
        kitEngineRef: 'fedcba0987654321',
        // mode omitted on purpose — must stay preview
      },
    });
    expect(reused.statusCode).toBe(200);
    expect(reused.json()).toMatchObject({ accepted: true, mode: 'preview' });
    expect(stored[1]?.mode).toBe('preview');
  });

  it('rejects a self-build delivery that omits kitEngineRef', async () => {
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Need Kit Ref', concept: CONCEPT, builder: 'self' },
    });
    const slug = submit.json().slug as string;
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
    });

    const refused = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ reason: 'kit_engine_ref_required' });
    expect(refused.json().error).toMatch(/kitEngineRef/i);
  });

  it('rejects a delivery built against an engine this round is not pinned to', async () => {
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Pinned Kit', concept: CONCEPT, builder: 'self' },
    });
    const slug = submit.json().slug as string;
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
    });
    const pinned = 'a'.repeat(40);
    await store.pinRoundKitEngineRef(jobId, pinned);

    const refused = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: 'b'.repeat(40) },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ reason: 'kit_engine_ref_mismatch' });
    expect(refused.json().error).toContain(pinned);

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: pinned },
    });
    expect(accepted.statusCode).toBe(200);
  });

  it('enforces SELF_BUILD_DELIVERY_CAP with a machine-readable refusal', async () => {
    process.env.SELF_BUILD_DELIVERY_CAP = '2';
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Cap Game', concept: CONCEPT, builder: 'self' },
    });
    const slug = submit.json().slug as string;
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
      expect((await store.getSubmission(jobId))?.builder).toBe('self');
    });

    for (let i = 0; i < 2; i += 1) {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(jobId),
        payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
      });
      expect(ok.json().accepted).toBe(true);
    }
    const refused = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    expect(refused.json()).toMatchObject({
      accepted: false,
      rejected: 'delivery_cap',
      reason: 'self_build_delivery_cap',
      deliveryCap: 2,
      deliveriesUsed: 2,
    });
  });

  it('keeps the job-lifetime delivery cap across a round reopen', async () => {
    // Reopening is cheap; the job cap bounds gate builds per game.
    process.env.SELF_BUILD_DELIVERY_CAP = '2';
    process.env.SELF_BUILD_JOB_DELIVERY_CAP = '3';
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Reopen Game', concept: CONCEPT, builder: 'self' },
    });
    const slug = submit.json().slug as string;
    let issueNumber = 0;
    await vi.waitFor(async () => {
      issueNumber = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
      expect((await store.getSubmission(issueNumber))?.builder).toBe('self');
    });

    const deliver = (roundGeneration = 1) =>
      app.inject({
        method: 'POST',
        url: '/api/agent/build/sources',
        headers: agentHeaders(issueNumber, roundGeneration),
        payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
      });

    expect((await deliver()).json().accepted).toBe(true);
    expect((await deliver()).json().accepted).toBe(true);

    // A reopen clears the round budget.
    const generation = (await store.bumpRoundGeneration(issueNumber))!;
    expect((await store.getSubmission(issueNumber))?.roundDeliveryCount).toBe(0);
    expect((await store.getSubmission(issueNumber))?.jobDeliveryCount).toBe(2);

    expect((await deliver(generation)).json().accepted).toBe(true);
    const refused = await deliver(generation);
    expect(refused.json()).toMatchObject({
      accepted: false,
      rejected: 'job_delivery_cap',
      deliveryCap: 3,
      deliveriesUsed: 3,
    });
  });

  it('auto-abandons a self round with no agent connect after SELF_BUILD_CONNECT_DAYS', async () => {
    process.env.SELF_BUILD_CONNECT_DAYS = '14';
    const opened = Date.parse('2026-07-01T00:00:00Z');
    let clock = opened;
    const created = await createApp({
      now: () => clock,
      internalAuthVerifier: { verify: async () => true },
    });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'No Connect', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    let jobId = 0;
    await vi.waitFor(async () => {
      const record = (await store.listSubmissionsByOwner('g:creator'))[0];
      expect(record?.state).toBe('dispatched');
      jobId = record!.jobId;
    });

    clock = opened + 15 * 24 * 60 * 60 * 1000;
    const sweep = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: 'Bearer internal' },
    });
    expect(sweep.statusCode).toBe(200);
    const abandoned = await store.getSubmission(jobId);
    expect(abandoned?.state).toBe('abandoned');
    expect(abandoned?.abandonedAt).toBeTruthy();
    expect(abandoned?.transitions?.at(-1)?.reason).toBe('no_connect');
  });

  it('switches builder both directions only at a round boundary', async () => {
    const { backend, briefs } = platformStub();
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ platform: backend, gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Switch Game', concept: CONCEPT, builder: 'self' },
    });
    const slug = submit.json().slug as string;
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
    });

    // A live self agent still owns the round. The explicit handoff route below covers
    // the separate no-agent-yet escape hatch.
    await store.touchLastAgentSignalAt(jobId);
    const mid = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/feedback`,
      headers: authHeaders(),
      payload: { feedback: 'Please switch builders now please.', builder: 'platform' },
    });
    expect(mid.statusCode).toBe(409);
    expect(mid.json()).toMatchObject({ error: 'builder_locked', reason: 'active_round', builder: 'self' });

    // Deliver + close the round via gate-green transition so a new round can choose.
    await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    await store.recordJobTransition(jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });
    // ready_for_review closes the round; bounce to needs_changes (reject) to open feedback.
    await store.recordJobTransition(jobId, {
      to: 'needs_changes',
      at: new Date().toISOString(),
      by: 'operator',
      reason: 'rejected',
    });

    const switchToPlatform = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/feedback`,
      headers: authHeaders(),
      payload: {
        feedback: 'Please have the platform team finish this game carefully.',
        builder: 'platform',
      },
    });
    expect(switchToPlatform.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs.length).toBeGreaterThan(0));
    const afterPlatform = await store.getSubmission(jobId);
    expect(afterPlatform?.builder).toBe('platform');
    expect(afterPlatform?.defaultBuilder).toBe('platform');
    expect(afterPlatform?.dispatch?.backend).toBe('copilot');
    // self→platform carries latest candidate sources as brief.seed.
    expect(briefs.at(-1)?.seed?.files.some((f) => f.path === 'SPEC.md')).toBe(true);

    await store.recordJobTransition(jobId, {
      to: 'needs_changes',
      at: new Date().toISOString(),
      by: 'operator',
      reason: 'rejected',
    });
    const switchToSelf = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/feedback`,
      headers: authHeaders(),
      payload: {
        feedback: 'I will finish this myself with my own agent now.',
        builder: 'self',
      },
    });
    expect(switchToSelf.statusCode).toBe(200);
    await vi.waitFor(async () => {
      const record = await store.getSubmission(jobId);
      expect(record?.builder).toBe('self');
      expect(record?.dispatch?.backend).toBe('self');
    });
  });

  it('hands a self round off to platform via /handoff once it reaches ready_for_review', async () => {
    // ready_for_review already closed the round — no live writer to interrupt.
    const { backend, briefs } = platformStub();
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ platform: backend, gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Ready For Review Handoff', concept: CONCEPT, builder: 'self' },
    });
    const slug = submit.json().slug as string;
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
    });

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    await store.recordJobTransition(jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });
    const generationBefore = (await store.getSubmission(jobId))?.roundGeneration ?? 1;

    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/handoff`,
      headers: authHeaders(),
      payload: { builder: 'platform' },
    });

    expect(handoff.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs.length).toBeGreaterThan(0));
    const afterHandoff = await store.getSubmission(jobId);
    expect(afterHandoff?.builder).toBe('platform');
    expect(afterHandoff?.dispatch?.backend).toBe('copilot');
    expect(afterHandoff?.roundGeneration).toBeGreaterThan(generationBefore);
  });

  it('hands a self round with no agent yet to the platform agent without feedback', async () => {
    const { backend, briefs } = platformStub();
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ platform: backend, gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'No Agent Handoff', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
      expect((await store.getSubmission(jobId))?.state).toBe('dispatched');
    });

    const generationBefore = (await store.getSubmission(jobId))?.roundGeneration ?? 1;
    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/handoff`,
      headers: authHeaders(),
    });

    expect(handoff.statusCode).toBe(200);
    await vi.waitFor(async () => {
      const record = await store.getSubmission(jobId);
      expect(record?.builder).toBe('platform');
      expect(record?.dispatch?.backend).toBe('copilot');
      expect(record?.roundGeneration).toBeGreaterThan(generationBefore);
    });
    expect(await store.listPendingCreatorMessages(jobId)).toEqual([]);
    expect(briefs.at(-1)?.spec).toBe(CONCEPT);
  });

  it('hands a live self round to platform only after an explicit creator stop', async () => {
    const { backend, briefs } = platformStub();
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ platform: backend, gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Active Handoff', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
      expect((await store.getSubmission(jobId))?.state).toBe('dispatched');
    });
    await store.touchLastAgentSignalAt(jobId, new Date().toISOString());

    const token = mintToken(jobId, secret);
    const refusedWithoutConfirmation = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/handoff`,
      headers: authHeaders(),
    });
    expect(refusedWithoutConfirmation.statusCode).toBe(409);

    const generationBefore = (await store.getSubmission(jobId))?.roundGeneration ?? 1;
    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/handoff`,
      headers: authHeaders(),
      payload: { stopActiveSelfAgent: true },
    });
    expect(handoff.statusCode).toBe(202);
    expect(handoff.json()).toMatchObject({ pending: true, target: 'platform' });
    expect((await store.getSubmission(jobId))?.builder).toBe('self');
    expect((await store.getSubmission(jobId))?.builderHandoff?.to).toBe('platform');
    const acknowledged = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(jobId, generationBefore),
    });
    expect(acknowledged.statusCode).toBe(200);
    expect(acknowledged.json()).toMatchObject({ accepted: true, handoffAcknowledged: true });
    await vi.waitFor(async () => {
      const record = await store.getSubmission(jobId);
      expect(record?.builder).toBe('platform');
      expect(record?.dispatch?.backend).toBe('copilot');
      expect(record?.roundGeneration).toBeGreaterThan(generationBefore);
    });
    expect(briefs.at(-1)?.spec).toBe(CONCEPT);
    const staleReport = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(jobId, generationBefore),
      payload: { text: 'The stopped self agent must not keep writing.' },
    });
    expect(staleReport.statusCode).toBe(401);
    expect(staleReport.json().error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('resumes a pending handoff itself when the gate closes the round before the agent acks', async () => {
    // Gate-green can close the round before the agent ever acks the pending handoff.
    const { backend, briefs } = platformStub();
    const gamesStore = {
      getManifest: async (_slug: string, version: string) =>
        version === 'v1'
          ? {
              slug: 'gate-closes-handoff',
              version,
              createdAt: new Date().toISOString(),
              jobId: 0,
              roundGeneration: 1,
              sourceFiles: [],
              gate: { green: true, ranAt: new Date().toISOString() },
            }
          : null,
    } as unknown as GamesStore;
    const created = await createApp({ platform: backend, gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Gate Closes Handoff', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
      expect((await store.getSubmission(jobId))?.state).toBe('dispatched');
    });
    await store.touchLastAgentSignalAt(jobId, new Date().toISOString());
    await store.setSubmissionSlug(jobId, 'gate-closes-handoff');
    await store.setSubmissionDeliveredVersion(jobId, 'v1');
    await store.recordJobTransition(jobId, {
      to: 'submitted',
      at: new Date().toISOString(),
      by: 'agent',
      reason: 'sources_delivered',
    });

    const token = mintToken(jobId, secret);
    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/handoff`,
      headers: authHeaders(),
      payload: { stopActiveSelfAgent: true },
    });
    expect(handoff.statusCode).toBe(202);
    expect((await store.getSubmission(jobId))?.builderHandoff?.awaitsAgentAck).toBe(true);

    // Gate goes green before the (now-stopping) self agent ever calls `end`.
    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: authHeaders(),
    });
    expect(status.statusCode).toBe(200);

    // Resume dispatches a fresh round (state moves past ready_for_review again).
    await vi.waitFor(async () => {
      const record = await store.getSubmission(jobId);
      expect(record?.builder).toBe('platform');
      expect(record?.dispatch?.backend).toBe('copilot');
      expect(record?.builderHandoff).toBeUndefined();
      expect(record?.transitions?.some((t) => t.to === 'ready_for_review')).toBe(true);
    });
    expect(briefs.at(-1)?.spec).toBe(CONCEPT);
  });

  it('refuses a ready_for_review handoff if the round starts publishing mid-request', async () => {
    // A stale snapshot must not dispatch a replacement agent onto a publishing job.
    const { backend, briefs } = platformStub();
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ platform: backend, gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Race To Publish', concept: CONCEPT, builder: 'self' },
    });
    const slug = submit.json().slug as string;
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
    });
    await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    await store.recordJobTransition(jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });

    // Simulate an operator approval landing between the read and the recheck.
    const originalGetSubmission = store.getSubmission.bind(store);
    let reads = 0;
    store.getSubmission = async (num: number) => {
      reads += 1;
      const record = await originalGetSubmission(num);
      if (reads === 1) {
        await store.recordJobTransition(num, {
          to: 'publishing',
          at: new Date().toISOString(),
          by: 'operator',
          reason: 'approved',
        });
      }
      return record;
    };

    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/handoff`,
      headers: authHeaders(),
      payload: { builder: 'platform' },
    });

    expect(handoff.statusCode).toBe(409);
    expect(handoff.json()).toMatchObject({ error: 'builder_locked' });
    expect(briefs).toHaveLength(0);
    const record = await originalGetSubmission(jobId);
    expect(record?.state).toBe('publishing');
    expect(record?.builder).toBe('self');
  });

  it('hands a live platform round to the self agent only after an explicit creator stop', async () => {
    const { backend, briefs, canceledRefs } = platformStub();
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ platform: backend, gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Platform Handoff', concept: CONCEPT, builder: 'platform' },
    });
    expect(submit.statusCode).toBe(200);
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
      expect((await store.getSubmission(jobId))?.state).toBe('dispatched');
    });
    await store.touchLastAgentSignalAt(jobId, new Date().toISOString());

    const token = mintToken(jobId, secret);
    const generationBefore = (await store.getSubmission(jobId))?.roundGeneration ?? 1;
    const refusedWithoutConfirmation = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/handoff`,
      headers: authHeaders(),
      payload: { builder: 'self' },
    });
    expect(refusedWithoutConfirmation.statusCode).toBe(409);

    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/handoff`,
      headers: authHeaders(),
      payload: { builder: 'self', stopActivePlatformAgent: true },
    });
    expect(handoff.statusCode).toBe(202);
    expect(handoff.json()).toMatchObject({ pending: true, target: 'self' });
    expect((await store.getSubmission(jobId))?.builder).toBe('platform');
    expect((await store.getSubmission(jobId))?.builderHandoff?.to).toBe('self');
    const acknowledged = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(jobId, generationBefore),
    });
    expect(acknowledged.statusCode).toBe(200);
    expect(acknowledged.json()).toMatchObject({ accepted: true, handoffAcknowledged: true });
    await vi.waitFor(async () => {
      const record = await store.getSubmission(jobId);
      expect(record?.builder).toBe('self');
      expect(record?.dispatch?.backend).toBe('self');
      expect(record?.roundGeneration).toBeGreaterThan(generationBefore);
    });
    expect(canceledRefs).toEqual(['copilot-1']);
    expect(briefs.at(-1)?.spec).toContain(CONCEPT);

    const staleReport = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: agentHeaders(jobId, generationBefore),
      payload: { text: 'The stopped platform agent must not keep writing.' },
    });
    expect(staleReport.statusCode).toBe(401);
    expect(staleReport.json().error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('hands an already-ended platform round to self immediately, without waiting for an ack', async () => {
    const { backend } = platformStub();
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ platform: backend, gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Ended Platform Handoff', concept: CONCEPT, builder: 'platform' },
    });
    expect(submit.statusCode).toBe(200);
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
      expect((await store.getSubmission(jobId))?.state).toBe('dispatched');
    });
    await store.touchLastAgentSignalAt(jobId, new Date().toISOString());

    const generationBefore = (await store.getSubmission(jobId))?.roundGeneration ?? 1;
    const endRes = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(jobId, generationBefore),
      payload: {},
    });
    expect(endRes.statusCode).toBe(200);
    expect((await store.getSubmission(jobId))?.agentEndedAt).toBeTruthy();

    const token = mintToken(jobId, secret);
    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/handoff`,
      headers: authHeaders(),
      payload: { builder: 'self', stopActivePlatformAgent: true },
    });
    // No `pending: true`, no second `/end` call needed.
    expect(handoff.statusCode).toBe(200);
    const after = await store.getSubmission(jobId);
    expect(after?.builder).toBe('self');
    expect(after?.builderHandoff).toBeUndefined();
    expect(after?.roundGeneration).toBeGreaterThan(generationBefore);
  });

  it('force-acknowledges a builder handoff nobody ever acked once it goes stale', async () => {
    const { backend } = platformStub();
    const { gamesStore } = stubGamesStore();
    const opened = Date.parse('2026-08-01T00:00:00Z');
    let clock = opened;
    const created = await createApp({
      platform: backend,
      gamesStore,
      now: () => clock,
      internalAuthVerifier: { verify: async () => true },
    });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Wedged Handoff', concept: CONCEPT, builder: 'platform' },
    });
    expect(submit.statusCode).toBe(200);
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
      expect((await store.getSubmission(jobId))?.state).toBe('dispatched');
    });
    await store.touchLastAgentSignalAt(jobId, new Date(clock).toISOString());

    const token = mintToken(jobId, secret);
    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${token}/handoff`,
      headers: authHeaders(),
      payload: { builder: 'self', stopActivePlatformAgent: true },
    });
    expect(handoff.statusCode).toBe(202);
    expect(handoff.json()).toMatchObject({ pending: true, target: 'self' });
    expect((await store.getSubmission(jobId))?.builderHandoff?.to).toBe('self');

    // The platform agent never acks via MCP `end` — crashed or wedged.
    clock = opened + 9 * 60 * 1000;
    const tooSoon = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: 'Bearer internal' },
    });
    expect(tooSoon.statusCode).toBe(200);
    expect((await store.getSubmission(jobId))?.builderHandoff?.to).toBe('self');
    expect((await store.getSubmission(jobId))?.builder).toBe('platform');

    clock = opened + 11 * 60 * 1000;
    const sweep = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: 'Bearer internal' },
    });
    expect(sweep.statusCode).toBe(200);
    await vi.waitFor(async () => {
      const record = await store.getSubmission(jobId);
      expect(record?.builder).toBe('self');
      expect(record?.builderHandoff).toBeUndefined();
    });
  });

  it('hands a quiet self round to platform, bumps generation, and seeds from the candidate', async () => {
    const { backend, briefs } = platformStub();
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ platform: backend, gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Quiet Handoff', concept: CONCEPT, builder: 'self' },
    });
    const slug = submit.json().slug as string;
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
    });

    // Deliver a candidate, close the self round, reopen self, then go quiet.
    await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    expect((await store.getSubmission(jobId))?.deliveredVersion).toBeTruthy();
    await store.recordJobTransition(jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });
    await store.recordJobTransition(jobId, {
      to: 'needs_changes',
      at: new Date().toISOString(),
      by: 'operator',
      reason: 'rejected',
    });

    await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/feedback`,
      headers: authHeaders(),
      payload: { feedback: 'Keep going on the draft.', builder: 'self' },
    });
    await vi.waitFor(async () => {
      const live = await store.getSubmission(jobId);
      expect(live?.builder).toBe('self');
      expect(live?.state).toBe('dispatched');
    });

    const genBefore = (await store.getSubmission(jobId))?.roundGeneration ?? 1;
    const quietAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await store.touchLastAgentSignalAt(jobId, quietAt);

    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/feedback`,
      headers: authHeaders(),
      payload: {
        feedback: 'Please have the platform team finish this — my agent went quiet.',
        builder: 'platform',
      },
    });
    expect(handoff.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs.length).toBeGreaterThan(0));
    const after = await store.getSubmission(jobId);
    expect(after?.builder).toBe('platform');
    expect(after?.dispatch?.backend).toBe('copilot');
    expect(after?.roundGeneration).toBeGreaterThan(genBefore);
    expect(briefs.at(-1)?.seed?.files.some((f) => f.path === 'SPEC.md')).toBe(true);
  });

  it('hands an ended self round to platform without waiting for quiet', async () => {
    const { backend, briefs } = platformStub();
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ platform: backend, gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Ended Handoff', concept: CONCEPT, builder: 'self' },
    });
    const slug = submit.json().slug as string;
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
    });

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    await store.recordJobTransition(jobId, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });
    await store.recordJobTransition(jobId, {
      to: 'needs_changes',
      at: new Date().toISOString(),
      by: 'operator',
      reason: 'rejected',
    });

    await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/feedback`,
      headers: authHeaders(),
      payload: { feedback: 'Keep going on the draft.', builder: 'self' },
    });
    await vi.waitFor(async () => {
      const live = await store.getSubmission(jobId);
      expect(live?.builder).toBe('self');
      expect(live?.state).toBe('dispatched');
    });

    // Recent signal — quiet would refuse; MCP end unlocks handoff immediately.
    await store.touchLastAgentSignalAt(jobId, new Date().toISOString());
    const liveGen = (await store.getSubmission(jobId))?.roundGeneration ?? 1;
    const endRes = await app.inject({
      method: 'POST',
      url: '/api/agent/build/end',
      headers: agentHeaders(jobId, liveGen),
      payload: {},
    });
    expect(endRes.statusCode).toBe(200);
    expect(endRes.json()).toMatchObject({ accepted: true, ended: true });
    expect((await store.getSubmission(jobId))?.agentEndedAt).toBeTruthy();

    const genBefore = (await store.getSubmission(jobId))?.roundGeneration ?? 1;
    const handoff = await app.inject({
      method: 'POST',
      url: `/api/submissions/${mintToken(jobId, secret)}/feedback`,
      headers: authHeaders(),
      payload: {
        feedback: 'Please have the platform team finish this — my agent ended.',
        builder: 'platform',
      },
    });
    expect(handoff.statusCode).toBe(200);
    await vi.waitFor(() => expect(briefs.length).toBeGreaterThan(0));
    const after = await store.getSubmission(jobId);
    expect(after?.builder).toBe('platform');
    expect(after?.dispatch?.backend).toBe('copilot');
    expect(after?.roundGeneration).toBeGreaterThan(genBefore);
    expect(after?.agentEndedAt).toBeUndefined();
  });

  it('records builder provenance on delivered versions', async () => {
    const { gamesStore, stored } = stubGamesStore();
    const created = await createApp({ gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Provenance', concept: CONCEPT, builder: 'self' },
    });
    const slug = submit.json().slug as string;
    let jobId = 0;
    await vi.waitFor(async () => {
      jobId = (await store.listSubmissionsByOwner('g:creator'))[0]!.jobId;
    });

    await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    expect(stored[0]?.backend).toBe('self');
    expect(stored[0]?.kitEngineRef).toBe(KIT_REF);
    expect((await store.getSubmission(jobId))?.builder).toBe('self');
  });

  it('preserves strict 401 for stale tokens on terminal self jobs (no stopReason bypass)', async () => {
    const created = await createApp({});
    app = created.app;
    const { store } = created;

    await store.createSubmission(99, 'g:creator', 'Terminal');
    await store.setRoundBuilder(99, 'self');
    await store.recordJobTransition(99, {
      to: 'abandoned',
      at: new Date().toISOString(),
      by: 'system',
      reason: 'no_connect',
    });
    await store.setSubmissionAbandoned(99, new Date().toISOString());
    // Round close bumps generation to 2; mint against the previous one.
    const stale = mintAgentToken(99, secret, { roundGeneration: 1 });
    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/build/progress',
      headers: { authorization: `Bearer ${stale}` },
      payload: { text: 'still here' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toMatch(/fresh prompt/i);
  });

  it('delivery with no prior progress lands submitted; reconciler does not double-close the round', async () => {
    // CP-1 regression: submit_sources while still `queued` (racing background dispatch)
    // used a stale local state for the `submitted` guard, left the job in `building`,
    // and let self observe() close the round before the gate — generation jumped +2
    // and the terminal-receipt window never matched.
    let clock = Date.parse('2026-08-01T12:00:00.000Z');
    const { gamesStore } = stubGamesStore();
    const created = await createApp({
      gamesStore,
      now: () => clock,
      internalAuthVerifier: { verify: async () => true },
    });
    app = created.app;
    const { store } = created;

    const jobId = 77;
    await store.createSubmission(jobId, 'g:creator', 'No Progress Race');
    await store.setSubmissionSlug(jobId, 'no-progress-race');
    await store.setRoundBuilder(jobId, 'self');
    await store.recordJobTransition(jobId, {
      to: 'queued',
      at: new Date(clock).toISOString(),
      by: 'creator',
      reason: 'submitted',
    });
    // Refs exist (dispatch recorded) but state is still queued — the live race shape.
    await store.recordDispatch(jobId, { backend: 'self', ref: `self:${jobId}` });
    expect((await store.getSubmission(jobId))?.state).toBe('queued');
    const initialGen = (await store.getSubmission(jobId))!.roundGeneration ?? 1;

    const delivery = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug: 'no-progress-race', files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    expect(delivery.statusCode).toBe(200);
    expect(delivery.json()).toMatchObject({ accepted: true });
    expect((await store.getSubmission(jobId))?.state).toBe('submitted');
    expect((await store.getSubmission(jobId))?.roundGeneration).toBe(initialGen);

    // Past the observe quiet window — reconciler must not move a submitted self job.
    clock += 3 * 60 * 1000;
    const sweep = await app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: 'Bearer internal' },
    });
    expect(sweep.statusCode).toBe(200);
    expect((await store.getSubmission(jobId))?.state).toBe('submitted');
    expect((await store.getSubmission(jobId))?.roundGeneration).toBe(initialGen);

    // Only the gate's own closing transition bumps generation — exactly +1.
    await store.recordJobTransition(jobId, {
      to: 'ready_for_review',
      at: new Date(clock).toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });
    expect((await store.getSubmission(jobId))?.roundGeneration).toBe(initialGen + 1);
  });

  it('late background dispatch does not regress a submitted self delivery', async () => {
    // Codex P1: create fires dispatchBuild unawaited; if the agent delivers first,
    // the late `to: 'dispatched'` write must not yank submitted → dispatched.
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Late Dispatch Race', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const slug = submit.json().slug as string;

    let jobId = 0;
    await vi.waitFor(async () => {
      const record = (await store.listSubmissionsByOwner('g:creator'))[0];
      expect(record?.builder).toBe('self');
      jobId = record!.jobId;
    });

    // Deliver immediately — typically still queued while background dispatch runs.
    const delivery = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    expect(delivery.json()).toMatchObject({ accepted: true });
    expect((await store.getSubmission(jobId))?.state).toBe('submitted');

    // Wait until the fire-and-forget dispatch has recorded its ref (and attempted its
    // state write). State must remain submitted — not regress to dispatched.
    await vi.waitFor(async () => {
      const record = await store.getSubmission(jobId);
      expect(record?.dispatch?.backend).toBe('self');
      expect(record?.dispatch?.refs?.length).toBeGreaterThan(0);
    });
    expect((await store.getSubmission(jobId))?.state).toBe('submitted');
  });
});

describe('self-build Studio preview (BY-14c)', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  /**
   * Self-build → channel sources → gate artifact → creator session hits the same
   * `/api/submissions/:token/preview` route Studio's play surface uses.
   */
  async function deliverSelfBuild(artifact: 'bundle.html' | 'preview.html', html: string) {
    // Gate-green jobs advertise a green verdict; the pre-green window has no gate
    // field yet (distinct from gate-red, which would bounce to needs_changes).
    const { gamesStore, derived } = stubGamesStore(artifact === 'bundle.html' ? { gateGreen: true } : undefined);
    const created = await createApp({ gamesStore });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Studio Play', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const slug = submit.json().slug as string;
    const token = submit.json().token as string;

    let jobId = 0;
    await vi.waitFor(async () => {
      const record = (await store.listSubmissionsByOwner('g:creator'))[0];
      expect(record?.builder).toBe('self');
      jobId = record!.jobId;
    });

    const delivery = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    expect(delivery.json()).toMatchObject({ accepted: true });
    const version = (await store.getSubmission(jobId))!.deliveredVersion!;
    expect(version).toBeTruthy();

    derived.set(`${slug}:${version}:${artifact}`, Buffer.from(html));

    if (artifact === 'bundle.html') {
      await store.recordJobTransition(jobId, {
        to: 'ready_for_review',
        at: new Date().toISOString(),
        by: 'gate',
        reason: 'gate_green',
      });
    }

    return { store, token, slug, jobId, version };
  }

  it('advertises preview.slug on status once a gate artifact exists for the delivery', async () => {
    // The regression: nativeJobStatus returned top-level slug but never preview.slug,
    // so SubmissionStatusView never called getSubmissionPreview and the Play control
    // stayed dark even after gate green. Artifact presence (not deliveredVersion alone)
    // is the readiness signal — see the delivered-without-artifact case below.
    const { token, slug } = await deliverSelfBuild(
      'bundle.html',
      '<!doctype html><title>Studio Play</title><canvas></canvas>',
    );

    const status = await app!.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: authHeaders(),
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      builder: 'self',
      phase: 'ready_for_review',
      slug,
      preview: { slug },
      progress: { headSha: expect.any(String) },
    });
    // Self deliveries do not push channel playables — Studio must use /preview.
    expect(status.json().playable).toBeUndefined();
  });

  it('serves the gate-green bundle to the creator through Studio preview auth', async () => {
    const html = '<!doctype html><title>Gate Green</title><canvas id="game"></canvas>';
    const { token, slug } = await deliverSelfBuild('bundle.html', html);

    const preview = await app!.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview`,
      headers: authHeaders(),
    });
    expect(preview.statusCode).toBe(200);
    // Delivery adopts the SPEC frontmatter title (`Self Built` in MINIMAL_FILES).
    expect(preview.json()).toEqual({ slug, title: 'Self Built', html });
  });

  it('serves preview.html for a delivered-but-ungated self-build (pre-green window)', async () => {
    // Gate decides publishability; the author can still watch the candidate. A red
    // (or not-yet-finished) run stores preview.html — same contract as platform builds.
    const html = '<!doctype html><title>Ungated Draft</title><canvas></canvas>';
    const { token, slug, store, jobId } = await deliverSelfBuild('preview.html', html);
    expect((await store.getSubmission(jobId))?.state).toBe('submitted');

    const status = await app!.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: authHeaders(),
    });
    expect(status.json()).toMatchObject({ builder: 'self', preview: { slug } });

    const preview = await app!.inject({
      method: 'GET',
      url: `/api/submissions/${token}/preview`,
      headers: authHeaders(),
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toEqual({ slug, title: 'Self Built', html });
  });

  it('does not advertise preview before the first self-build delivery', async () => {
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ gamesStore });
    app = created.app;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'No Delivery Yet', concept: CONCEPT, builder: 'self' },
    });
    const token = submit.json().token as string;
    await vi.waitFor(async () => {
      const record = (await created.store.listSubmissionsByOwner('g:creator'))[0];
      expect(record?.state).toBe('dispatched');
    });

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: authHeaders(),
    });
    expect(status.json().preview).toBeUndefined();
  });

  it('does not advertise preview after delivery until a gate artifact exists', async () => {
    // deliveredVersion alone is the pre-artifact window: Studio must not see
    // preview.slug yet, or a 409 would stick until headSha changes.
    const { gamesStore } = stubGamesStore();
    const created = await createApp({ gamesStore });
    app = created.app;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Awaiting Gate', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const slug = submit.json().slug as string;
    const token = submit.json().token as string;

    let jobId = 0;
    await vi.waitFor(async () => {
      const record = (await created.store.listSubmissionsByOwner('g:creator'))[0];
      expect(record?.builder).toBe('self');
      jobId = record!.jobId;
    });

    const delivery = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(jobId),
      payload: { slug, files: MINIMAL_FILES, kitEngineRef: KIT_REF },
    });
    expect(delivery.json()).toMatchObject({ accepted: true });
    expect((await created.store.getSubmission(jobId))!.deliveredVersion).toBeTruthy();

    const status = await app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: authHeaders(),
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ builder: 'self', slug });
    expect(status.json().preview).toBeUndefined();
  });
});
