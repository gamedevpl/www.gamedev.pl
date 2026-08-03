import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyAgentTokenAccess, mintAgentToken, STALE_AGENT_TOKEN_REASON } from './agent-token.js';
import { mintGameAgentKey } from './agent-game-key.js';
import { buildApp } from './app.js';
import type { GamesStore } from './games-store.js';
import type { GcsObjectStore } from './gcs-sign.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './github-client.js';
import { mintMcpSessionKey, verifyMcpSessionKey } from './mcp-session-key.js';
import { InMemoryStore } from './store.js';
import { NoopTranslator } from './translate.js';

const secret = 'test-secret';
const ISSUE = 55;
const ENGINE = 'abcdef0123456789abcdef0123456789abcdef01';

/** Minimal valid 1×1 PNG. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
).toString('base64');

const MINIMAL_FILES = [
  { path: 'SPEC.md', content: '---\ntitle: Comet Courier\n---\n' },
  { path: 'index.html', content: '<!doctype html><html></html>' },
  { path: 'game.ts', content: 'export {};' },
  { path: 'TRACE.json', content: '{"samples":[]}' },
  { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
  { path: 'AGENT.json', content: '{"policy":"capture"}' },
];

function stubGitHub(): GitHubClient {
  return {
    createIssue: async () => ({ number: ISSUE }),
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    closePullRequest: async () => {},
    ensureOpenPullRequest: async () => ({ number: 1 }),
    deleteBranch: async () => {},
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
  };
}

function stubGamesStore(gate?: { green: boolean; ranAt?: string; report?: string; status?: string }) {
  const stored: Array<{ slug: string; files: unknown[]; kitEngineRef?: string }> = [];
  const gamesStore = {
    putCandidateSources: async (input: {
      slug: string;
      issueNumber: number;
      files: Array<{ path: string; content: string }>;
      kitEngineRef?: string;
    }) => {
      const { validateSourceUpload } = await import('./games-store.js');
      validateSourceUpload(input.files);
      stored.push(input);
      return { version: 'v1', manifest: {} as never };
    },
    getManifest: async () =>
      gate
        ? {
            gate: {
              green: gate.green,
              ranAt: gate.ranAt ?? '2026-08-01T12:00:00.000Z',
              ...(gate.report ? { report: gate.report } : {}),
              ...(gate.status ? { status: gate.status } : {}),
            },
          }
        : null,
    getSourceFile: async () => null,
    putGateResult: async () => {},
    putDerivedArtifact: async () => {},
    getDerivedArtifact: async () => null,
    getKitRegistry: async () => null,
  } as unknown as GamesStore;
  return { gamesStore, stored };
}

async function createApp(store: InMemoryStore, gamesStore?: GamesStore, objectStore?: GcsObjectStore) {
  return await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: secret,
      translator: new NoopTranslator(),
      agentChannel: { ...(gamesStore ? { gamesStore } : {}), ...(objectStore ? { objectStore } : {}) },
    },
  });
}

async function seedJob(store: InMemoryStore) {
  await store.createSubmission(ISSUE, 'g:owner', 'Comet Courier');
  await store.setSubmissionSlug(ISSUE, 'comet-courier');
  await store.setSubmissionLocale(ISSUE, 'en');
  await store.setRoundBuilder(ISSUE, 'self');
  await store.setSubmissionBrief(ISSUE, {
    spec: 'Dodge debris while delivering parcels.',
    qa: ['Tone: cheerful'],
  });
  await store.setSubmissionSeed(ISSUE, {
    slug: 'comet-courier',
    files: [{ path: 'game.ts', content: 'export const seed = true;' }],
    references: [],
    notes: 'continue me',
  });
}

async function seedActiveSelfJob(store: InMemoryStore) {
  await seedJob(store);
  await store.recordJobTransition(ISSUE, {
    to: 'dispatched',
    at: new Date().toISOString(),
    by: 'system',
  });
}

function roundKey(generation = 1, now?: number) {
  return mintAgentToken(ISSUE, secret, { roundGeneration: generation, ...(now !== undefined ? { now } : {}) });
}

async function ensureGameKey(store: InMemoryStore, generation = 1) {
  const at = new Date().toISOString();
  await store.ensureGameAgentKey('comet-courier', 'g:owner', at);
  for (let i = 1; i < generation; i++) {
    await store.rotateGameAgentKey('comet-courier', 'g:owner', at);
  }
}

function gameKey(generation = 1, now?: number) {
  return mintGameAgentKey(secret, {
    slug: 'comet-courier',
    creatorUid: 'g:owner',
    keyGeneration: generation,
    ...(now !== undefined ? { now } : {}),
  });
}

async function mcpCall(
  app: FastifyInstance,
  method: string,
  params?: unknown,
  headers: Record<string, string> = {},
  id: string | number = 1,
) {
  return app.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    payload: { jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) },
  });
}

async function initialize(app: FastifyInstance) {
  const res = await mcpCall(app, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  });
  expect(res.statusCode).toBe(200);
  const sessionId = res.headers['mcp-session-id'];
  expect(typeof sessionId).toBe('string');
  return String(sessionId);
}

function validateValueAgainstSchema(value: unknown, schema: Record<string, unknown>, path = '$'): string[] {
  const errors: string[] = [];
  if (!schema) return errors;

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matches = types.some((type) => {
      if (type === 'string') return typeof value === 'string';
      if (type === 'number') return typeof value === 'number';
      if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
      if (type === 'boolean') return typeof value === 'boolean';
      if (type === 'null') return value === null;
      if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
      if (type === 'array') return Array.isArray(value);
      return true;
    });
    if (!matches) {
      errors.push(
        `${path}: expected type ${JSON.stringify(schema.type)}, got ${typeof value} (${JSON.stringify(value)})`,
      );
      return errors;
    }
  }

  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value as never)) {
      errors.push(`${path}: value ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
    }
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const reqKey of required) {
      if (!(reqKey in obj) || obj[reqKey] === undefined) {
        errors.push(`${path}: missing required property "${reqKey}"`);
      }
    }

    const properties = (schema.properties as Record<string, Record<string, unknown>>) || {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined && properties[key]) {
        errors.push(...validateValueAgainstSchema(val, properties[key]!, `${path}.${key}`));
      }
    }
  }

  if (Array.isArray(value) && schema.items && typeof schema.items === 'object') {
    value.forEach((item, index) => {
      errors.push(...validateValueAgainstSchema(item, schema.items as Record<string, unknown>, `${path}[${index}]`));
    });
  }

  return errors;
}

async function callTool(
  app: FastifyInstance,
  name: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const res = await mcpCall(app, 'tools/call', { name, arguments: args }, headers);
  expect(res.statusCode).toBe(200);
  const body = res.json() as {
    result?: { content?: Array<{ text: string }>; structuredContent?: unknown; isError?: boolean };
    error?: { message: string };
  };
  expect(body.error).toBeUndefined();
  const structured =
    body.result?.structuredContent ??
    (body.result?.content?.[0]?.text ? JSON.parse(body.result.content[0].text) : undefined);
  const isError = Boolean(body.result?.isError);

  if (!isError && structured !== undefined) {
    const listed = await mcpCall(app, 'tools/list', undefined, headers);
    const toolDef = (
      listed.json().result as { tools: Array<{ name: string; outputSchema?: Record<string, unknown> }> }
    )?.tools?.find((t) => t.name === name);
    if (toolDef?.outputSchema) {
      const validationErrors = validateValueAgainstSchema(structured, toolDef.outputSchema, name);
      expect(validationErrors, `Output of ${name} does not match its outputSchema`).toEqual([]);
    }
  }

  return { res, structured, isError };
}

describe('classifyAgentTokenAccess (terminal receipt)', () => {
  it('returns terminal_receipt when generation is exactly one behind', () => {
    const now = Date.now();
    const token = mintAgentToken(1, secret, { roundGeneration: 1, now, ttlDays: 14 });
    const claims = {
      jobId: 1,
      roundGeneration: 1,
      exp: Math.floor(now / 1000) + 14 * 24 * 60 * 60,
    };
    expect(classifyAgentTokenAccess(claims, { roundGeneration: 2 }, now)).toBe('terminal_receipt');
    expect(classifyAgentTokenAccess(claims, { roundGeneration: 1 }, now)).toBe('active');
    expect(() => classifyAgentTokenAccess(claims, { roundGeneration: 3 }, now)).toThrow(STALE_AGENT_TOKEN_REASON);
    void token;
  });
});

describe('POST /api/mcp (BY-05)', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('initialize issues Mcp-Session-Id (transport only) and tools/list exposes the contract', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);

    const sessionId = await initialize(app);
    const listed = await mcpCall(app, 'tools/list', {}, { 'mcp-session-id': sessionId });
    expect(listed.statusCode).toBe(200);
    const names = (listed.json().result.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'start',
        'get_brief',
        'get_seed',
        'get_kit',
        'list_kit_files',
        'search_kit_files',
        'read_kit_file',
        'read_kit_file_fragment',
        'get_sources',
        'list_examples',
        'get_example',
        'report_progress',
        'send_screenshot',
        'submit_sources',
        'get_gate_verdict',
        'read_inbox',
        'ack_inbox',
      ]),
    );
    const tools = listed.json().result.tools as Array<{ name: string; description: string }>;
    const start = tools.find((t) => t.name === 'start');
    expect(start?.description).toMatch(/screenshot|Honour stop|sessionKey/i);
    // start advertises the returned workflow / inbox policy / refusal guidance.
    expect(start?.description).toMatch(/workflow/i);

    // The behavioural contract (on every tool description) now folds in the loop-critical
    // rules: pendingMessages as a non-empty array, no scheduled polling, and that a green
    // verdict ends the round immediately (no post-green tools — key retires).
    expect(start?.description).toMatch(/pendingMessages/);
    expect(start?.description).toMatch(/array is non-empty/i);
    expect(start?.description).toMatch(/do not schedule background/i);
    expect(start?.description).toMatch(
      /green \*publish\* gate verdict ends the round|green publish gate verdict ends the round/i,
    );
    expect(start?.description).toMatch(/END immediately/i);

    const getKit = tools.find((t) => t.name === 'get_kit');
    expect(getKit?.description).toMatch(/gamedevpl-creator-kit/);
    expect(getKit?.description).toMatch(/entry=gamedevpl-creator-kit\/SKILL\.md/);
    expect(getKit?.description).toMatch(/do not assume a `cd` persists/i);
    expect(getKit?.description).toMatch(/list_kit_files|read_kit_file/);
    expect(tools.find((t) => t.name === 'list_kit_files')?.description).toMatch(/prefix|glob/i);
    expect(tools.find((t) => t.name === 'search_kit_files')?.description).toMatch(/substring/i);
    expect(tools.find((t) => t.name === 'read_kit_file')?.description).toMatch(/48 KiB|fragment/i);
    expect(tools.find((t) => t.name === 'read_kit_file_fragment')?.description).toMatch(/lines|bytes/i);

    const gateVerdict = tools.find((t) => t.name === 'get_gate_verdict');
    expect(gateVerdict?.description).toMatch(/2–5 minutes/);
    expect(gateVerdict?.description).toMatch(/~30s/);
    expect(gateVerdict?.description).toMatch(/kit_outdated/);
    expect(gateVerdict?.description).toMatch(/re-run get_kit/);
    expect(gateVerdict?.description).toMatch(/terminal receipt/i);
  });

  it('start issues a sessionKey; subsequent tools work with it', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const key = roundKey();

    const started = await callTool(app, 'start', { key }, { 'mcp-session-id': sessionId });
    expect(started.isError).toBe(false);
    expect(started.structured).toMatchObject({
      jobId: ISSUE,
      slug: 'comet-courier',
      title: 'Comet Courier',
    });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;
    expect(sessionKey).toBeTruthy();
    const claims = verifyMcpSessionKey(sessionKey, secret);
    expect(claims).toMatchObject({ jobId: ISSUE, roundGeneration: 1 });

    const brief = await callTool(app, 'get_brief', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(brief.isError).toBe(false);
    expect(brief.structured).toMatchObject({
      title: 'Comet Courier',
      slug: 'comet-courier',
      seedAvailable: true,
    });
  });

  it('start returns the session workflow in both structuredContent and the text body', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);

    const res = await mcpCall(
      app,
      'tools/call',
      { name: 'start', arguments: { key: roundKey() } },
      {
        'mcp-session-id': sessionId,
      },
    );
    expect(res.statusCode).toBe(200);
    const result = res.json().result as {
      content: Array<{ type: string; text: string }>;
      structuredContent: {
        workflow?: unknown;
        inboxPolicy?: string;
        whenRefused?: string;
      };
    };

    const workflow = result.structuredContent.workflow as string[];
    expect(workflow.length).toBeGreaterThanOrEqual(6);
    const joined = workflow.join('\n');
    expect(joined).toMatch(/get_brief/);
    expect(joined).toMatch(/get_seed/);
    // CP-2: an improvement round has no seed and a brief that is only the change
    // request, so without this step the loop reads as "scaffold from the kit" and an
    // agent following it overwrites the published game it was asked to improve.
    expect(joined).toMatch(/get_sources/);
    expect(joined).toMatch(/available:true/);
    expect(joined).toMatch(/never scaffold over them/i);
    expect(joined).toMatch(/get_kit/);
    expect(joined).toMatch(/list_kit_files|read_kit_file/);
    expect(joined).toMatch(/send_screenshot/);
    expect(joined).toMatch(/submit_sources/);
    expect(joined).toMatch(/mode:\s*"preview"|mode=preview/i);
    expect(joined).toMatch(/mode:\s*"publish"|mode=publish/i);
    expect(joined).toMatch(/get_gate_verdict/);
    // The stop condition is explicit: green means done — END immediately; no post-green
    // tools (key retires; get_gate_verdict may still answer via terminal receipt).
    expect(joined).toMatch(/green \(publish only\): the round is complete/i);
    expect(joined).toMatch(/END the session immediately/i);
    expect(joined).toMatch(/Do not report_progress, read_inbox, or ack after green/i);
    expect(joined).toMatch(/terminal receipt/i);
    // Both failure branches are covered.
    expect(joined).toMatch(/red \/ preview_failed:.*resubmit on the SAME key/i);
    expect(joined).toMatch(/kit_outdated: re-run get_kit/i);

    // Inbox policy: no scheduled polling; drain non-empty pendingMessages from write replies.
    expect(result.structuredContent.inboxPolicy).toMatch(/do not schedule background or recurring inbox checks/i);
    expect(result.structuredContent.inboxPolicy).toMatch(/pendingMessages array is non-empty/i);
    expect(result.structuredContent.inboxPolicy).toMatch(/fresh kickoff/i);

    // The text body mirrors the loop so an agent reading either channel knows it.
    const body = result.content.map((c) => c.text).join('\n');
    expect(body).toMatch(/Session workflow/i);
    expect(body).toMatch(/get_gate_verdict/);
    expect(body).toMatch(/END the session/i);
    expect(body).toMatch(/Inbox:/);
    expect(body).toMatch(/If a call is refused:/i);
  });

  it('retired-key etiquette in start matches the error agents relay on a refused call', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);

    // The guidance start hands the agent: point the creator at the Studio thread, do not
    // call it an outage, note the MCP connection is unchanged.
    const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
    const whenRefused = (started.structured as { whenRefused: string }).whenRefused;
    expect(whenRefused).toMatch(/Studio thread/i);
    expect(whenRefused).toMatch(/current kickoff/i);
    expect(whenRefused).toMatch(/MCP connection/i);
    expect(whenRefused).toMatch(/do not retry|do not report an outage/i);

    // The actual refusal an agent hits when the key is stale names the same fix (Studio
    // thread + fresh prompt), so what the agent relays lines up with what the server says.
    const stale = mintAgentToken(ISSUE, secret, { roundGeneration: 1, now: Date.parse('2020-01-01T00:00:00.000Z') });
    const refused = await callTool(
      app,
      'get_brief',
      {},
      { 'mcp-session-id': sessionId, authorization: `Bearer ${stale}` },
    );
    expect(refused.isError).toBe(true);
    const errorText = JSON.stringify(refused.structured);
    expect(errorText).toContain(STALE_AGENT_TOKEN_REASON);
    expect(STALE_AGENT_TOKEN_REASON).toMatch(/finished/i);
    expect(STALE_AGENT_TOKEN_REASON).toMatch(/Studio thread/i);
    expect(STALE_AGENT_TOKEN_REASON).toMatch(/fresh prompt/i);
  });

  it('rejects a call bearing a valid Mcp-Session-Id but no or a forged sessionKey', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const key = roundKey();
    const started = await callTool(app, 'start', { key }, { 'mcp-session-id': sessionId });
    const realKey = (started.structured as { sessionKey: string }).sessionKey;

    const missing = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: {} },
      },
    });
    expect(missing.statusCode).toBe(401);
    expect(missing.headers['www-authenticate']).toMatch(/resource_metadata="/);

    const forged = mintMcpSessionKey(secret, {
      sessionId,
      jobId: ISSUE,
      roundGeneration: 1,
      now: Date.now(),
      ttlHours: 1,
    });
    // Tamper signature
    const parts = Buffer.from(forged, 'base64url').toString('utf8').split('.');
    parts[4] = 'a'.repeat(64);
    const forgedKey = Buffer.from(parts.join('.'), 'utf8').toString('base64url');
    expect(forgedKey).not.toBe(realKey);

    const bad = await callTool(app, 'get_brief', { sessionKey: forgedKey }, { 'mcp-session-id': sessionId });
    expect(bad.isError).toBe(true);
    expect(JSON.stringify(bad.structured)).toMatch(/invalid sessionKey/i);
    expect(JSON.stringify(bad.structured)).not.toMatch(/finished/i);
  });

  // CP-2 N4: the opener-in-sessionKey-slot refusals name the credential ("this creator
  // key only opens a session via start()"), but the mirror case fell through to
  // "key is required" — which tells an agent nothing was sent when something was.
  it('names the sessionKey when one is offered where start wants an opener', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const sessionKey = mintMcpSessionKey(secret, {
      sessionId,
      jobId: ISSUE,
      roundGeneration: 1,
      now: Date.now(),
      ttlHours: 1,
    });

    for (const attempt of [
      { args: { key: sessionKey }, headers: {} as Record<string, string> },
      { args: {}, headers: { authorization: `Bearer ${sessionKey}` } },
    ]) {
      const { structured, isError } = await callTool(app, 'start', attempt.args, {
        'mcp-session-id': sessionId,
        ...attempt.headers,
      });
      expect(isError).toBe(true);
      const { error } = structured as { error: string };
      expect(error).toMatch(/that is a sessionKey from an earlier start\(\)/i);
      // It must not claim nothing arrived, and must not blame the creator's key.
      expect(error).not.toMatch(/key is required/i);
      expect(error).not.toMatch(/rotated/i);
    }
  });

  // A Bearer game key is recognised everywhere else ("only opens a session via
  // start()"), so start must not answer it with "key is required" — that pair of
  // refusals sends the agent back and forth with no way out.
  it('routes a Bearer game key to the key argument instead of claiming none was sent', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const gameKey = mintGameAgentKey(secret, {
      slug: 'comet-courier',
      creatorUid: 'g:owner',
      keyGeneration: 1,
      now: Date.now(),
    });

    const { structured, isError } = await callTool(
      app,
      'start',
      {},
      { 'mcp-session-id': sessionId, authorization: `Bearer ${gameKey}` },
    );
    expect(isError).toBe(true);
    const { error } = structured as { error: string };
    expect(error).toMatch(/key argument/i);
    expect(error).not.toMatch(/key is required/i);
  });

  it('rejects an expired sessionKey', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const past = Date.parse('2020-01-01T00:00:00.000Z');
    const expired = mintMcpSessionKey(secret, {
      sessionId,
      jobId: ISSUE,
      roundGeneration: 1,
      now: past,
      ttlHours: 1,
    });
    const res = await callTool(app, 'get_brief', { sessionKey: expired }, { 'mcp-session-id': sessionId });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.structured)).toContain('finished');
  });

  it('accepts a valid sessionKey even when Mcp-Session-Id has drifted', async () => {
    // ChatGPT Apps (and Cloud Run multi-instance) often present a different correlator
    // than the one start() embedded. The sessionKey is the capability; the header is not.
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionA = await initialize(app);
    const sessionB = await initialize(app);
    const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionA });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const brief = await callTool(app, 'get_brief', { sessionKey }, { 'mcp-session-id': sessionB });
    expect(brief.isError).toBe(false);
    expect(brief.structured).toMatchObject({ title: 'Comet Courier' });
  });

  it('binds start to the client Mcp-Session-Id even when this instance never saw initialize', async () => {
    // Simulate multi-instance: client sends a well-formed id that is not in our local map.
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const foreignSessionId = 'abcdef0123456789abcdef0123456789abcd';
    const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': foreignSessionId });
    expect(started.isError).toBe(false);
    expect(started.structured).toMatchObject({ sessionId: foreignSessionId });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const brief = await callTool(app, 'get_brief', { sessionKey }, { 'mcp-session-id': foreignSessionId });
    expect(brief.isError).toBe(false);
    expect(brief.structured).toMatchObject({ title: 'Comet Courier' });
  });

  it('reaches /api/mcp through the private-beta wall without a site session', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await buildApp({
      store,
      betaAllowedUids: 'g:anyone',
      sessionSecret: 'dev-session-secret-change-me',
      submissionRoutes: {
        githubClient: stubGitHub(),
        githubToken: 'gh-token',
        submissionTokenSecret: secret,
        translator: new NoopTranslator(),
        agentChannel: {},
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: { 'content-type': 'application/json' },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'beta-wall-test', version: '0' },
        },
      },
    });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ jsonrpc: '2.0', id: 1 });
  });

  it('Bearer mode authenticates tools without sessionKey', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const brief = await callTool(
      app,
      'get_brief',
      {},
      { 'mcp-session-id': sessionId, authorization: `Bearer ${roundKey()}` },
    );
    expect(brief.isError).toBe(false);
    expect(brief.structured).toMatchObject({ title: 'Comet Courier' });
  });

  // Codex P2 on #504: preferring sessionKey over a valid round Bearer broke reconnects
  // that still had a stale sessionKey in tool args from an earlier transport session.
  it('round Bearer still wins when a stale mismatched sessionKey is also present', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionA = await initialize(app);
    const sessionB = await initialize(app);
    const staleKey = mintMcpSessionKey(secret, {
      sessionId: sessionA,
      jobId: ISSUE,
      roundGeneration: 1,
    });

    const brief = await callTool(
      app,
      'get_brief',
      { sessionKey: staleKey },
      { 'mcp-session-id': sessionB, authorization: `Bearer ${roundKey()}` },
    );
    expect(brief.isError).toBe(false);
    expect(brief.structured).toMatchObject({ title: 'Comet Courier' });
  });

  it('piggybacks stop and pendingMessages on every write including ack_inbox', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const msg = await store.appendCreatorMessage(ISSUE, 'Make it faster');
    app = await createApp(store);
    const sessionId = await initialize(app);
    const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const progress = await callTool(
      app,
      'report_progress',
      { sessionKey, text: 'Wiring the ship.', step: 'mechanics' },
      { 'mcp-session-id': sessionId },
    );
    expect(progress.structured).toMatchObject({
      stop: false,
      pendingMessages: [expect.objectContaining({ text: 'Make it faster' })],
    });
    // Soft nudge while creator notes are waiting — never isError.
    expect(progress.isError).toBe(false);
    expect((progress.structured as { warnings?: Array<{ code: string }> }).warnings?.map((w) => w.code)).toContain(
      'inbox_pending',
    );

    const acked = await callTool(app, 'ack_inbox', { sessionKey, ids: [msg.id] }, { 'mcp-session-id': sessionId });
    expect(acked.structured).toMatchObject({
      ok: true,
      stop: false,
      pendingMessages: [],
    });
    // stop/pendingMessages keys must be present on the write reply.
    expect(acked.structured).toHaveProperty('stop');
    expect(acked.structured).toHaveProperty('pendingMessages');
  });

  it('soft-nudges progress_stale after several tools without report_progress', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    let last: { structured: unknown; isError: boolean } | undefined;
    for (let i = 0; i < 6; i += 1) {
      last = await callTool(app, 'list_examples', { sessionKey }, { 'mcp-session-id': sessionId });
      expect(last.isError).toBe(false);
    }
    const warnings = (last?.structured as { warnings?: Array<{ code: string; message: string }> }).warnings ?? [];
    expect(warnings.map((w) => w.code)).toContain('progress_stale');
    expect(warnings.find((w) => w.code === 'progress_stale')?.message).toMatch(/report_progress/);

    const progress = await callTool(
      app,
      'report_progress',
      { sessionKey, text: 'Still building.', step: 'mechanics' },
      { 'mcp-session-id': sessionId },
    );
    expect(progress.isError).toBe(false);
    const cleared = await callTool(app, 'list_examples', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(
      ((cleared.structured as { warnings?: Array<{ code: string }> }).warnings ?? []).map((w) => w.code),
    ).not.toContain('progress_stale');
  });

  it('piggybacks pendingMessages on kit/browse-style reads and warns inbox_pending', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    await store.appendCreatorMessage(ISSUE, 'Add a power-up');
    app = await createApp(store);
    const sessionId = await initialize(app);
    const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    // list_examples is a hot read — should carry inbox piggyback without a separate read_inbox.
    const examples = await callTool(app, 'list_examples', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(examples.isError).toBe(false);
    expect(examples.structured).toMatchObject({
      pendingMessages: [expect.objectContaining({ text: 'Add a power-up' })],
      warnings: [expect.objectContaining({ code: 'inbox_pending' })],
    });
  });

  it('rejects oversized screenshots at the MCP layer', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    // Over the Firestore-safe decoded ceiling, under the MCP bodyLimit.
    const huge = Buffer.alloc(800 * 1024, 1).toString('base64');
    const res = await callTool(app, 'send_screenshot', { sessionKey, png: huge }, { 'mcp-session-id': sessionId });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.structured)).toMatch(/too large/i);
  });

  it('accepts a small screenshot via send_screenshot', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const res = await callTool(
      app,
      'send_screenshot',
      { sessionKey, png: TINY_PNG, caption: 'first frame' },
      { 'mcp-session-id': sessionId },
    );
    expect(res.isError).toBe(false);
    expect(res.structured).toMatchObject({ ok: true, stop: false });
  });

  it('rate-limits unauthenticated / invalid start attempts', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);

    let last: { isError: boolean; structured: unknown } | null = null;
    for (let i = 0; i < 25; i++) {
      last = await callTool(app, 'start', { key: 'not-a-real-key' }, { 'mcp-session-id': sessionId });
    }
    expect(last?.isError).toBe(true);
    expect(JSON.stringify(last?.structured)).toMatch(/too many invalid start/i);
  });

  it('scripted client: start → brief → seed → submit → verdict', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const { gamesStore } = stubGamesStore({
      green: false,
      report: 'Check 1 failed\nfix the spawn',
    });
    app = await createApp(store, gamesStore);
    const sessionId = await initialize(app);
    const key = roundKey();

    const started = await callTool(app, 'start', { key }, { 'mcp-session-id': sessionId });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const brief = await callTool(app, 'get_brief', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(brief.structured).toMatchObject({ seedAvailable: true, slug: 'comet-courier' });

    const seed = await callTool(app, 'get_seed', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(seed.structured).toMatchObject({ available: true });

    const submitted = await callTool(
      app,
      'submit_sources',
      {
        sessionKey,
        kitEngineRef: ENGINE,
        files: MINIMAL_FILES.map((f) => ({ ...f, encoding: 'utf8' })),
      },
      { 'mcp-session-id': sessionId },
    );
    expect(submitted.isError).toBe(false);
    expect(submitted.structured).toMatchObject({
      ok: true,
      deliveryId: 'v1',
      stop: false,
      pendingMessages: expect.any(Array),
    });

    // Gate red keeps the round open — verdict readable on the active key.
    await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
    const verdict = await callTool(app, 'get_gate_verdict', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(verdict.isError).toBe(false);
    expect(verdict.structured).toMatchObject({ status: 'red', deliveryId: 'v1' });
  });

  describe('terminal receipt (generation one behind) on all three transports', () => {
    async function closeRoundGreen(store: InMemoryStore, gamesStore: GamesStore) {
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      await store.recordJobTransition(ISSUE, {
        to: 'submitted',
        at: '2026-08-01T11:00:00.000Z',
        by: 'agent',
        reason: 'sources_delivered',
      });
      // ready_for_review closes the round and bumps generation 1 → 2.
      await store.recordJobTransition(ISSUE, {
        to: 'ready_for_review',
        at: '2026-08-01T12:00:00.000Z',
        by: 'gate',
        reason: 'gate_green',
      });
      expect((await store.getSubmission(ISSUE))?.roundGeneration).toBe(2);
      void gamesStore;
    }

    it('sessionKey: get_gate_verdict still readable; writes rejected', async () => {
      const store = new InMemoryStore();
      await seedJob(store);
      const { gamesStore } = stubGamesStore({ green: true, ranAt: '2026-08-01T12:00:00.000Z' });
      app = await createApp(store, gamesStore);
      const sessionId = await initialize(app);

      const started = await callTool(app, 'start', { key: roundKey(1) }, { 'mcp-session-id': sessionId });
      const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

      await closeRoundGreen(store, gamesStore);

      const verdict = await callTool(app, 'get_gate_verdict', { sessionKey }, { 'mcp-session-id': sessionId });
      expect(verdict.isError).toBe(false);
      expect(verdict.structured).toMatchObject({ status: 'green', deliveryId: 'v1', access: 'terminal_receipt' });

      const write = await callTool(
        app,
        'report_progress',
        { sessionKey, text: 'still going' },
        { 'mcp-session-id': sessionId },
      );
      expect(write.isError).toBe(true);
      expect(JSON.stringify(write.structured)).toContain('finished');

      const brief = await callTool(app, 'get_brief', { sessionKey }, { 'mcp-session-id': sessionId });
      expect(brief.isError).toBe(true);
    });

    it('Bearer: get_gate_verdict still readable; writes rejected', async () => {
      const store = new InMemoryStore();
      await seedJob(store);
      const { gamesStore } = stubGamesStore({ green: true });
      app = await createApp(store, gamesStore);
      const sessionId = await initialize(app);
      const bearer = roundKey(1);
      await closeRoundGreen(store, gamesStore);

      const verdict = await callTool(
        app,
        'get_gate_verdict',
        {},
        { 'mcp-session-id': sessionId, authorization: `Bearer ${bearer}` },
      );
      expect(verdict.isError).toBe(false);
      expect(verdict.structured).toMatchObject({ status: 'green', access: 'terminal_receipt' });

      const write = await callTool(
        app,
        'report_progress',
        { text: 'nope' },
        { 'mcp-session-id': sessionId, authorization: `Bearer ${bearer}` },
      );
      expect(write.isError).toBe(true);
    });

    it('plain HTTP: GET /api/agent/build/gate readable; other channel routes rejected', async () => {
      const store = new InMemoryStore();
      await seedJob(store);
      const { gamesStore } = stubGamesStore({ green: true });
      app = await createApp(store, gamesStore);
      const bearer = roundKey(1);
      await closeRoundGreen(store, gamesStore);

      const gate = await app.inject({
        method: 'GET',
        url: '/api/agent/build/gate',
        headers: { authorization: `Bearer ${bearer}` },
      });
      expect(gate.statusCode).toBe(200);
      expect(gate.json()).toMatchObject({ status: 'green', deliveryId: 'v1', access: 'terminal_receipt' });

      const brief = await app.inject({
        method: 'GET',
        url: '/api/agent/build/brief',
        headers: { authorization: `Bearer ${bearer}` },
      });
      expect(brief.statusCode).toBe(401);
      expect(brief.json().error).toBe(STALE_AGENT_TOKEN_REASON);

      const progress = await app.inject({
        method: 'POST',
        url: '/api/agent/build/progress',
        headers: { authorization: `Bearer ${bearer}` },
        payload: { text: 'nope' },
      });
      expect(progress.statusCode).toBe(401);
    });
  });

  it('DELETE tombstones the correlator so it is not re-adopted on this instance', async () => {
    // Multi-instance still cannot share tombstones, but on the instance that saw DELETE
    // a concurrent/retry POST must not resurrect the terminated id (Codex P2).
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);

    const del = await app.inject({
      method: 'DELETE',
      url: '/api/mcp',
      headers: { 'mcp-session-id': sessionId },
    });
    expect(del.statusCode).toBe(204);

    const listed = await mcpCall(app, 'tools/list', {}, { 'mcp-session-id': sessionId });
    expect(listed.statusCode).toBe(404);
  });

  it('still adopts a well-formed correlator this instance never initialized or terminated', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const foreignSessionId = 'fedcba9876543210fedcba9876543210fedc';

    const listed = await mcpCall(app, 'tools/list', {}, { 'mcp-session-id': foreignSessionId });
    expect(listed.statusCode).toBe(200);
  });

  it('list_examples and get_sources wrap the channel', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const { gamesStore } = stubGamesStore();
    app = await createApp(store, gamesStore);
    const sessionId = await initialize(app);
    const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const examples = await callTool(app, 'list_examples', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(examples.isError).toBe(false);
    expect(examples.structured).toHaveProperty('examples');

    const sources = await callTool(app, 'get_sources', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(sources.isError).toBe(false);
    expect(sources.structured).toMatchObject({ available: false, files: [] });
  });

  it('rejects submit_sources without kitEngineRef', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const { gamesStore } = stubGamesStore();
    app = await createApp(store, gamesStore);
    const sessionId = await initialize(app);
    const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const res = await callTool(
      app,
      'submit_sources',
      { sessionKey, files: MINIMAL_FILES },
      { 'mcp-session-id': sessionId },
    );
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.structured)).toMatch(/kitEngineRef/i);
  });

  it('terminal receipt after deliver-without-progress: readable on all three transports', async () => {
    // Full assembled-app sequence (not a hard-set generation delta): queued self job →
    // MCP submit_sources with no report_progress → gate-green closes once → receipt.
    const store = new InMemoryStore();
    await seedJob(store);
    await store.recordJobTransition(ISSUE, {
      to: 'queued',
      at: '2026-08-01T11:00:00.000Z',
      by: 'creator',
      reason: 'submitted',
    });
    await store.recordDispatch(ISSUE, { backend: 'self', ref: `self:${ISSUE}` });
    expect((await store.getSubmission(ISSUE))?.state).toBe('queued');

    const { gamesStore } = stubGamesStore({ green: true, ranAt: '2026-08-01T12:30:00.000Z' });
    app = await createApp(store, gamesStore);
    const sessionId = await initialize(app);
    const originalKey = roundKey(1);

    const started = await callTool(app, 'start', { key: originalKey }, { 'mcp-session-id': sessionId });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const submitted = await callTool(
      app,
      'submit_sources',
      {
        sessionKey,
        kitEngineRef: ENGINE,
        files: MINIMAL_FILES.map((f) => ({ ...f, encoding: 'utf8' })),
      },
      { 'mcp-session-id': sessionId },
    );
    expect(submitted.isError).toBe(false);
    expect((await store.getSubmission(ISSUE))?.state).toBe('submitted');
    expect((await store.getSubmission(ISSUE))?.roundGeneration).toBe(1);

    await store.recordJobTransition(ISSUE, {
      to: 'ready_for_review',
      at: '2026-08-01T12:30:00.000Z',
      by: 'gate',
      reason: 'gate_green',
    });
    expect((await store.getSubmission(ISSUE))?.roundGeneration).toBe(2);

    const viaSession = await callTool(app, 'get_gate_verdict', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(viaSession.isError).toBe(false);
    expect(viaSession.structured).toMatchObject({
      status: 'green',
      deliveryId: 'v1',
      access: 'terminal_receipt',
    });

    const viaBearer = await callTool(
      app,
      'get_gate_verdict',
      {},
      { 'mcp-session-id': sessionId, authorization: `Bearer ${originalKey}` },
    );
    expect(viaBearer.isError).toBe(false);
    expect(viaBearer.structured).toMatchObject({ status: 'green', access: 'terminal_receipt' });

    const viaHttp = await app.inject({
      method: 'GET',
      url: '/api/agent/build/gate',
      headers: { authorization: `Bearer ${originalKey}` },
    });
    expect(viaHttp.statusCode).toBe(200);
    expect(viaHttp.json()).toMatchObject({ status: 'green', deliveryId: 'v1', access: 'terminal_receipt' });

    const write = await callTool(
      app,
      'report_progress',
      { sessionKey, text: 'should not write' },
      { 'mcp-session-id': sessionId },
    );
    expect(write.isError).toBe(true);

    const brief = await callTool(app, 'get_brief', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(brief.isError).toBe(true);
  });

  it('start with a durable per-game key works', async () => {
    const store = new InMemoryStore();
    await seedActiveSelfJob(store);
    await ensureGameKey(store);
    app = await createApp(store);
    const sessionId = await initialize(app);

    const started = await callTool(app, 'start', { key: gameKey() }, { 'mcp-session-id': sessionId });
    expect(started.isError).toBe(false);
    expect(started.structured).toMatchObject({
      jobId: ISSUE,
      slug: 'comet-courier',
      title: 'Comet Courier',
    });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;
    const brief = await callTool(app, 'get_brief', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(brief.isError).toBe(false);
  });

  it('durable key still starts a new active round after the previous round closes', async () => {
    const store = new InMemoryStore();
    await seedActiveSelfJob(store);
    await ensureGameKey(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const durable = gameKey();

    const first = await callTool(app, 'start', { key: durable }, { 'mcp-session-id': sessionId });
    expect(first.isError).toBe(false);

    await store.recordJobTransition(ISSUE, {
      to: 'ready_for_review',
      at: '2026-08-01T12:00:00.000Z',
      by: 'gate',
      reason: 'gate_green',
    });
    expect((await store.getSubmission(ISSUE))?.roundGeneration).toBe(2);

    const NEXT_ISSUE = 56;
    await store.createSubmission(NEXT_ISSUE, 'g:owner', 'Comet Courier v2');
    await store.setSubmissionSlug(NEXT_ISSUE, 'comet-courier');
    await store.setRoundBuilder(NEXT_ISSUE, 'self');
    await store.recordJobTransition(NEXT_ISSUE, {
      to: 'dispatched',
      at: '2026-08-02T12:00:00.000Z',
      by: 'system',
    });
    await store.ensureRoundGeneration(NEXT_ISSUE);

    const keyRecord = await store.getGameAgentKey('comet-courier');
    expect(keyRecord?.keyGeneration).toBe(1);

    const second = await callTool(app, 'start', { key: durable }, { 'mcp-session-id': sessionId });
    expect(second.isError).toBe(false);
    expect(second.structured).toMatchObject({ jobId: NEXT_ISSUE, slug: 'comet-courier' });
  });

  it('rejects a durable game key on write tools', async () => {
    const store = new InMemoryStore();
    await seedActiveSelfJob(store);
    await ensureGameKey(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const durable = gameKey();

    const viaSessionKey = await callTool(
      app,
      'report_progress',
      { sessionKey: durable, text: 'nope' },
      { 'mcp-session-id': sessionId },
    );
    expect(viaSessionKey.isError).toBe(true);
    expect(JSON.stringify(viaSessionKey.structured)).toMatch(/only opens a session via start/i);

    const viaBearer = await callTool(
      app,
      'report_progress',
      { text: 'nope' },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${durable}` },
    );
    expect(viaBearer.isError).toBe(true);
    expect(JSON.stringify(viaBearer.structured)).toMatch(/only opens a session via start/i);
  });

  it('legacy round-scoped key still works end-to-end on start', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const legacy = roundKey();

    const started = await callTool(app, 'start', { key: legacy }, { 'mcp-session-id': sessionId });
    expect(started.isError).toBe(false);
    expect(started.structured).toMatchObject({ jobId: ISSUE, slug: 'comet-courier' });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;
    const progress = await callTool(
      app,
      'report_progress',
      { sessionKey, text: 'legacy path ok' },
      { 'mcp-session-id': sessionId },
    );
    expect(progress.isError).toBe(false);
  });

  // Every client reads this before it sees a tool. It described the pre-BYOCA model —
  // "using the key from the creator's Studio kickoff prompt" — which is exactly what a
  // creator key removes, so the first thing a keyless client was told was to go find a
  // key that no longer exists in the prompt.
  it('initialize tells a creator-key client to pass only a slug', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);

    const res = await mcpCall(app, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    const instructions = (res.json().result as { instructions: string }).instructions;

    // A client following these instructions for a brand-new game must not be sent to
    // start, which needs a slug that does not exist yet — the dead end create_game exists
    // to remove.
    expect(instructions).toMatch(/create_game first/i);
    expect(instructions).toMatch(/creator key/i);
    expect(instructions).toMatch(/only the game slug/i);
    // The kickoff-prompt key is still real, but it is the alternative, not the default.
    expect(instructions).not.toMatch(/Start with the gamedevpl start tool using the key/i);
    // The rest of the loop must survive the rewrite.
    expect(instructions).toMatch(/sessionKey/);
    expect(instructions).toMatch(/get_gate_verdict/);
    expect(instructions).toMatch(/honour stop/i);
  });

  // CP-2: an agent that guessed `phase`/`message` got the channel's bare
  // {"error":"Required"} — which names neither the missing field nor the real ones.
  // The tool declared `text` required and then forwarded whatever arrived.
  it('names the fields when report_progress is called with the wrong ones', async () => {
    const store = new InMemoryStore();
    await seedActiveSelfJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);
    const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const wrong = await callTool(
      app,
      'report_progress',
      { sessionKey, phase: 'planning', message: 'thinking' },
      { 'mcp-session-id': sessionId },
    );
    expect(wrong.isError).toBe(true);
    const { error } = wrong.structured as { error: string };
    expect(error).toMatch(/report_progress needs text/i);
    expect(error).toMatch(/step \(one of/i);
    expect(error).not.toBe('Required');

    const badStep = await callTool(
      app,
      'report_progress',
      { sessionKey, step: 'vibing', text: 'ok' },
      { 'mcp-session-id': sessionId },
    );
    expect(badStep.isError).toBe(true);
    expect((badStep.structured as { error: string }).error).toMatch(/step must be one of/i);

    // The declared shape still works.
    const good = await callTool(
      app,
      'report_progress',
      { sessionKey, step: 'planning', text: 'ok' },
      { 'mcp-session-id': sessionId },
    );
    expect(good.isError).toBe(false);
  });

  it('documents that Mcp-Session-Id is a correlator and start() rebinds if lost', async () => {
    const store = new InMemoryStore();
    await seedActiveSelfJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);

    const res = await mcpCall(app, 'tools/list', undefined, { 'mcp-session-id': sessionId });
    const tools = (
      res.json().result as {
        tools: Array<{ name: string; inputSchema: { properties?: Record<string, { description?: string }> } }>;
      }
    ).tools;
    const brief = tools.find((tool) => tool.name === 'get_brief');
    const described = brief?.inputSchema.properties?.sessionKey?.description ?? '';

    expect(described).toMatch(/correlator|never authority/i);
    expect(described).toMatch(/call start\(\) again/i);
  });

  // ChatGPT badged read-only tools DESTRUCTIVE, because MCP's defaults are not "unknown":
  // an un-annotated tool reads as readOnlyHint:false + destructiveHint:true. Nothing here
  // deletes anything.
  it('annotates every tool, so a reader is not advertised as destructive', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);

    const res = await mcpCall(app, 'tools/list', undefined, { 'mcp-session-id': sessionId });
    const tools = (
      res.json().result as {
        tools: Array<{
          name: string;
          annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean };
          outputSchema?: { type?: string };
        }>;
      }
    ).tools;

    // No tool may go out unannotated — that is what produced the badge.
    for (const tool of tools) {
      expect(tool.annotations, `${tool.name} has no annotations`).toBeTruthy();
      expect(tool.annotations?.title, `${tool.name} has no title`).toBeTruthy();
      expect(typeof tool.annotations?.destructiveHint, `${tool.name} has no destructiveHint`).toBe('boolean');
    }

    // `destructiveHint: false` is a claim that the tool is purely *additive*, and a
    // client may skip its approval prompt on that basis — so a tool that consumes a
    // capped delivery, moves the pointer deciding what publishes, or makes creator
    // messages stop appearing has to say so, even though nothing is erased.
    for (const name of ['submit_sources', 'ack_inbox']) {
      expect(tools.find((tool) => tool.name === name)?.annotations?.destructiveHint, name).toBe(true);
    }
    for (const name of ['get_brief', 'list_examples', 'start', 'open_round', 'continue_draft', 'report_progress']) {
      expect(tools.find((tool) => tool.name === name)?.annotations?.destructiveHint, name).toBe(false);
    }

    const readers = [
      'get_brief',
      'get_seed',
      'get_kit',
      'list_kit_files',
      'search_kit_files',
      'read_kit_file',
      'read_kit_file_fragment',
      'get_sources',
      'list_examples',
      'get_example',
      'read_inbox',
    ];
    for (const name of readers) {
      expect(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, name).toBe(true);
    }
    const writers = [
      'start',
      'open_round',
      'continue_draft',
      'report_progress',
      'send_screenshot',
      'submit_sources',
      'ack_inbox',
    ];
    for (const name of writers) {
      expect(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, name).toBe(false);
    }
  });

  it('declares an outputSchema for every tool', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await createApp(store);
    const sessionId = await initialize(app);

    const res = await mcpCall(app, 'tools/list', undefined, { 'mcp-session-id': sessionId });
    const tools = (res.json().result as { tools: Array<{ name: string; outputSchema?: { type?: string } }> }).tools;

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.outputSchema?.type, tool.name).toBe('object');
    }
    const startSchema = tools.find((tool) => tool.name === 'start')?.outputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(startSchema.properties?.sessionKey).toBeTruthy();
    expect(startSchema.required).toContain('sessionKey');
  });
  describe('get_gate_media (BY-28)', () => {
    const MEDIA_METADATA = JSON.stringify({
      captures: { opening: { file: 'opening.png' } },
      video: { file: 'gameplay.mp4' },
    });

    /** A gate run that stored one frame and a video for delivery v1. */
    function mediaGamesStore(green = true) {
      const artifacts = new Map<string, Buffer>([
        ['media/metadata.json', Buffer.from(MEDIA_METADATA)],
        ['media/opening.png', Buffer.from(TINY_PNG, 'base64')],
        ['media/gameplay.mp4', Buffer.from('mp4-bytes')],
      ]);
      return {
        getManifest: async (slug: string, version: string) =>
          slug === 'comet-courier' && version === 'v1'
            ? // issueNumber is the ownership check the route makes — a slug is shared
              // by every improvement round on the same game.
              { slug, version, issueNumber: ISSUE, gate: { green, ranAt: '2026-08-01T12:00:00.000Z' } }
            : null,
        getDerivedArtifact: async (slug: string, version: string, name: string) =>
          slug === 'comet-courier' && version === 'v1' ? (artifacts.get(name) ?? null) : null,
        getSourceFile: async () => null,
        putCandidateSources: async () => ({ version: 'v1', manifest: {} as never }),
        putGateResult: async () => {},
        putDerivedArtifact: async () => {},
        getKitRegistry: async () => null,
      } as unknown as GamesStore;
    }

    function mediaObjectStore(): GcsObjectStore {
      return {
        readObject: async () => null,
        objectExists: async () => true,
        signReadUrl: async (name: string) => `https://signed.example/${name}?sig=1`,
      };
    }

    it('returns signed media and attaches the opening frame as an image block', async () => {
      // The whole point of the tool: a client that cannot run the game gets something
      // it can look at and something it can show the creator.
      const store = new InMemoryStore();
      await seedJob(store);
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      app = await createApp(store, mediaGamesStore(), mediaObjectStore());
      const sessionId = await initialize(app);
      const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
      const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

      const res = await mcpCall(
        app,
        'tools/call',
        { name: 'get_gate_media', arguments: { sessionKey } },
        { 'mcp-session-id': sessionId },
      );
      expect(res.statusCode).toBe(200);
      const result = res.json().result as {
        content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
        structuredContent: {
          available: boolean;
          deliveryId: string;
          screenshots: Array<{ file: string; url: string }>;
          video: { file: string; url: string };
          frames?: Array<{ file: string; name: string; attached: boolean }>;
        };
        isError?: boolean;
      };
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({
        available: true,
        deliveryId: 'v1',
        screenshots: [
          {
            file: 'opening.png',
            url: 'https://signed.example/games/comet-courier/versions/v1/media/opening.png?sig=1',
          },
        ],
        video: {
          file: 'gameplay.mp4',
          url: 'https://signed.example/games/comet-courier/versions/v1/media/gameplay.mp4?sig=1',
        },
        frames: [{ file: 'opening.png', name: 'opening', attached: true }],
      });

      const image = result.content.find((part) => part.type === 'image');
      expect(image).toMatchObject({ mimeType: 'image/png', data: TINY_PNG });
      // The frame rides the image block only — duplicating it into the JSON body would
      // put the same base64 into every client's context twice.
      const text = result.content.find((part) => part.type === 'text')?.text ?? '';
      expect(text).not.toContain(TINY_PNG);
    });

    it('keeps the opening image when session nudges add warnings', async () => {
      // applySessionNudges must not rebuild via toolOk alone — that dropped image blocks.
      const store = new InMemoryStore();
      await seedJob(store);
      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      app = await createApp(store, mediaGamesStore(), mediaObjectStore());
      const sessionId = await initialize(app);
      const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
      const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

      for (let i = 0; i < 6; i += 1) {
        await callTool(app, 'list_examples', { sessionKey }, { 'mcp-session-id': sessionId });
      }

      const res = await mcpCall(
        app,
        'tools/call',
        // frames=all so this covers the plural case too: the nudge rebuild must keep
        // *every* image block, not merely the first one.
        { name: 'get_gate_media', arguments: { sessionKey, frames: 'all' } },
        { 'mcp-session-id': sessionId },
      );
      expect(res.statusCode).toBe(200);
      const result = res.json().result as {
        content: Array<{ type: string; data?: string; mimeType?: string }>;
        structuredContent: { warnings?: Array<{ code: string }>; frames?: Array<{ attached: boolean }> };
        isError?: boolean;
      };
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent.warnings?.map((w) => w.code)).toContain('progress_stale');
      expect(result.structuredContent.frames?.every((frame) => frame.attached)).toBe(true);
      const images = result.content.filter((part) => part.type === 'image');
      expect(images).toHaveLength(result.structuredContent.frames?.length ?? 0);
      expect(images[0]).toMatchObject({ mimeType: 'image/png', data: TINY_PNG });
    });

    it('reports available:false instead of erroring before anything is delivered', async () => {
      const store = new InMemoryStore();
      await seedJob(store);
      app = await createApp(store, mediaGamesStore(), mediaObjectStore());
      const sessionId = await initialize(app);
      const started = await callTool(app, 'start', { key: roundKey() }, { 'mcp-session-id': sessionId });
      const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

      const media = await callTool(app, 'get_gate_media', { sessionKey }, { 'mcp-session-id': sessionId });
      expect(media.isError).toBe(false);
      expect(media.structured).toMatchObject({ available: false, deliveryId: null });
    });

    it('stays readable on the terminal receipt after green closes the round', async () => {
      // Post-green is exactly when the agent wants the frames — the round it just
      // finished is the one that produced them.
      const store = new InMemoryStore();
      await seedJob(store);
      const gamesStore = mediaGamesStore();
      app = await createApp(store, gamesStore, mediaObjectStore());
      const sessionId = await initialize(app);
      const originalKey = roundKey(1);
      const started = await callTool(app, 'start', { key: originalKey }, { 'mcp-session-id': sessionId });
      const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

      await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
      await store.recordJobTransition(ISSUE, {
        to: 'submitted',
        at: '2026-08-01T11:00:00.000Z',
        by: 'agent',
        reason: 'sources_delivered',
      });
      await store.recordJobTransition(ISSUE, {
        to: 'ready_for_review',
        at: '2026-08-01T12:00:00.000Z',
        by: 'gate',
        reason: 'gate_green',
      });
      expect((await store.getSubmission(ISSUE))?.roundGeneration).toBe(2);

      const viaSession = await callTool(app, 'get_gate_media', { sessionKey }, { 'mcp-session-id': sessionId });
      expect(viaSession.isError).toBe(false);
      expect(viaSession.structured).toMatchObject({ available: true, access: 'terminal_receipt' });

      const viaBearer = await callTool(
        app,
        'get_gate_media',
        {},
        { 'mcp-session-id': sessionId, authorization: `Bearer ${originalKey}` },
      );
      expect(viaBearer.isError).toBe(false);
      expect(viaBearer.structured).toMatchObject({ available: true, access: 'terminal_receipt' });

      // The receipt is not a general read grant: other reads still reject.
      const brief = await callTool(app, 'get_brief', { sessionKey }, { 'mcp-session-id': sessionId });
      expect(brief.isError).toBe(true);
    });

    it('is advertised as a read, not a destructive tool', async () => {
      const store = new InMemoryStore();
      await seedJob(store);
      app = await createApp(store);
      const sessionId = await initialize(app);

      const listed = await mcpCall(app, 'tools/list', {}, { 'mcp-session-id': sessionId });
      const tools = listed.json().result.tools as Array<{
        name: string;
        description: string;
        annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
      }>;
      const media = tools.find((tool) => tool.name === 'get_gate_media');
      expect(media?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      // The description has to carry why an agent would call it — descriptions are the
      // one prompt surface every client reads.
      expect(media?.description).toMatch(/screenshot/i);
      expect(media?.description).toMatch(/video|mp4/i);
    });
  });
});
