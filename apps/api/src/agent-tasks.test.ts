import { describe, expect, it } from 'vitest';
import {
  createAgentTasksClient,
  creditsFromUsageAmount,
  isAbortError,
  normalizeModel,
  parseAgentTask,
  resolveTaskBranch,
} from './agent-tasks.js';

/** A settled task, shaped exactly as the live API answered on 2026-07-29. */
const SETTLED_TASK = {
  archived_at: null,
  artifacts: [
    { data: { global_id: 'PR_kwDOTf4x3s74P7V3', id: 4164924791 }, provider: 'github', type: 'pull' },
    { data: { base_ref: 'main', head_ref: 'copilot/fix-trailing-whitespace' }, provider: 'github', type: 'branch' },
  ],
  created_at: '2026-07-29T23:43:56Z',
  id: 'fa2b7aaa-db4a-4723-b488-3e05c0fb1ad6',
  name: 'Adding a blank line to the file',
  html_url: 'https://github.com/gamedevpl/www.gamedev.pl-games/tasks/fa2b7aaa',
  session_count: 1,
  sessions: [
    {
      base_ref: 'main',
      completed_at: '2026-07-29T23:46:10Z',
      created_at: '2026-07-29T23:43:58Z',
      head_ref: 'copilot/fix-trailing-whitespace',
      id: '53bea0ef-2c09-4cee-86cb-d1ee8ac9c0e2',
      model: 'sweagent-capi:gpt-5.4',
      prompt: 'Add one blank line at the end of that file.',
      state: 'completed',
      usage: { amount: 403451775000, type: 'ai_credits' },
    },
  ],
  state: 'completed',
  updated_at: '2026-07-29T23:46:10Z',
};

/** What a create call answers with: no artifacts, no sessions yet. */
const FRESH_TASK = {
  artifacts: [],
  created_at: '2026-07-29T23:43:56Z',
  id: 'fa2b7aaa-db4a-4723-b488-3e05c0fb1ad6',
  name: 'Add one blankline at the end of that file.',
  session_count: 0,
  state: 'queued',
};

function stubFetch(handler: (url: string, init: RequestInit) => unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(handler(String(url), init)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('creditsFromUsageAmount', () => {
  it('converts nano-credits to ledger credits', () => {
    // Live reading from the 403-credit global-thermonuclear-strategy session.
    expect(creditsFromUsageAmount(403451775000)).toBe(403.45);
    expect(creditsFromUsageAmount(861100000000)).toBe(861.1);
  });
});

describe('isAbortError', () => {
  it('treats native TimeoutError the same as AbortError', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new DOMException('timed out', 'TimeoutError'))).toBe(true);
    expect(isAbortError(new Error('nope'))).toBe(false);
  });
});

describe('parseAgentTask', () => {
  it('lifts the branch and pull artifacts out of the artifact list', () => {
    const task = parseAgentTask(SETTLED_TASK);
    expect(task.branch).toEqual({ baseRef: 'main', headRef: 'copilot/fix-trailing-whitespace' });
    expect(task.pull).toEqual({ id: 4164924791, globalId: 'PR_kwDOTf4x3s74P7V3' });
  });

  it('keeps session usage so the ledger can book the real bill', () => {
    // The parser used to drop `usage`, which is why every session was booked as 1 credit
    // against bills of 46–861. The figure is nano-credits; conversion is the caller's job.
    expect(parseAgentTask(SETTLED_TASK).sessions[0]?.usage).toEqual({
      amount: 403451775000,
      type: 'ai_credits',
    });
  });

  it('reports no pull request when the task did not open one', () => {
    // create_pull_request:false produces a branch artifact and nothing else — this is
    // how the adapter knows whether a resumption round needs a PR opened first.
    const task = parseAgentTask({
      ...SETTLED_TASK,
      artifacts: [{ data: { base_ref: 'main', head_ref: 'copilot/x' }, provider: 'github', type: 'branch' }],
    });
    expect(task.pull).toBeUndefined();
    expect(task.branch?.headRef).toBe('copilot/x');
  });

  it('survives a freshly created task with no artifacts or sessions', () => {
    const task = parseAgentTask(FRESH_TASK);
    expect(task.state).toBe('queued');
    expect(task.sessionCount).toBe(0);
    expect(task.branch).toBeUndefined();
    expect(resolveTaskBranch(task)).toBeNull();
  });

  it('falls back to an unknown state rather than throwing', () => {
    // The API is in public preview; a new state must not take the status route down.
    expect(parseAgentTask({ ...FRESH_TASK, state: 'something_new' }).state).toBe('queued');
  });
});

describe('normalizeModel', () => {
  it('strips the namespace the API answers with', () => {
    // Request `gpt-5.4`, read back `sweagent-capi:gpt-5.4` — comparing them raw would
    // report every pinned model as unhonoured.
    expect(normalizeModel('sweagent-capi:gpt-5.4')).toBe('gpt-5.4');
    expect(normalizeModel('sweagent-capi:claude-sonnet-4.6')).toBe('claude-sonnet-4.6');
    expect(normalizeModel('claude-opus-4.6')).toBe('claude-opus-4.6');
    expect(normalizeModel(undefined)).toBeUndefined();
  });
});

describe('resolveTaskBranch', () => {
  it('prefers the artifact over the session', () => {
    expect(resolveTaskBranch(parseAgentTask(SETTLED_TASK))).toBe('copilot/fix-trailing-whitespace');
  });

  it('falls back to the latest session when no artifact has appeared yet', () => {
    const task = parseAgentTask({ ...SETTLED_TASK, artifacts: [] });
    expect(resolveTaskBranch(task)).toBe('copilot/fix-trailing-whitespace');
  });
});

