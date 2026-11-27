// Builder rounds for new games against a local platform.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GitHubClient } from '../src/catalog/github-client.js';
import { createGcsGamesStore } from '../src/delivery/games-store.js';
import { buildApp } from '../src/platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../src/platform/auth.js';
import { InMemoryStore } from '../src/platform/store.js';
import { createFsBucket } from '../src/staging/fs-bucket.js';
import { createLocalGate } from '../src/staging/local-gate.js';
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

const ANTHROPIC = 'https://api.anthropic.com';
const HEADERS = (key: string) => ({
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'managed-agents-2026-04-01',
  'content-type': 'application/json',
});

function log(line: string) {
  console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
}

function sh(command: string, argv: string[], cwd: string): string {
  const result = spawnSync(command, argv, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${argv.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

const field = (output: string, label: string) => output.match(new RegExp(`${label}:\\s+(\\S+)`))?.[1];
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

// Packs kit and workspace from the games checkout, published as current.
async function publishLocalKit(gamesRepo: string, bucketRoot: string, outDir: string): Promise<string> {
  const engineRef = sh('git', ['rev-parse', 'HEAD'], gamesRepo).trim();
  if (sh('git', ['status', '--porcelain'], gamesRepo).trim()) {
    log('warning: games checkout is dirty; the kit packs the working tree but the gate checks HEAD');
  }
  const packedAt = new Date().toISOString();
  const kitOut = sh(
    'node',
    [
      '--import',
      'tsx',
      'tools/pack-kit.ts',
      '--out',
      path.join(outDir, 'kit'),
      '--engine-ref',
      engineRef,
      '--packed-at',
      packedAt,
    ],
    gamesRepo,
  );
  const wsOut = sh(
    'node',
    [
      '--import',
      'tsx',
      'tools/pack-workspace.ts',
      '--out',
      path.join(outDir, 'workspace'),
      '--engine-ref',
      engineRef,
      '--packed-at',
      packedAt,
    ],
    gamesRepo,
  );
  const kitTarball = field(kitOut, 'tarball');
  const digest = field(kitOut, 'digest');
  const wsTarball = field(wsOut, 'tarball');
  if (!kitTarball || !digest || !wsTarball) throw new Error(`could not read pack output:\n${kitOut}\n${wsOut}`);
  const put = async (name: string, body: Buffer | string) => {
    const file = path.join(bucketRoot, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  };
  const kit = await readFile(kitTarball);
  const digestBytes = await readFile(digest);
  const ws = await readFile(wsTarball);
  await put(`kits/${engineRef}.tgz`, kit);
  await put(`kits/${engineRef}.digest.md`, digestBytes);
  await put(
    `kits/${engineRef}.json`,
    `${JSON.stringify({ sha256: sha256(kit), digestSha256: sha256(digestBytes), packedAt })}\n`,
  );
  await put(`workspaces/${engineRef}.tgz`, ws);
  await put(`workspaces/${engineRef}.json`, `${JSON.stringify({ sha256: sha256(ws), packedAt })}\n`);
  await put('kits/current.json', `${JSON.stringify({ current: engineRef, previous: null, updatedAt: packedAt })}\n`);
  return engineRef;
}

// Public URL so the sandbox and MCP connector reach the local API.
async function openTunnel(port: number): Promise<{ url: string; child: ChildProcess }> {
  const child = spawn(
    'ssh',
    [
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'ServerAliveInterval=30',
      '-R',
      `80:127.0.0.1:${port}`,
      'nokey@localhost.run',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const url = await new Promise<string>((resolve, reject) => {
    let seen = '';
    const timer = setTimeout(() => reject(new Error(`no tunnel URL after 30s:\n${seen}`)), 30_000);
    const scan = (chunk: Buffer) => {
      seen += chunk.toString();
      const match = seen.match(/https:\/\/[a-z0-9-]+\.lhr\.life/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    child.stdout!.on('data', scan);
    child.stderr!.on('data', scan);
    child.on('exit', () => reject(new Error(`tunnel exited:\n${seen}`)));
  });
  return { url, child };
}

// Sandbox uploads go through the tunnel, so the environment must allow it.
async function stagingEnvironment(
  apiKey: string,
  environmentId: string,
  host: string,
): Promise<{ id: string; created: boolean }> {
  const response = await fetch(`${ANTHROPIC}/v1/environments/${environmentId}?beta=true`, { headers: HEADERS(apiKey) });
  if (!response.ok)
    throw new Error(`could not read environment ${environmentId}: ${response.status} ${await response.text()}`);
  const env = (await response.json()) as {
    name?: string;
    config?: { networking?: { type?: string; allowed_hosts?: string[] } } & Record<string, unknown>;
  };
  const networking = env.config?.networking;
  if (networking?.type !== 'limited') return { id: environmentId, created: false };
  const allowed = networking.allowed_hosts ?? [];
  if (allowed.includes(host) || allowed.includes(`*.${host.split('.').slice(1).join('.')}`)) {
    return { id: environmentId, created: false };
  }
  const config = { ...env.config, networking: { ...networking, allowed_hosts: [...allowed, host] } };
  const created = await fetch(`${ANTHROPIC}/v1/environments?beta=true`, {
    method: 'POST',
    headers: HEADERS(apiKey),
    body: JSON.stringify({ name: `${env.name ?? 'builder'} (staging ${host})`, config }),
  });
  if (!created.ok) throw new Error(`could not create staging environment: ${created.status} ${await created.text()}`);
  const body = (await created.json()) as { id: string };
  log(`staging environment ${body.id}: ${environmentId} plus ${host}`);
  return { id: body.id, created: true };
}

async function sessionState(apiKey: string, id: string): Promise<{ status?: string; stop?: string }> {
  const response = await fetch(`${ANTHROPIC}/v1/sessions/${id}?beta=true`, { headers: HEADERS(apiKey) });
  if (!response.ok) return {};
  const body = (await response.json()) as { status?: string; stop_reason?: { type?: string } };
  return { status: body.status, stop: body.stop_reason?.type };
}

async function sessionEvents(apiKey: string, id: string): Promise<unknown[]> {
  const events: unknown[] = [];
  let page: string | undefined;
  do {
    const query = new URLSearchParams({ limit: '100', beta: 'true', ...(page ? { page } : {}) });
    const response = await fetch(`${ANTHROPIC}/v1/sessions/${id}/events?${query}`, { headers: HEADERS(apiKey) });
    if (!response.ok) throw new Error(`events of ${id}: ${response.status}`);
    const body = (await response.json()) as { data?: unknown[]; next_page?: string | null };
    events.push(...(body.data ?? []));
    page = body.next_page ?? undefined;
  } while (page);
  return events;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const port = Number(value('port') ?? 3101);
  const maxCents = value('max-cents') ?? '300';
  const maxMinutes = Number(value('max-minutes') ?? 40);
  const outDir = path.resolve(
    value('out') ?? path.join(repoRoot, '.staging-runs', new Date().toISOString().replace(/[:.]/g, '-')),
  );
  if (!apiKey || !agentId) {
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
    log,
  });

  let tunnel: ChildProcess | undefined;
  if (!publicUrl) {
    const opened = await openTunnel(port);
    publicUrl = opened.url;
    tunnel = opened.child;
  }
  log(`public URL ${publicUrl}`);
  const environment = await stagingEnvironment(apiKey, baseEnvironment, new URL(publicUrl).host);

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
  const app = await buildApp({
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
  app.get('/staging-bucket/*', async (request, reply) => {
    const name = decodeURIComponent((request.params as { '*': string })['*']);
    const query = request.query as { sig?: string; expires?: string };
    if (!bucket.verifyReadUrl(name, query.sig ?? '', query.expires ?? '')) return reply.code(403).send();
    const body = await bucket.objectStore.readObject(name);
    return body ? reply.type('application/octet-stream').send(body) : reply.code(404).send();
  });
  await app.listen({ port, host: '127.0.0.1' });
  log(`platform listening on ${port}`);

  const results: Array<Record<string, unknown>> = [];
  await Promise.all(
    briefs.map(async (brief, index) => {
      const uid = `g:staging-${brief.id}`;
      await store.upsertUser({ uid });
      const cookie = `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
      await sleep(index * 2000);
      const created = await app.inject({
        method: 'POST',
        url: '/api/submissions',
        headers: { cookie },
        payload: { title: brief.title, concept: brief.concept },
      });
      if (created.statusCode !== 200) {
        log(`[${brief.id}] submission refused: ${created.statusCode} ${created.body}`);
        results.push({ id: brief.id, error: created.body });
        return;
      }
      const deadline = Date.now() + (maxMinutes + 5) * 60_000;
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
        results.push({ id: brief.id, error: 'not dispatched' });
        return;
      }
      log(`[${brief.id}] job ${jobId} session ${sessionId}`);
      const startedAt = Date.now();
      let state: { status?: string; stop?: string } = {};
      // Two idle polls in a row: the turn is over.
      let idlePolls = 0;
      while (Date.now() < deadline) {
        await sleep(15_000);
        state = await sessionState(apiKey, sessionId);
        const record = await store.getSubmission(jobId);
        if (state.status === 'terminated') break;
        idlePolls = state.status === 'idle' ? idlePolls + 1 : 0;
        if (idlePolls >= 2 || (idlePolls === 1 && record?.agentEndedAt)) break;
      }
      await gate.idle();
      const record = await store.getSubmission(jobId);
      const events = await sessionEvents(apiKey, sessionId).catch(() => []);
      const dir = path.join(outDir, brief.id);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'events.json'), JSON.stringify(events, null, 2));
      const version = record?.deliveredVersion ?? record?.previewVersion;
      const slug = record?.slug;
      const manifest = slug && version ? await gamesStore.getManifest(slug, version) : null;
      const verdict = manifest?.gate ?? manifest?.previewGate;
      const result = {
        id: brief.id,
        session: sessionId,
        slug,
        version,
        sessionStatus: state,
        minutes: Math.round((Date.now() - startedAt) / 6000) / 10,
        gate: verdict ? { green: verdict.green, lane: manifest?.gate ? 'publish' : 'preview' } : null,
        score: events.length ? scoreSession(events) : null,
      };
      if (verdict && !verdict.green) await writeFile(path.join(dir, 'gate-report.txt'), String(verdict.report ?? ''));
      await writeFile(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
      log(`[${brief.id}] done: gate ${verdict ? (verdict.green ? 'GREEN' : 'RED') : 'none'}`);
      results.push(result);
    }),
  );

  await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(results, null, 2));
  log(`summary: ${path.join(outDir, 'summary.json')}`);
  await app.close();
  tunnel?.kill();
  if (environment.created) {
    await fetch(`${ANTHROPIC}/v1/environments/${environment.id}/archive?beta=true`, {
      method: 'POST',
      headers: HEADERS(apiKey),
    }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
