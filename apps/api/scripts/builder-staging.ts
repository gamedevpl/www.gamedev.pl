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

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);

interface Brief {
  id: string;
  title: string;
  concept: string;
}
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

async function main() {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? '').trim();
  const agentId = (value('agent-id') ?? process.env.MANAGED_AGENT_ID ?? '').trim();
  const baseEnvironment = (
    value('environment-id') ??
    process.env.MANAGED_AGENT_ENVIRONMENT_ID ??
    'env_01Cfs2XCfF6zVSkChxMrGugn'
  ).trim();
  const gamesRepo = path.resolve(value('games') ?? path.join(repoRoot, '..', 'www.gamedev.pl-games'));
  const briefsFile = value('briefs') ?? path.join(here, 'staging-briefs.json');
  const only = value('only')?.split(',');
  const maxCents = value('max-cents') ?? '300';
  const maxMinutes = Number(value('max-minutes') ?? 40);
  const isolation = gateIsolation(flag('unsafe-gate'));
  const outDir = path.resolve(
    value('out') ?? path.join(repoRoot, '.staging-runs', new Date().toISOString().replace(/[:.]/g, '-')),
  );
  if ((!apiKey || !agentId) && !value('gate-selftest')) {
    console.error('needs ANTHROPIC_API_KEY (or CLAUDE_API_KEY) and MANAGED_AGENT_ID (or --agent-id)');
    process.exit(2);
  }
  const briefs = (JSON.parse(await readFile(briefsFile, 'utf8')) as Brief[]).filter(
    (b) => !only || only.includes(b.id),
  );
  if (!briefs.length) throw new Error('no briefs selected');
  await mkdir(outDir, { recursive: true });
  log(`run dir ${outDir}`);

  // No round-0 seed or catalog: nothing here talks to GitHub.
  if (!flag('seed')) {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GAMES_REPO_TOKEN;
  }
  delete process.env.GAMES_STORE_BUCKET;

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
  const selftest = value('gate-selftest');
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
    const verdict = (await gamesStore.getManifest(slug, version))?.previewGate;
    log(`selftest (${isolation}): ${verdict ? (verdict.green ? 'GREEN' : `RED\n${verdict.report}`) : 'no verdict'}`);
    process.exit(verdict?.green ? 0 : 1);
  }

  const door = await frontDoor();
  let tunnel: ChildProcess | undefined;
  let app: FastifyInstance | undefined;
  let environment: { id: string; created: boolean } | undefined;
  try {
    // `--public-url local` skips the tunnel, for fake-API dry runs.
    if (publicUrl === 'local') publicUrl = `http://127.0.0.1:${door.port}`;
    if (!publicUrl) {
      const opened = await openTunnel(door.port);
      publicUrl = opened.url;
      tunnel = opened.child;
    }
    log(`public URL ${publicUrl} -> 127.0.0.1:${door.port}`);
    environment = await stagingEnvironment(apiKey, baseEnvironment, new URL(publicUrl).host);

    Object.assign(process.env, {
      APP_BASE_URL: publicUrl,
      MANAGED_AGENT_VENDOR: 'anthropic',
      MANAGED_AGENT_API_KEY: apiKey,
      MANAGED_AGENT_MODEL: process.env.MANAGED_AGENT_MODEL ?? 'claude-sonnet-5-5',
      MANAGED_AGENT_ANTHROPIC_EFFORT: process.env.MANAGED_AGENT_ANTHROPIC_EFFORT ?? 'medium',
      MANAGED_AGENT_ID: agentId,
      MANAGED_AGENT_ENVIRONMENT_ID: environment.id,
      MANAGED_AGENT_MAX_SECONDS: String(maxMinutes * 60),
      MANAGED_AGENT_MAX_LIST_COST_CENTS: maxCents,
      MANAGED_AGENT_MCP_URL: `${publicUrl}/api/mcp`,
    });

    const sessionSecret = randomBytes(32).toString('hex');
    const store = new InMemoryStore();
    // Catalog reads miss; `then` stays undefined (not a thenable).
    const githubClient = new Proxy({} as GitHubClient, {
      get: (_, key) => (key === 'then' ? undefined : async () => null),
    });
    app = await buildApp({
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
    const PUBLIC = ['/api/mcp', '/api/agent/', '/staging-bucket/'];
    app.addHook('onRequest', async (request, reply) => {
      if (request.headers['x-staging-local'] === localKey) return;
      if (!PUBLIC.some((prefix) => request.url.startsWith(prefix))) return reply.code(404).send();
    });
    app.get('/staging-bucket/*', async (request, reply) => {
      const name = decodeURIComponent((request.params as { '*': string })['*']);
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
    await app?.close().catch(() => undefined);
    door.close();
    tunnel?.kill();
    if (environment?.created) {
      const archived = await postOk(apiKey, `/v1/environments/${environment.id}/archive?beta=true`);
      if (!archived) log(`archive environment ${environment.id} by hand in the Console`);
    }
  }
}

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
    headers: { cookie, 'x-staging-local': input.localKey },
    payload: { title: brief.title, concept: brief.concept },
  });
  if (created.statusCode !== 200) {
    log(`[${brief.id}] submission refused: ${created.statusCode} ${created.body}`);
    return { id: brief.id, error: created.body };
  }
  const deadline = Date.now() + input.maxMinutes * 60_000;
  let sessionId: string | undefined;
  let jobId: number | undefined;
  while (!sessionId && Date.now() < deadline) {
    const [job] = await store.listSubmissionsByOwner(uid);
    jobId = job?.jobId;
    sessionId = job?.dispatch?.refs?.at(-1);
    if (!sessionId) await sleep(2000);
  }
  if (!sessionId || jobId === undefined) {
    log(`[${brief.id}] never dispatched`);
    return { id: brief.id, error: 'not dispatched' };
  }
  log(`[${brief.id}] job ${jobId} session ${sessionId}`);
  const startedAt = Date.now();
  let state: { status?: string; stop?: string } = {};
  // Two idle polls in a row: the turn is over.
  let idlePolls = 0;
  let timedOut = false;
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
    if (idlePolls >= 2 || (idlePolls === 1 && record?.agentEndedAt)) break;
  }
  const minutes = Math.round((Date.now() - startedAt) / 6000) / 10;
  const credentialRef = (await store.getSubmission(jobId))?.dispatch?.credentialRefs?.[sessionId];
  if (credentialRef) await postOk(apiKey, `/v1/vaults/${credentialRef}/archive?beta=true`);

  const slug = (await store.getSubmission(jobId))?.slug;
  if (slug) await gate.settled(slug);
  const record = await store.getSubmission(jobId);
  const exported = await sessionEvents(apiKey, sessionId);
  const dir = path.join(input.outDir, brief.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'events.json'), JSON.stringify(exported.events, null, 2));
  const version = record?.deliveredVersion ?? record?.previewVersion;
  const manifest = slug && version ? await gamesStore.getManifest(slug, version) : null;
  const verdict = manifest?.gate ?? manifest?.previewGate;
  const result = {
    id: brief.id,
    session: sessionId,
    slug,
    version,
    sessionStatus: state,
    timedOut,
    minutes,
    gate: verdict ? { green: verdict.green, lane: manifest?.gate ? 'publish' : 'preview' } : null,
    ...(exported.error ? { exportError: exported.error, exportedEvents: exported.events.length } : {}),
    score: exported.events.length ? scoreSession(exported.events) : null,
  };
  if (verdict && !verdict.green) await writeFile(path.join(dir, 'gate-report.txt'), String(verdict.report ?? ''));
  await writeFile(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
  log(
    `[${brief.id}] done: gate ${verdict ? (verdict.green ? 'GREEN' : 'RED') : 'none'}${timedOut ? ', timed out' : ''}`,
  );
  return result;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