describe('startTask', () => {
  it('always sends create_pull_request explicitly', async () => {
    // The API documents a `false` default and does not honour it — a dispatch that
    // omitted the field opened a PR. Sending it always is the whole fix.
    const { impl, calls } = stubFetch(() => FRESH_TASK);
    const client = createAgentTasksClient({ token: 't', repo: 'o/r', fetchImpl: impl });

    await client.startTask({
      prompt: 'build it',
      baseRef: 'main',
      model: 'claude-sonnet-4.6',
      createPullRequest: false,
    });

    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      prompt: 'build it',
      base_ref: 'main',
      model: 'claude-sonnet-4.6',
      create_pull_request: false,
    });
    expect(Object.hasOwn(body, 'create_pull_request')).toBe(true);
    expect(body.head_ref).toBeUndefined();
  });

  it('pins the model and passes a custom agent through', async () => {
    const { impl, calls } = stubFetch(() => FRESH_TASK);
    const client = createAgentTasksClient({ token: 't', repo: 'o/r', fetchImpl: impl });

    await client.startTask({
      prompt: 'p',
      baseRef: 'main',
      headRef: 'copilot/x',
      model: 'gpt-5.4',
      createPullRequest: true,
      customAgent: 'game-builder',
    });

    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      head_ref: 'copilot/x',
      custom_agent: 'game-builder',
      model: 'gpt-5.4',
      create_pull_request: true,
    });
  });

  it('bounds every call so a hung GitHub cannot strand a creator-facing dispatch', async () => {
    // Feedback and improve await startTask. Without a ceiling, a quiet upstream left the
    // studio send button disabled until the platform killed the HTTP request — which
    // looked like nothing was happening at all.
    const { impl, calls } = stubFetch(() => FRESH_TASK);
    const client = createAgentTasksClient({ token: 't', repo: 'o/r', fetchImpl: impl, timeoutMs: 1_500 });

    await client.startTask({
      prompt: 'build it',
      baseRef: 'main',
      model: 'claude-sonnet-4.6',
      createPullRequest: false,
    });

    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('names a timeout as a 504 rather than a generic network failure', async () => {
    const impl = (async (_url: string | URL | Request, init: RequestInit = {}) => {
      // Match Node's native fetch: AbortSignal.timeout rejects with TimeoutError, not
      // AbortError. Honouring only AbortError would leave real hangs unclassified.
      await new Promise<never>((_resolve, reject) => {
        const fail = () => reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
        if (init.signal?.aborted) fail();
        else init.signal?.addEventListener('abort', fail, { once: true });
      });
      return new Response('{}');
    }) as unknown as typeof fetch;
    const client = createAgentTasksClient({ token: 't', repo: 'o/r', fetchImpl: impl, timeoutMs: 20 });

    await expect(
      client.startTask({
        prompt: 'build it',
        baseRef: 'main',
        model: 'claude-sonnet-4.6',
        createPullRequest: false,
      }),
    ).rejects.toMatchObject({ name: 'AgentTasksError', status: 504 });
  });

  it('targets the repository-scoped endpoint with the pinned API version', async () => {
    const { impl, calls } = stubFetch(() => FRESH_TASK);
    const client = createAgentTasksClient({ token: 't', repo: 'gamedevpl/www.gamedev.pl-games', fetchImpl: impl });

    await client.startTask({ prompt: 'p', baseRef: 'main', model: 'gpt-5.4', createPullRequest: false });

    expect(calls[0].url).toBe('https://api.github.com/agents/repos/gamedevpl/www.gamedev.pl-games/tasks');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-github-api-version']).toBe('2026-03-10');
    expect(headers.authorization).toBe('Bearer t');
  });
});

describe('getTask', () => {
  it('answers null for an unknown task instead of throwing', async () => {
    const impl = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
    const client = createAgentTasksClient({ token: 't', repo: 'o/r', fetchImpl: impl });
    expect(await client.getTask('nope')).toBeNull();
  });

  it('surfaces other failures as errors carrying the status', async () => {
    const impl = (async () => new Response('boom', { status: 403 })) as unknown as typeof fetch;
    const client = createAgentTasksClient({ token: 't', repo: 'o/r', fetchImpl: impl });
    await expect(client.getTask('x')).rejects.toMatchObject({ status: 403 });
  });
});

describe('listTasks', () => {
  it('filters by state for the reconciler sweep', async () => {
    const { impl, calls } = stubFetch(() => ({ tasks: [SETTLED_TASK] }));
    const client = createAgentTasksClient({ token: 't', repo: 'o/r', fetchImpl: impl });

    const tasks = await client.listTasks({ states: ['in_progress', 'queued'], since: '2026-07-29T00:00:00Z' });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].branch?.headRef).toBe('copilot/fix-trailing-whitespace');
    expect(calls[0].url).toContain('state=in_progress%2Cqueued');
    expect(calls[0].url).toContain('since=2026-07-29T00%3A00%3A00Z');
  });

  it('tolerates a payload with no tasks array', async () => {
    const { impl } = stubFetch(() => ({}));
    const client = createAgentTasksClient({ token: 't', repo: 'o/r', fetchImpl: impl });
    expect(await client.listTasks()).toEqual([]);
  });
});
