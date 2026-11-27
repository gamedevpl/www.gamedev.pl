// Builder rounds for new games against a local platform.

import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GitHubClient } from '../src/catalog/github-client.js';
import type { FastifyInstance } from 'fastify';
import { assertDeliverableSourcePath, createGcsGamesStore, type GamesStore } from '../src/delivery/games-store.js';
import { buildApp } from '../src/platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../src/platform/auth.js';
import { InMemoryStore } from '../src/platform/store.js';
import { createFsBucket } from '../src/staging/fs-bucket.js';
import { createLocalGate, gateIsolation, type LocalGate } from '../src/staging/local-gate.js';
// @ts-expect-error plain ESM helper shared with infra/session-score.mjs
import { scoreSession } from '../../../infra/session-score-lib.mjs';
import {
  frontDoor,
  log,
  openTunnel,
  postOk,
  publishLocalKit,
  sessionEvents,
  sessionState,
  sleep,
  stagingEnvironment,
} from './builder-staging-lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const VALUE_FLAGS = [
  'agent-id',
  'briefs',
  'environment-id',
  'games',
  'gate-selftest',
  'max-cents',
  'max-minutes',
  'only',
  'out',
  'public-url',
] as const;
const BOOLEAN_FLAGS = ['keep-harness', 'seed', 'unsafe-gate'] as const;

// Strict: a typo must not silently fall back to paid defaults.
function parseArgs(argv: string[]): { values: Map<string, string>; flags: Set<string> } {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    const name = match?.[1];
    if (name && (BOOLEAN_FLAGS as readonly string[]).includes(name) && match[2] === undefined) flags.add(name);
    else if (name && (VALUE_FLAGS as readonly string[]).includes(name)) {
      const given = match[2] ?? argv[++i];
      if (given === undefined || given === '' || given.startsWith('--')) usage(`--${name} needs a value`);
      values.set(name, given);
    } else usage(`unknown argument: ${argv[i]}`);
  }
  return { values, flags };
}

function usage(problem: string): never {
  console.error(`${problem}\nflags: ${[...VALUE_FLAGS, ...BOOLEAN_FLAGS].map((f) => `--${f}`).join(' ')}`);
  process.exit(2);
}

function positiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) usage(`--${name} must be a positive integer, got ${raw}`);
  return parsed;
}

const parsed = parseArgs(process.argv.slice(2));
const flag = (name: (typeof BOOLEAN_FLAGS)[number]) => parsed.flags.has(name);
const value = (name: (typeof VALUE_FLAGS)[number]) => parsed.values.get(name);

// Operator shell settings that would point a staging round at production.
const AMBIENT_ENV = [
  'CANONICAL_HOST',
  'GAMES_STORE_BUCKET',
  'MANAGED_AGENT_BASE_URL',
  'MANAGED_AGENT_GAME_MEMORY',
  'MANAGED_AGENT_VAULT_IDS',
  'MANAGED_AGENT_VAULT_ID',
  'NODE_ENV',
  'SEED_DISPATCH_AUDIENCE',
  'SEED_DISPATCH_SA',
];

interface Brief {
  id: string;
  title: string;
  concept: string;
  locale?: string;
}

// Sessions still running, interrupted on Ctrl+C or a crash.
const live = new Map<string, { jobId: number; store: InMemoryStore }>();

async function stopSession(apiKey: string, sessionId: string, store: InMemoryStore, jobId: number): Promise<void> {
  await postOk(apiKey, `/v1/sessions/${sessionId}/events?beta=true`, { events: [{ type: 'user.interrupt' }] });
  await archiveVault(apiKey, sessionId, store, jobId);
}

async function archiveVault(apiKey: string, sessionId: string, store: InMemoryStore, jobId: number): Promise<void> {
  const credentialRef = (await store.getSubmission(jobId))?.dispatch?.credentialRefs?.[sessionId];
  if (credentialRef) await postOk(apiKey, `/v1/vaults/${credentialRef}/archive?beta=true`);
}

