// Setup and Anthropic helpers for scripts/builder-staging.ts.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

export const ANTHROPIC = 'https://api.anthropic.com';
export const HEADERS = (key: string) => ({
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'managed-agents-2026-04-01',
  'content-type': 'application/json',
});

export function log(line: string) {
  console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
}

export function sh(command: string, argv: string[], cwd: string): string {
  const result = spawnSync(command, argv, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${argv.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

export const field = (output: string, label: string) =>
  output.match(new RegExp(`${label}:[ \\t]+(.+?)[ \\t]*$`, 'm'))?.[1];
export const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

// Packs kit and workspace from the games checkout, published as current.
export async function publishLocalKit(gamesRepo: string, bucketRoot: string, outDir: string): Promise<string> {
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
export async function openTunnel(port: number): Promise<{ url: string; child: ChildProcess }> {
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
    const fail = (error: Error) => {
      clearTimeout(timer);
      child.kill();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error(`no tunnel URL after 30s:\n${seen}`)), 30_000);
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
    child.on('error', (error) => fail(new Error(`could not start ssh: ${error.message}`)));
    child.on('exit', (code) => fail(new Error(`tunnel exited (${code}):\n${seen}`)));
  });
  // Mid-run drops break uploads; say so instead of failing silently.
  child.on('exit', (code, signal) => {
    if (signal !== 'SIGTERM') log(`[tunnel] ssh exited (${code ?? signal}); sandbox uploads will fail`);
  });
  return { url, child };
}

// Sandbox uploads go through the tunnel, so the environment must allow it.
export async function stagingEnvironment(
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

export async function api(apiKey: string, pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(2000 * 2 ** attempt);
    try {
      last = await fetch(`${ANTHROPIC}${pathAndQuery}`, { ...init, headers: HEADERS(apiKey) });
    } catch (error) {
      if (attempt === 3) throw error;
      continue;
    }
    if (last.status !== 429 && last.status < 500) return last;
  }
  return last!;
}

export async function sessionState(apiKey: string, id: string): Promise<{ status?: string; stop?: string }> {
  const response = await api(apiKey, `/v1/sessions/${id}?beta=true`).catch(() => null);
  if (!response?.ok) return {};
  const body = (await response.json()) as { status?: string; stop_reason?: { type?: string } };
  return { status: body.status, stop: body.stop_reason?.type };
}

// Partial pages survive a failed export; the error is reported beside them.
export async function sessionEvents(apiKey: string, id: string): Promise<{ events: unknown[]; error?: string }> {
  const events: unknown[] = [];
  let page: string | undefined;
  try {
    do {
      const query = new URLSearchParams({ limit: '100', beta: 'true', ...(page ? { page } : {}) });
      const response = await api(apiKey, `/v1/sessions/${id}/events?${query}`);
      if (!response.ok) throw new Error(`events page: HTTP ${response.status}`);
      const body = (await response.json()) as { data?: unknown[]; next_page?: string | null };
      events.push(...(body.data ?? []));
      page = body.next_page ?? undefined;
    } while (page);
    return { events };
  } catch (error) {
    return { events, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function postOk(apiKey: string, pathAndQuery: string, body?: unknown): Promise<boolean> {
  const response = await api(apiKey, pathAndQuery, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).catch(() => null);
  if (!response?.ok) log(`POST ${pathAndQuery.split('?')[0]} failed: ${response?.status ?? 'network'}`);
  return Boolean(response?.ok);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Listens before the tunnel opens; requests wait until the app is built.
export async function frontDoor(): Promise<{
  port: number;
  attach: (app: FastifyInstance) => void;
  close: () => void;
}> {
  let handler: ((req: IncomingMessage, res: ServerResponse) => void) | undefined;
  const server = createServer((req, res) => (handler ? handler(req, res) : res.writeHead(503).end()));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('front door has no port');
  return {
    port: address.port,
    attach: (app) => {
      handler = (req, res) => app.routing(req, res);
    },
    close: () => server.close(),
  };
}
