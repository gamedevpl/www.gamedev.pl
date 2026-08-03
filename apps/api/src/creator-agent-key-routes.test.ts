import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCreatorAgentKeyActive,
  DEFAULT_CREATOR_AGENT_KEY_TTL_DAYS,
  looksLikeCreatorAgentKey,
  verifyCreatorAgentKey,
} from './agent-creator-key.js';
import { NO_OPEN_ROUND_REASON, PLATFORM_ROUND_REASON, SLUG_NOT_ON_ACCOUNT_REASON } from './agent-game-key.js';
import { mintGameAgentKey } from './agent-game-key.js';
import { mintAgentToken } from './agent-token.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { buildApp } from './app.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './github-client.js';
import { mintMcpSessionKey } from './mcp-session-key.js';
import { pkceChallengeS256 } from './oauth-pkce.js';
import { InMemoryStore } from './store.js';
import type { CreatorAgentKeyRecord } from './store.js';
import { NoopTranslator } from './translate.js';

const secret = 'creator-agent-routes-secret';
const sessionSecret = 'dev-session-secret-change-me';
const OWNER = 'g:owner';
const OTHER = 'g:other';
const SLUG = 'jagged-alliance';
const CONCEPT = 'A tactics game about careful timing and cover.';

function stubGitHub(): GitHubClient {
  return {
    createIssue: async () => ({ number: 1 }),
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

async function createApp(store: InMemoryStore) {
  await store.upsertUser({ uid: OWNER, email: 'o@example.com', betaStatus: 'approved' });
  await store.upsertUser({ uid: OTHER, email: 'x@example.com', betaStatus: 'approved' });
  return buildApp({
    store,
    sessionSecret,
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh',
      submissionTokenSecret: secret,
      translator: new NoopTranslator(),
    },
  });
}

function authHeaders(uid = OWNER) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

async function mcpCall(app: FastifyInstance, method: string, params?: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    payload: { jsonrpc: '2.0', id: 1, method, ...(params !== undefined ? { params } : {}) },
  });
}

async function callStart(app: FastifyInstance, args: Record<string, unknown>, headers: Record<string, string> = {}) {
  const init = await mcpCall(app, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  });
  const sessionId = init.headers['mcp-session-id'] as string;
  const res = await mcpCall(
    app,
    'tools/call',
    { name: 'start', arguments: args },
    { ...headers, 'mcp-session-id': sessionId },
  );
  const body = res.json() as {
    result?: {
      isError?: boolean;
      structuredContent?: { sessionKey?: string; jobId?: number };
      content?: Array<{ text: string }>;
    };
  };
  const structured =
    body.result?.structuredContent ??
    (body.result?.content?.[0]?.text ? JSON.parse(body.result.content[0].text) : undefined);
  return { structured, isError: Boolean(body.result?.isError), sessionId };
}

