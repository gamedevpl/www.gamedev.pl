import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mintAgentToken, mintManagedMcpOpener } from '../platform/agent-token.js';
import { buildApp } from '../platform/app.js';
import type { GitHubClient } from '../catalog/github-client.js';
import { InMemoryStore } from '../platform/store.js';

const secret = 'test-secret';
const JOB = 55;

const github = {
  getIssueState: async () => ({ state: 'open' as const }),
  findLinkedPR: async () => null,
  createIssueComment: async () => ({ id: 1 }),
  updateIssueBody: async () => {},
  closeIssue: async () => {},
  ensureOpenPullRequest: async () => ({ number: 1 }),
  deleteBranch: async () => {},
  getGameSources: async () => null,
  getGameMedia: async () => null,
  getCatalog: async () => [],
  getProgressNotes: async () => null,
} as unknown as GitHubClient;

let app: FastifyInstance | undefined;
beforeEach(() => vi.stubEnv('MANAGED_VISUAL_TARGET', 'true'));
afterEach(async () => {
  vi.unstubAllEnvs();
  await app?.close();
  app = undefined;
});

async function start(): Promise<FastifyInstance> {
  const store = new InMemoryStore();
  await store.createSubmission(JOB, 'g:owner', 'Comet Courier');
  await store.setSubmissionSlug(JOB, 'comet-courier');
  await store.setRoundBuilder(JOB, 'platform');
  return buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: { githubClient: github, githubToken: 'gh-token', submissionTokenSecret: secret },
  });
}

async function rpc(method: string, params: unknown, authorization?: string) {
  const res = await app!.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(authorization ? { authorization } : {}),
    },
    payload: { jsonrpc: '2.0', id: 1, method, params },
  });
  return res.json() as { result?: { tools?: Array<{ name: string }> }; error?: { message: string } };
}

const listed = async (authorization?: string) =>
  ((await rpc('tools/list', {}, authorization)).result?.tools ?? []).map((tool) => tool.name);

describe('visual_target is managed-only', () => {
  it('is listed only for a managed-session opener bearer', async () => {
    app = await start();
    const opener = `Bearer ${mintManagedMcpOpener(JOB, secret, { roundGeneration: 1, shell: true })}`;
    expect(await listed(opener)).toContain('visual_target');
    expect(await listed()).not.toContain('visual_target');
    expect(await listed(`Bearer ${mintAgentToken(JOB, secret, { roundGeneration: 1 })}`)).not.toContain(
      'visual_target',
    );
    expect(await listed()).toContain('get_brief');
  });

  it('is not offered to a managed session without a shell', async () => {
    app = await start();
    const opener = `Bearer ${mintManagedMcpOpener(JOB, secret, { roundGeneration: 1 })}`;
    expect(await listed(opener)).not.toContain('visual_target');
    // creator_notes needs no shell, only the opener.
    expect(await listed(opener)).toContain('creator_notes');
    expect(await listed()).not.toContain('creator_notes');
  });

  it('leaves Studio and account tools out of a managed session, keeping the ones its guidance names', async () => {
    app = await start();
    const shell = `Bearer ${mintManagedMcpOpener(JOB, secret, { roundGeneration: 1, shell: true })}`;
    for (const name of ['get_game_performance', 'share_draft', 'list_account_games', 'concept_frame_upload_url']) {
      expect(await listed(shell)).not.toContain(name);
      expect(await listed()).toContain(name);
    }
    expect(await listed(shell)).toEqual(
      expect.arrayContaining(['start', 'submit_sources', 'create_game', 'knowledge_query', 'show_media', 'open_round']),
    );
  });

  it('is not offered when the feature is off', async () => {
    vi.stubEnv('MANAGED_VISUAL_TARGET', '');
    app = await start();
    const opener = `Bearer ${mintManagedMcpOpener(JOB, secret, { roundGeneration: 1, shell: true })}`;
    expect(await listed(opener)).not.toContain('visual_target');
  });

  it('does not exist for a public client that guesses its name', async () => {
    app = await start();
    const called = await rpc(
      'tools/call',
      { name: 'visual_target', arguments: { direction: 'brighter' } },
      `Bearer ${mintAgentToken(JOB, secret, { roundGeneration: 1 })}`,
    );
    expect(called.error?.message).toBe('unknown tool: visual_target');
  });
});