async function main() {
  const selftest = value('gate-selftest');
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? '').trim();
  const agentId = (value('agent-id') ?? process.env.MANAGED_AGENT_ID ?? '').trim();
  const baseEnvironment = (value('environment-id') ?? process.env.MANAGED_AGENT_ENVIRONMENT_ID ?? '').trim();
  const gamesRepo = path.resolve(value('games') ?? path.join(repoRoot, '..', 'www.gamedev.pl-games'));
  const briefsFile = value('briefs') ?? path.join(here, 'staging-briefs.json');
  const only = value('only')?.split(',');
  const maxCents = positiveInt(value('max-cents'), 300, 'max-cents');
  const maxMinutes = positiveInt(value('max-minutes'), 40, 'max-minutes');
  const isolation = gateIsolation(flag('unsafe-gate'));
  const outDir = path.resolve(
    value('out') ?? path.join(repoRoot, '.staging-runs', new Date().toISOString().replace(/[:.]/g, '-')),
  );
  if ((!apiKey || !agentId || !baseEnvironment) && !selftest) {
    usage(
      'needs ANTHROPIC_API_KEY (or CLAUDE_API_KEY), MANAGED_AGENT_ID (or --agent-id) and ' +
        'MANAGED_AGENT_ENVIRONMENT_ID (or --environment-id)',
    );
  }
  const briefs = (JSON.parse(await readFile(briefsFile, 'utf8')) as Brief[]).filter(
    (b) => !only || only.includes(b.id),
  );
  const unknown = only?.filter((id) => !briefs.some((b) => b.id === id)) ?? [];
  if (unknown.length) usage(`no such brief: ${unknown.join(', ')}`);
  if (!briefs.length) usage('no briefs selected');
  await mkdir(outDir, { recursive: true });
  log(`run dir ${outDir}`);

  // No round-0 seed or catalog: nothing here talks to GitHub.
  if (!flag('seed')) {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GAMES_REPO_TOKEN;
  }
  for (const name of AMBIENT_ENV) delete process.env[name];

  const bucketRoot = path.join(outDir, 'bucket');
  const engineRef = await publishLocalKit(gamesRepo, bucketRoot, path.join(outDir, 'packed'));
  log(`kit ${engineRef.slice(0, 12)} published to the local bucket`);

  let publicUrl = value('public-url')?.replace(/\/$/, '') ?? '';
  const bucket = createFsBucket({
    root: bucketRoot,
    publicBaseUrl: () => publicUrl,
    secret: randomBytes(16).toString('hex'),
  });
  const gamesStore = createGcsGamesStore({
    bucket: 'staging',
    fetchImpl: bucket.fetch,
    getAccessToken: async () => 'local',
  });
  const gate = createLocalGate({
    store: gamesStore,
    gamesRepo,
    mainRef: engineRef,
    keepHarness: flag('keep-harness'),
    isolation,
    log,
  });

  // Gate only, no API spend: checks isolation on this machine.
  if (selftest) {
    const source = path.join(gamesRepo, 'games', selftest);
    const names = (await readdir(source, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(source, path.join(entry.parentPath, entry.name)))
      .filter((name) => {
        try {
          return Boolean(assertDeliverableSourcePath(name));
        } catch {
          return false;
        }
      });
    const files = await Promise.all(
      names.map(async (name) => ({ path: name, content: await readFile(path.join(source, name), 'utf8') })),
    );
    const slug = `selftest-${selftest}`;
    const { version } = await gamesStore.putCandidateSources({
      slug,
      jobId: 1,
      files,
      kitEngineRef: engineRef,
      mode: 'preview',
    });
    await gate.trigger({ slug, version, mode: 'preview' });
    await gate.settled(slug);
    const manifest = await gamesStore.getManifest(slug, version);
    const verdict = manifest?.previewGate;
    const outcome = verdict
      ? verdict.green
        ? 'GREEN'
        : `RED\n${verdict.report}`
      : manifest?.gateCrash
        ? 'CRASHED'
        : 'no verdict';
    log(`selftest (${isolation}): ${outcome}`);
    process.exit(verdict?.green ? 0 : 1);
  }

  const door = await frontDoor();
  let tunnel: ChildProcess | undefined;
  let app: FastifyInstance | undefined;
  let environment: { id: string; created: boolean } | undefined;
  let cleaned: Promise<void> | undefined;
  const cleanup = () =>
    (cleaned ??= (async () => {
      await Promise.all([...live].map(([sessionId, { jobId, store }]) => stopSession(apiKey, sessionId, store, jobId)));
      await app?.close().catch(() => undefined);
      door.close();
      tunnel?.kill();
      if (environment?.created) {
        const archived = await postOk(apiKey, `/v1/environments/${environment.id}/archive?beta=true`);
        if (!archived) log(`archive environment ${environment.id} by hand in the Console`);
      }
    })());
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      log(`${signal}: interrupting ${live.size} session(s) and cleaning up`);
      void cleanup().finally(() => process.exit(130));
    });
  }
  try {
    // `--public-url local` skips the tunnel, for fake-API dry runs.
    if (publicUrl === 'local') publicUrl = `http://127.0.0.1:${door.port}`;
    if (!publicUrl) {
      const opened = await openTunnel(door.port);
      publicUrl = opened.url;
      tunnel = opened.child;
    }
    log(`public URL ${publicUrl} -> 127.0.0.1:${door.port}`);
    environment = await stagingEnvironment(apiKey, baseEnvironment, new URL(publicUrl).hostname);

    Object.assign(process.env, {
      APP_BASE_URL: publicUrl,
      MANAGED_AGENT_VENDOR: 'anthropic',
      MANAGED_AGENT_API_KEY: apiKey,
      MANAGED_AGENT_MODEL: process.env.MANAGED_AGENT_MODEL ?? 'claude-sonnet-5-5',
      MANAGED_AGENT_ANTHROPIC_EFFORT: process.env.MANAGED_AGENT_ANTHROPIC_EFFORT ?? 'medium',
      MANAGED_AGENT_ID: agentId,
      MANAGED_AGENT_ENVIRONMENT_ID: environment.id,
      MANAGED_AGENT_MAX_SECONDS: String(maxMinutes * 60),
      MANAGED_AGENT_MAX_LIST_COST_CENTS: String(maxCents),
      MANAGED_AGENT_MCP_URL: `${publicUrl}/api/mcp`,
    });

    const sessionSecret = randomBytes(32).toString('hex');
    const store = new InMemoryStore();
    // Catalog reads miss; `then` stays undefined (not a thenable).
    const githubClient = new Proxy({} as GitHubClient, {
      get: (_, key) => (key === 'then' ? undefined : async () => null),
    });
    app = await buildApp({
      // Dispatch failures are only ever logged; keep warnings visible.
      logger: { level: 'warn' },
      store,
      sessionSecret,
      submissionRoutes: {
        githubClient,
        githubToken: 'staging-unused',
        submissionTokenSecret: randomBytes(32).toString('hex'),
        managedAvailabilityGate: null,
        agentChannel: { gamesStore, objectStore: bucket.objectStore, onSourcesDelivered: gate.trigger },
      },
    });
    // Tunnel reaches agent routes only; runner calls carry a key.
    const localKey = randomBytes(16).toString('hex');
    const isPublic = (url: string) =>
      url === '/api/mcp' ||
      url.startsWith('/api/mcp?') ||
      url.startsWith('/api/agent/') ||
      url.startsWith('/staging-bucket/');
    app.addHook('onRequest', async (request, reply) => {
      if (request.headers['x-staging-local'] === localKey) return;
      if (!isPublic(request.url)) return reply.code(404).send();
    });
    app.get('/staging-bucket/*', async (request, reply) => {
      // Fastify has already decoded the wildcard.
      const name = (request.params as { '*': string })['*'];
      const query = request.query as { sig?: string; expires?: string };
      if (!bucket.verifyReadUrl(name, query.sig ?? '', query.expires ?? '')) return reply.code(403).send();
      const body = await bucket.objectStore.readObject(name);
      return body ? reply.type('application/octet-stream').send(body) : reply.code(404).send();
    });
    await app.ready();
    door.attach(app);
    log('platform ready');

    const results = await Promise.all(
      briefs.map((brief, index) =>
        runBrief({
          brief,
          index,
          app: app!,
          store,
          localKey,
          sessionSecret,
          apiKey,
          maxMinutes,
          gate,
          gamesStore,
          outDir,
        }).catch((error: unknown) => ({ id: brief.id, error: error instanceof Error ? error.message : String(error) })),
      ),
    );
    await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(results, null, 2));
    log(`summary: ${path.join(outDir, 'summary.json')}`);
  } finally {
    await cleanup();
  }
}