describe('creator agent key routes + MCP start (BY-27a)', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('mints, remints without bumping, rotates, and revokes without resurrecting gen-1', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    const first = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    const body1 = first.json() as {
      key: string;
      keyGeneration: number;
      expiresAt: number;
      fingerprint: string;
      authorizationHeader: string;
      authorizationHeaderMasked: string;
    };
    expect(looksLikeCreatorAgentKey(body1.key)).toBe(true);
    expect(body1.keyGeneration).toBe(1);
    expect(body1.fingerprint).toHaveLength(5);
    expect(body1.authorizationHeader).toBe(`Authorization: Bearer ${body1.key}`);
    expect(body1.authorizationHeaderMasked).toBe(`Authorization: Bearer ····${body1.fingerprint}`);
    expect(body1.authorizationHeaderMasked).not.toContain(body1.key);
    const claims1 = verifyCreatorAgentKey(body1.key, secret);
    expect(claims1.creatorUid).toBe(OWNER);
    expect(body1.expiresAt).toBe(claims1.exp);

    const second = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    expect(second.json().keyGeneration).toBe(1);
    expect((await store.getCreatorAgentKey(OWNER))?.keyGeneration).toBe(1);

    const rotated = await app.inject({
      method: 'POST',
      url: '/api/me/creator-agent-key/rotate',
      headers: authHeaders(),
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().keyGeneration).toBe(2);
    expect(rotated.json().rotated).toBe(true);
    expect(() => assertCreatorAgentKeyActive(claims1, { keyGeneration: 2 })).toThrow(/rotated/i);

    const revoked = await app.inject({
      method: 'DELETE',
      url: '/api/me/creator-agent-key',
      headers: authHeaders(),
    });
    expect(revoked.statusCode).toBe(204);
    const afterRevoke = await store.getCreatorAgentKey(OWNER);
    expect(afterRevoke?.revokedAt).toBeTruthy();
    expect(afterRevoke?.keyGeneration).toBe(3);

    const status = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ revoked: true, keyGeneration: 3 });
    expect(status.json().key).toBeUndefined();

    const reminted = await app.inject({
      method: 'POST',
      url: '/api/me/creator-agent-key',
      headers: authHeaders(),
    });
    expect(reminted.statusCode).toBe(200);
    expect(reminted.json().keyGeneration).toBe(3);
    expect(() => assertCreatorAgentKeyActive(claims1, { keyGeneration: reminted.json().keyGeneration })).toThrow(
      /rotated/i,
    );
    const live = await store.getCreatorAgentKey(OWNER);
    expect(live?.revokedAt).toBeUndefined();
    expect(() =>
      assertCreatorAgentKeyActive(verifyCreatorAgentKey(reminted.json().key as string, secret), live!),
    ).not.toThrow();
  });

  it('starts via Authorization Bearer + slug on the creator key', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Jagged Alliance', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const record = (await store.listSubmissionsByOwner(OWNER))[0]!;
    await store.setSubmissionSlug(record.issueNumber, SLUG);

    const minted = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const key = minted.json().key as string;

    const { structured, isError } = await callStart(app, { slug: SLUG }, { authorization: `Bearer ${key}` });
    expect(isError).toBe(false);
    expect(structured).toMatchObject({ jobId: record.issueNumber, slug: SLUG });
    expect((structured as { sessionKey: string }).sessionKey).toBeTruthy();
  });

  it('refuses a slug the creator does not own without blaming the key', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    await store.createSubmission(10, OTHER, 'Other Game');
    await store.setSubmissionSlug(10, 'other-game');
    await store.setRoundBuilder(10, 'self');
    await store.recordJobTransition(10, { to: 'dispatched', at: new Date().toISOString(), by: 'system' });

    const minted = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const key = minted.json().key as string;

    const { structured, isError } = await callStart(app, { slug: 'other-game' }, { authorization: `Bearer ${key}` });
    expect(isError).toBe(true);
    expect((structured as { error: string }).error).toBe(SLUG_NOT_ON_ACCOUNT_REASON);
    expect((structured as { error: string }).error).not.toMatch(/rotated/i);
  });

  it('refuses a slug that does not exist with the same account-slug reason', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    const minted = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const key = minted.json().key as string;

    const { structured, isError } = await callStart(
      app,
      { slug: 'no-such-game-anywhere' },
      { authorization: `Bearer ${key}` },
    );
    expect(isError).toBe(true);
    expect((structured as { error: string }).error).toBe(SLUG_NOT_ON_ACCOUNT_REASON);
  });

  it('creator-key and OAuth Bearer paths refuse the same unowned slug with the same reason', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    await store.createSubmission(10, OTHER, 'Other Game');
    await store.setSubmissionSlug(10, 'other-game');
    await store.setRoundBuilder(10, 'self');
    await store.recordJobTransition(10, { to: 'dispatched', at: new Date().toISOString(), by: 'system' });

    const minted = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const creatorKey = minted.json().key as string;
    const viaCreator = await callStart(app, { slug: 'other-game' }, { authorization: `Bearer ${creatorKey}` });

    const register = await app.inject({
      method: 'POST',
      url: '/oauth/register',
      headers: { 'content-type': 'application/json' },
      payload: {
        redirect_uris: ['http://127.0.0.1/callback'],
        client_name: 'Parity Agent',
        token_endpoint_auth_method: 'none',
      },
    });
    expect(register.statusCode).toBe(201);
    const clientId = register.json().client_id as string;
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = pkceChallengeS256(verifier);
    const approve = await app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: {
        cookie: authHeaders().cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'http://127.0.0.1/callback',
        scope: 'mcp',
        state: 'xyz',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        action: 'approve',
      }).toString(),
    });
    expect(approve.statusCode).toBe(302);
    const location = new URL(approve.headers.location as string);
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: 'http://127.0.0.1/callback',
        client_id: clientId,
        code_verifier: verifier,
      }).toString(),
    });
    expect(tokenRes.statusCode).toBe(200);
    const accessToken = tokenRes.json().access_token as string;

    const viaOAuth = await callStart(app, { slug: 'other-game' }, { authorization: `Bearer ${accessToken}` });

    expect(viaCreator.isError).toBe(true);
    expect(viaOAuth.isError).toBe(true);
    expect((viaCreator.structured as { error: string }).error).toBe(SLUG_NOT_ON_ACCOUNT_REASON);
    expect((viaOAuth.structured as { error: string }).error).toBe(SLUG_NOT_ON_ACCOUNT_REASON);
    expect((viaCreator.structured as { error: string }).error).toBe((viaOAuth.structured as { error: string }).error);
  });

  it('reuses no-open-round and platform-round refusals', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    await store.createSubmission(20, OWNER, 'Published Only');
    await store.setSubmissionSlug(20, SLUG);
    await store.setSubmissionPublishedAt(20, '2026-07-01T00:00:00.000Z');
    await store.recordJobTransition(20, {
      to: 'published',
      at: '2026-07-01T00:00:00.000Z',
      by: 'operator',
      reason: 'published',
    });

    const minted = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const key = minted.json().key as string;

    const noRound = await callStart(app, { slug: SLUG }, { authorization: `Bearer ${key}` });
    expect(noRound.isError).toBe(true);
    expect(noRound.structured).toMatchObject({ error: NO_OPEN_ROUND_REASON });

    await store.createSubmission(21, OWNER, 'Platform Round');
    await store.setSubmissionSlug(21, SLUG);
    await store.setRoundBuilder(21, 'platform');
    await store.recordJobTransition(21, { to: 'dispatched', at: new Date().toISOString(), by: 'system' });

    const platform = await callStart(app, { slug: SLUG }, { authorization: `Bearer ${key}` });
    expect(platform.isError).toBe(true);
    expect(platform.structured).toMatchObject({ error: PLATFORM_ROUND_REASON });
  });

  it('rejects the creator key on write tools when no sessionKey is present', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Write Guard', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const record = (await store.listSubmissionsByOwner(OWNER))[0]!;
    await store.setSubmissionSlug(record.issueNumber, SLUG);

    const minted = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const key = minted.json().key as string;

    const init = await mcpCall(app, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    const sessionId = init.headers['mcp-session-id'] as string;
    const res = await mcpCall(
      app,
      'tools/call',
      { name: 'report_progress', arguments: { step: 'scaffold', note: 'hi' } },
      { authorization: `Bearer ${key}`, 'mcp-session-id': sessionId },
    );
    const body = res.json() as {
      result?: { isError?: boolean; content?: Array<{ text: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toMatch(/creator key only opens a session/i);
  });

  it('honours sessionKey for write tools even when Authorization still carries the creator key', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Paste Once', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const record = (await store.listSubmissionsByOwner(OWNER))[0]!;
    await store.setSubmissionSlug(record.issueNumber, SLUG);
    await store.ensureRoundGeneration(record.issueNumber);

    const minted = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const creatorKey = minted.json().key as string;
    const started = await callStart(app, { slug: SLUG }, { authorization: `Bearer ${creatorKey}` });
    expect(started.isError).toBe(false);
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const progress = await mcpCall(
      app,
      'tools/call',
      {
        name: 'report_progress',
        arguments: { sessionKey, step: 'planning', text: 'paste-once ok' },
      },
      {
        authorization: `Bearer ${creatorKey}`,
        'mcp-session-id': started.sessionId,
      },
    );
    const body = progress.json() as { result?: { isError?: boolean } };
    expect(body.result?.isError).not.toBe(true);
  });

  it('keeps legacy round keys and durable per-game keys working', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Legacy Keys', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const record = (await store.listSubmissionsByOwner(OWNER))[0]!;
    await store.setSubmissionSlug(record.issueNumber, SLUG);
    await store.ensureRoundGeneration(record.issueNumber);
    await store.ensureGameAgentKey(SLUG, OWNER, new Date().toISOString());

    const gameKey = mintGameAgentKey(secret, {
      slug: SLUG,
      creatorUid: OWNER,
      keyGeneration: 1,
    });
    const gameStart = await callStart(app, { key: gameKey });
    expect(gameStart.isError).toBe(false);

    const roundKey = mintAgentToken(record.issueNumber, secret, { roundGeneration: 1 });
    const roundStart = await callStart(app, { key: roundKey });
    expect(roundStart.isError).toBe(false);

    // sessionKey from game start still works as a write credential shape check
    const sessionKey = mintMcpSessionKey(secret, {
      sessionId: 'sess-legacy',
      jobId: record.issueNumber,
      roundGeneration: 1,
    });
    expect(sessionKey).toBeTruthy();
  });

  // CP-2, against production: the Studio panel promises "rotating stops every agent still
  // using the old key". It did not. A sessionKey minted before the rotation authenticates
  // on the round's generation and never consults the creator key, so report_progress kept
  // succeeding afterwards and the write landed in the creator's thread.
  it('rotating the creator key ends sessions already holding a sessionKey', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Rotate Kills', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const record = (await store.listSubmissionsByOwner(OWNER))[0]!;
    await store.setSubmissionSlug(record.issueNumber, SLUG);
    await store.ensureRoundGeneration(record.issueNumber);

    const minted = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const creatorKey = minted.json().key as string;
    const started = await callStart(app, { slug: SLUG }, { authorization: `Bearer ${creatorKey}` });
    expect(started.isError).toBe(false);
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const writeProgress = async () => {
      const res = await mcpCall(
        app,
        'tools/call',
        { name: 'report_progress', arguments: { sessionKey, step: 'planning', text: 'still here' } },
        { 'mcp-session-id': started.sessionId },
      );
      return (res.json() as { result?: { isError?: boolean } }).result?.isError === true;
    };

    // The session is live before the rotation — otherwise this test proves nothing.
    expect(await writeProgress()).toBe(false);

    const rotated = await app.inject({
      method: 'POST',
      url: '/api/me/creator-agent-key/rotate',
      headers: authHeaders(),
    });
    expect(rotated.statusCode).toBe(200);
    expect((rotated.json() as { sessionsEnded: number }).sessionsEnded).toBe(1);

    // The write capability is gone, which is what the panel told the creator would happen.
    expect(await writeProgress()).toBe(true);
  });

  // The panel showed a different "Ends in ..." tail on every visit, because GET re-minted
  // at the wall clock. A creator comparing it against their agent's header always saw a
  // mismatch, and the remedy the panel offers for a mismatch is Rotate — destructive.
  it('mints one stable key per generation, so the displayed tail matches the pasted header', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    // Backdate the generation, the way it is for any creator who minted last week.
    // Two back-to-back reads are identical even without the fix — `exp` has second
    // granularity — so a same-second probe could never have produced the failure.
    await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const MINTED_AT = '2026-07-01T00:00:00.000Z';
    const records = (store as unknown as { creatorAgentKeys: Map<string, CreatorAgentKeyRecord> }).creatorAgentKeys;
    records.set(OWNER, { ...records.get(OWNER)!, updatedAt: MINTED_AT });

    const first = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const second = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });

    const a = first.json() as { key: string; fingerprint: string; expiresAt: number; keyGeneration: number };
    const b = second.json() as { key: string; fingerprint: string; expiresAt: number; keyGeneration: number };

    // The key belongs to the generation, not to the moment the panel was opened: its
    // expiry is measured from when the generation was minted.
    expect(b.expiresAt).toBe(
      Math.floor(Date.parse(MINTED_AT) / 1000) + DEFAULT_CREATOR_AGENT_KEY_TTL_DAYS * 24 * 60 * 60,
    );
    expect(verifyCreatorAgentKey(b.key, secret).exp).toBe(b.expiresAt);

    expect(b.keyGeneration).toBe(a.keyGeneration);
    expect(b.key).toBe(a.key);
    expect(b.fingerprint).toBe(a.fingerprint);
    // The stated expiry is a real deadline, not one that slid forward on every page load.
    expect(b.expiresAt).toBe(a.expiresAt);

    // Rotation still produces a genuinely different key.
    const rotated = await app.inject({
      method: 'POST',
      url: '/api/me/creator-agent-key/rotate',
      headers: authHeaders(),
    });
    const c = rotated.json() as { key: string; keyGeneration: number };
    expect(c.keyGeneration).toBe(a.keyGeneration + 1);
    expect(c.key).not.toBe(a.key);
  });

  // Review (#488): the creator key cannot even open a platform round, so bumping a
  // platform build's generation revokes nothing the key could reach — it just stalls
  // a build the creator did not ask to stop.
  it('leaves a platform-built round alone when the creator key is rotated', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Platform Build', concept: CONCEPT, builder: 'platform' },
    });
    expect(submit.statusCode).toBe(200);
    const record = (await store.listSubmissionsByOwner(OWNER))[0]!;
    await store.setSubmissionSlug(record.issueNumber, SLUG);
    await store.setRoundBuilder(record.issueNumber, 'platform');
    await store.ensureRoundGeneration(record.issueNumber);
    const before = (await store.getSubmission(record.issueNumber))?.roundGeneration;

    const rotated = await app.inject({
      method: 'POST',
      url: '/api/me/creator-agent-key/rotate',
      headers: authHeaders(),
    });
    expect(rotated.statusCode).toBe(200);
    expect((rotated.json() as { sessionsEnded: number }).sessionsEnded).toBe(0);
    expect((await store.getSubmission(record.issueNumber))?.roundGeneration).toBe(before);
  });

  // Review (#488): if the revocation persisted but ending sessions then failed, a 404
  // on retry would strand those sessions writable forever — no retry could reach the
  // cleanup again.
  it('finishes the session cleanup when revoke is retried on an already-revoked key', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Retry Revoke', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const record = (await store.listSubmissionsByOwner(OWNER))[0]!;
    await store.setSubmissionSlug(record.issueNumber, SLUG);
    await store.ensureRoundGeneration(record.issueNumber);

    // Stand in for the interrupted attempt: revocation persisted, cleanup never ran.
    await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    await store.revokeCreatorAgentKey(OWNER, new Date().toISOString());
    const stranded = (await store.getSubmission(record.issueNumber))?.roundGeneration;

    const retry = await app.inject({
      method: 'DELETE',
      url: '/api/me/creator-agent-key',
      headers: authHeaders(),
    });
    expect(retry.statusCode).toBe(204);
    expect((await store.getSubmission(record.issueNumber))?.roundGeneration).toBe((stranded ?? 1) + 1);
  });

  // Review (#488): anchoring every mint to updatedAt means a generation older than the
  // TTL would mint an already-expired key forever, while the panel still offered it for
  // copying and the only remedy on screen is the destructive Rotate.
  it('re-dates a generation whose key has expired instead of serving a dead one', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);

    await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const records = (store as unknown as { creatorAgentKeys: Map<string, CreatorAgentKeyRecord> }).creatorAgentKeys;
    const aged = new Date(Date.now() - (DEFAULT_CREATOR_AGENT_KEY_TTL_DAYS + 30) * 24 * 60 * 60 * 1000);
    records.set(OWNER, { ...records.get(OWNER)!, updatedAt: aged.toISOString() });

    const res = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    const body = res.json() as { key: string; keyGeneration: number; expiresAt: number };

    // Same generation — nothing that was dead comes back, every key of it had expired.
    expect(body.keyGeneration).toBe(1);
    expect(body.expiresAt * 1000).toBeGreaterThan(Date.now());
    expect(verifyCreatorAgentKey(body.key, secret).exp).toBe(body.expiresAt);

    // And it is stable again from here, rather than drifting on every visit.
    const again = await app.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders() });
    expect((again.json() as { key: string }).key).toBe(body.key);
  });
});
