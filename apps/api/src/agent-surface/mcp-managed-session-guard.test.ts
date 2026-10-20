import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { GitHubClient } from '../catalog/github-client.js';
import { mintAgentToken, mintManagedMcpOpener } from '../platform/agent-token.js';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';

const secret = 'test-secret';
const JOB = 56;
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function round() {
  const store = new InMemoryStore();
  await store.createSubmission(JOB, 'g:owner', 'Comet Courier');
  await store.setSubmissionSlug(JOB, 'comet-courier');
  await store.setRoundBuilder(JOB, 'platform');
  await store.recordJobTransition(JOB, { to: 'building', at: new Date().toISOString(), by: 'system' });
  await store.appendBuildShot(JOB, { data: TINY_PNG, label: 'creator-reference', createdAt: new Date().toISOString() });
  app = await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: { githubClient: {} as GitHubClient, githubToken: 'gh-token', submissionTokenSecret: secret },
  });
  return store;
}

async function call(name: string, args: Record<string, unknown>, authorization: string) {
  const res = await app!.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization },
    payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  return (res.json() as { result: { structuredContent: Record<string, unknown> } }).result.structuredContent;
}

describe('managed session submit and end', () => {
  const submit = { files: [{ path: 'game.ts', content: 'export {};' }], mode: 'preview', kitEngineRef: 'a'.repeat(40) };

  it('refuses the first end after an undelivered submit, then closes; a later submit is refused', async () => {
    await round();
    const opener = `Bearer ${mintManagedMcpOpener(JOB, secret, { roundGeneration: 1, shell: true })}`;
    const started = await call('start', { key: mintAgentToken(JOB, secret, { roundGeneration: 1 }) }, opener);
    const sessionKey = started.sessionKey;
    const refused = await call('submit_sources', { ...submit, sessionKey }, opener);
    expect(refused.ok).not.toBe(true);
    expect(refused.rejected).not.toBe('reference_unseen');
    const first = await call('end', { sessionKey, summary: 'done' }, opener);
    expect(first).toMatchObject({ ok: false, ended: false, rejected: 'nothing_delivered' });
    expect(first.pendingMessages).toEqual([]);
    const second = await call('end', { sessionKey, summary: 'nothing shipped' }, opener);
    expect(second).toMatchObject({ ok: true, ended: true });
    const late = await call('submit_sources', { ...submit, sessionKey }, opener);
    expect(late).toMatchObject({ ok: false, rejected: 'session_ended', mode: 'preview' });
  });

  it('lets a managed session that never submitted end at once', async () => {
    await round();
    const opener = `Bearer ${mintManagedMcpOpener(JOB, secret, { roundGeneration: 1 })}`;
    const started = await call('start', { key: mintAgentToken(JOB, secret, { roundGeneration: 1 }) }, opener);
    const ended = await call('end', { sessionKey: started.sessionKey, summary: 'answered' }, opener);
    expect(ended).toMatchObject({ ok: true, ended: true });
  });

  it('leaves a public client exactly as before', async () => {
    await round();
    const key = `Bearer ${mintAgentToken(JOB, secret, { roundGeneration: 1 })}`;
    const refused = await call('submit_sources', submit, key);
    expect(refused.ok).not.toBe(true);
    expect(await call('end', { summary: 'done' }, key)).toMatchObject({ ok: true, ended: true });
    expect((await call('submit_sources', submit, key)).rejected).not.toBe('session_ended');
  });
});