// Version ids are timestamp-prefixed, so the later one sorts last.
const latest = (...versions: Array<string | undefined>) =>
  versions
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

async function runBrief(input: {
  brief: Brief;
  index: number;
  app: FastifyInstance;
  store: InMemoryStore;
  localKey: string;
  sessionSecret: string;
  apiKey: string;
  maxMinutes: number;
  gate: LocalGate;
  gamesStore: GamesStore;
  outDir: string;
}): Promise<Record<string, unknown>> {
  const { brief, app, store, apiKey, gate, gamesStore } = input;
  const uid = `g:staging-${brief.id}`;
  await store.upsertUser({ uid });
  const cookie = `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, input.sessionSecret)}`;
  await sleep(input.index * 2000);
  const created = await app.inject({
    method: 'POST',
    url: '/api/submissions',
    // One address per brief: the per-IP submission window is five.
    remoteAddress: `127.0.${Math.floor(input.index / 250)}.${(input.index % 250) + 2}`,
    headers: { cookie, 'x-staging-local': input.localKey },
    payload: { title: brief.title, concept: brief.concept, ...(brief.locale ? { locale: brief.locale } : {}) },
  });
  if (created.statusCode !== 200) {
    log(`[${brief.id}] submission refused: ${created.statusCode} ${created.body}`);
    return { id: brief.id, error: created.body };
  }
  // Dispatch is quick; a silent failure shows in the warn log above.
  const dispatchDeadline = Date.now() + 3 * 60_000;
  let sessionId: string | undefined;
  let jobId: number | undefined;
  while (!sessionId && Date.now() < dispatchDeadline) {
    const [job] = await store.listSubmissionsByOwner(uid);
    jobId = job?.jobId;
    sessionId = job?.dispatch?.refs?.at(-1);
    if (!sessionId) await sleep(2000);
  }
  if (!sessionId || jobId === undefined) {
    log(`[${brief.id}] not dispatched within 3 min`);
    return { id: brief.id, error: 'not dispatched' };
  }
  live.set(sessionId, { jobId, store });
  log(`[${brief.id}] job ${jobId} session ${sessionId}`);
  const startedAt = Date.now();
  const deadline = startedAt + input.maxMinutes * 60_000;
  let state: { status?: string; stop?: string } = {};
  // Two idle polls in a row: the turn is over.
  let idlePolls = 0;
  let timedOut = false;
  try {
    for (;;) {
      if (Date.now() >= deadline) {
        timedOut = true;
        log(`[${brief.id}] over ${input.maxMinutes} min: interrupting ${sessionId}`);
        await postOk(apiKey, `/v1/sessions/${sessionId}/events?beta=true`, { events: [{ type: 'user.interrupt' }] });
        break;
      }
      await sleep(15_000);
      state = await sessionState(apiKey, sessionId);
      const record = await store.getSubmission(jobId);
      if (state.status === 'terminated') break;
      idlePolls = state.status === 'idle' ? idlePolls + 1 : 0;
      if (idlePolls >= 2 || (idlePolls === 1 && record?.agentEndedBy === 'end')) break;
    }
  } finally {
    live.delete(sessionId);
    await archiveVault(apiKey, sessionId, store, jobId);
  }
  const minutes = Math.round((Date.now() - startedAt) / 6000) / 10;

  const slug = (await store.getSubmission(jobId))?.slug;
  if (slug) await gate.settled(slug);
  const record = await store.getSubmission(jobId);
  const exported = await sessionEvents(apiKey, sessionId);
  const dir = path.join(input.outDir, brief.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'events.json'), JSON.stringify(exported.events, null, 2));
  const version = latest(record?.deliveredVersion, record?.previewVersion);
  const manifest = slug && version ? await gamesStore.getManifest(slug, version) : null;
  const verdict = manifest?.gate ?? manifest?.previewGate;
  const gateResult = verdict
    ? { green: verdict.green, lane: manifest?.gate ? 'publish' : 'preview' }
    : manifest?.gateCrash
      ? { green: false, crashed: true }
      : null;
  const result = {
    id: brief.id,
    session: sessionId,
    slug,
    version,
    sessionStatus: state,
    timedOut,
    minutes,
    gate: gateResult,
    ...(exported.error ? { exportError: exported.error, exportedEvents: exported.events.length } : {}),
    score: exported.events.length ? scoreSession(exported.events) : null,
  };
  if (verdict && !verdict.green) await writeFile(path.join(dir, 'gate-report.txt'), String(verdict.report ?? ''));
  await writeFile(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
  const gateWord = gateResult ? (gateResult.green ? 'GREEN' : 'crashed' in gateResult ? 'CRASHED' : 'RED') : 'none';
  log(`[${brief.id}] done: gate ${gateWord}${timedOut ? ', timed out' : ''}`);
  return result;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
