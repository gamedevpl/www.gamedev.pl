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

describe('the unseen-reference hold', () => {
  const submit = { files: [{ path: 'game.ts', content: 'export {};' }], mode: 'preview', kitEngineRef: 'a'.repeat(40) };

  it('holds a managed shell lane once, carrying the live inbox, and never a public client', async () => {
    const store = await round();
    await store.appendCreatorMessage(JOB, 'Make the ship blue');
    const opener = `Bearer ${mintManagedMcpOpener(JOB, secret, { roundGeneration: 1, shell: true })}`;
    const started = await call('start', { key: mintAgentToken(JOB, secret, { roundGeneration: 1 }) }, opener);
    const held = await call('submit_sources', { ...submit, sessionKey: started.sessionKey }, opener);
    expect(held).toMatchObject({ ok: false, rejected: 'reference_unseen', mode: 'preview', stop: false });
    expect(held.pendingMessages).toEqual([expect.objectContaining({ text: 'Make the ship blue' })]);
    const again = await call('submit_sources', { ...submit, sessionKey: started.sessionKey }, opener);
    expect(again.rejected).not.toBe('reference_unseen');
  });

  it('does not hold a no-shell managed lane', async () => {
    await round();
    const opener = `Bearer ${mintManagedMcpOpener(JOB, secret, { roundGeneration: 1 })}`;
    const started = await call('start', { key: mintAgentToken(JOB, secret, { roundGeneration: 1 }) }, opener);
    const reply = await call('submit_sources', { ...submit, sessionKey: started.sessionKey }, opener);
    expect(reply.rejected).not.toBe('reference_unseen');
  });
});
