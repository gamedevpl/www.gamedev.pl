// Client for GitHub's Copilot **agent tasks** REST API (public preview, API version
// 2026-03-10) — the programmatic dispatch surface that replaces
// issue → label → assign-the-bot → relay-a-mention.
//
// Why this exists at all: today a submission's status is *derived* by scraping issue and
// PR state, and dispatch depends on two PATs plus two workflows in the games repo. This
// API starts a task from a bare prompt, reports a real state machine, and lets a
// follow-up round resume the same branch — so orchestration can become something we own
// rather than something we infer. See the migration plan in the private ops repo.
//
// Everything encoded here was verified against `gamedevpl` on 2026-07-29, and in three
// places the observed behaviour contradicts GitHub's own documentation. Those are called
// out at their definitions rather than in a list nobody reads:
//   1. `create_pull_request` does NOT default to false        (see startTask)
//   2. `head_ref` is silently ignored without an open PR      (see AgentTaskInput.headRef)
//   3. `model` echoes back namespaced, not as sent            (see normalizeModel)

import { isAgentTaskState, type AgentTaskState } from './agent-state.js';
import { isRateLimitResponse } from '../catalog/github-rate-limit.js';

const AGENT_TASKS_API_VERSION = '2026-03-10';

// Every backend shares this vocabulary, so it lives in agent-state.ts.
export { AGENT_TASK_STATES, type AgentTaskState } from './agent-state.js';

/**
 * Models accepted by the API. GitHub notes the list "may change over time and depend on
 * the user's plan and organization policies", so an unknown value is a soft failure at
 * dispatch, not a reason to reject a job before we have tried.
 */
// Confirmed unchanged against GitHub's REST API spec on 2026-08-12.
export const AGENT_TASK_MODELS = [
  'claude-sonnet-4.6',
  'claude-opus-4.6',
  'gpt-5.2-codex',
  'gpt-5.3-codex',
  'gpt-5.4',
  'claude-sonnet-4.5',
  'claude-opus-4.5',
] as const;
export type AgentTaskModel = (typeof AGENT_TASK_MODELS)[number];

/**
 * What GitHub billed for one session.
 *
 * `amount` is in **nano-credits** (1 credit = 1e9). Divide by 1e9 for credits; a credit
 * is $0.01 (`USD_PER_CREDIT`). Present once the session has progressed far enough to
 * report usage — typically final on completion, absent on a freshly queued session.
 */
export interface AgentSessionUsage {
  amount: number;
  type: string;
}

/** One agent run within a task. A task accumulates sessions; it does not replace them. */
export interface AgentSession {
  id: string;
  state: AgentTaskState;
  /** The prompt this session was given — unlike `AgentTask.name`, not rewritten. */
  prompt?: string;
  baseRef?: string;
  headRef?: string;
  /** Normalized: `sweagent-capi:gpt-5.4` is reported here as `gpt-5.4`. */
  model?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  /** What was billed. Absent until the session reports it. */
  usage?: AgentSessionUsage;
}

/**
 * Converts a session's nano-credit `usage.amount` into ledger credits.
 *
 * Rounded to the cent-of-a-credit so a 403451775000 reading becomes 403.45 rather than
 * a float that cannot be quoted next to a dollar figure.
 */
export function creditsFromUsageAmount(amount: number): number {
  return Math.round(amount / 1e7) / 100;
}

export interface AgentTask {
  id: string;
  state: AgentTaskState;
  /**
   * A human-readable title **GitHub generates from the prompt** — a dispatch of "Fix any
   * typo you find in games/x/SPEC.md…" came back as "Correcting typos in bubble pop rush
   * specification". Good enough to label a row in an operator queue; never assume it
   * echoes what we sent (`AgentSession.prompt` does).
   */
  name?: string;
  htmlUrl?: string;
  sessionCount: number;
  sessions: AgentSession[];
  /**
   * The branch the agent actually worked on, read from the task's `branch` artifact.
   *
   * **Always trust this over the `headRef` you asked for.** A `head_ref` that cannot be
   * resolved is ignored rather than rejected, so a request that asked to resume
   * `copilot/foo` can quietly come back having built `copilot/bar` instead.
   */
  branch?: { baseRef?: string; headRef?: string };
  /** Present only when a pull request exists for the task. */
  pull?: { id: number; globalId?: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentTaskInput {
  /** The whole brief. No issue, no label, no assignment — this is the dispatch. */
  prompt: string;
  /** Branch the agent starts from. Always send it: the default is the repo default. */
  baseRef: string;
  /**
   * Resume an existing branch instead of cutting a new one.
   *
   * ⚠️ **Only works when that branch has an open pull request.** GitHub's documented
   * behaviour is literal — it "looks up open PR context for `head_ref` targeting
   * `base_ref`" — and with no open PR the parameter is *silently ignored*: no error, the
   * agent simply branches fresh from `baseRef`. Callers wanting a follow-up round must
   * ensure a PR is open on the branch first, and must verify {@link AgentTask.branch} on
   * the way back rather than assuming this value was honoured.
   */
  headRef?: string;
  /**
   * Pinned per dispatch, deliberately never omitted.
   *
   * Omitting it selects a model automatically, and auto-selection is **not stable**:
   * consecutive dispatches of near-identical prompts resolved to `claude-sonnet-4.6` and
   * then `gpt-5.4`. That is fine for one-off work and wrong for a creator-facing pipeline
   * whose cost, latency and quality we want to reason about — and it would silently
   * confound any A/B comparison.
   */
  model: AgentTaskModel;
  /**
   * Whether GitHub opens a pull request for this task.
   *
   * ⚠️ Required here even though the API documents a `false` default, because the default
   * is **not** false in practice: a dispatch that omitted the field opened a PR anyway.
   * Making it a required parameter is how that surprise stops being possible.
   *
   * Note it does not tear down or refuse an *existing* PR: resuming a branch that already
   * has one works with `false`, and the agent joins the open PR.
   */
  createPullRequest: boolean;
  /** A `.github/agents/<name>.agent.md` definition — where standing rules are pinned. */
  customAgent?: string;
}

/** How long a single agent-tasks HTTP call may take before we give up. */
export const DEFAULT_AGENT_TASKS_TIMEOUT_MS = 25_000;

export interface AgentTasksClientOptions {
  /**
   * A **user-to-server** token: a fine-grained PAT with the `Agent tasks` repository
   * permission (read to list, read+write to start), a classic PAT with `repo`, an OAuth
   * app token, or a GitHub App *user* token.
   *
   * GitHub App **installation** tokens are explicitly unsupported, so there is no pure
   * machine identity for this API — a server-side orchestrator has to hold a human's
   * token, and that token's expiry is an outage of dispatch.
   */
  token: string;
  /** `owner/name`. */
  repo: string;
  fetchImpl?: typeof fetch;
  /**
   * Ceiling on one HTTP round trip. Absent → {@link DEFAULT_AGENT_TASKS_TIMEOUT_MS},
   * or `AGENT_TASKS_TIMEOUT_MS` when that is set. Without a bound, a hung GitHub call
   * held the creator's feedback POST open until the platform timed the request out —
   * which looked like a send button that disabled itself and never came back.
   */
  timeoutMs?: number;
}

export interface AgentTasksClient {
  startTask(input: AgentTaskInput): Promise<AgentTask>;
  getTask(taskId: string): Promise<AgentTask | null>;
  listTasks(options?: { states?: AgentTaskState[]; since?: string; perPage?: number }): Promise<AgentTask[]>;
}

export class AgentTasksError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AgentTasksError';
  }
}

/**
 * Strips the `sweagent-capi:` namespace GitHub answers with.
 *
 * The request enum and the response value are not the same string — you send
 * `gpt-5.4` and read back `sweagent-capi:gpt-5.4` — so comparing them for equality
 * (to check a pin was honoured, say) fails for every model.
 */
export function normalizeModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const separator = model.indexOf(':');
  return separator === -1 ? model : model.slice(separator + 1);
}

function asState(value: unknown): AgentTaskState {
  return isAgentTaskState(value) ? value : 'queued';
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

interface RawArtifact {
  type?: unknown;
  data?: Record<string, unknown>;
}

/**
 * Parses one task payload.
 *
 * Artifacts are the interesting part: a `branch` entry carries `{base_ref, head_ref}` and
 * a `pull` entry carries `{id, global_id}`. Both appear only once the task has progressed
 * — a freshly created task answers with `artifacts: []` and `session_count: 0` — which is
 * why callers poll the task rather than trusting the create response.
 */
export function parseAgentTask(raw: Record<string, unknown>): AgentTask {
  const artifacts = Array.isArray(raw.artifacts) ? (raw.artifacts as RawArtifact[]) : [];
  const branchArtifact = artifacts.find((artifact) => artifact?.type === 'branch')?.data;
  const pullArtifact = artifacts.find((artifact) => artifact?.type === 'pull')?.data;
  const rawSessions = Array.isArray(raw.sessions) ? (raw.sessions as Array<Record<string, unknown>>) : [];

  const pullId = pullArtifact ? Number(pullArtifact.id) : NaN;

  return {
    id: String(raw.id ?? ''),
    state: asState(raw.state),
    name: asString(raw.name),
    htmlUrl: asString(raw.html_url),
    sessionCount: typeof raw.session_count === 'number' ? raw.session_count : rawSessions.length,
    sessions: rawSessions.map((session) => {
      const rawUsage = session.usage as { amount?: unknown; type?: unknown } | undefined;
      const amount =
        typeof rawUsage?.amount === 'number' && Number.isFinite(rawUsage.amount) ? rawUsage.amount : undefined;
      const usageType = asString(rawUsage?.type);
      return {
        id: String(session.id ?? ''),
        state: asState(session.state),
        prompt: asString(session.prompt),
        baseRef: asString(session.base_ref),
        headRef: asString(session.head_ref),
        model: normalizeModel(asString(session.model)),
        createdAt: asString(session.created_at),
        updatedAt: asString(session.updated_at),
        completedAt: asString(session.completed_at),
        ...(amount !== undefined && usageType ? { usage: { amount, type: usageType } } : {}),
      };
    }),
    branch: branchArtifact
      ? { baseRef: asString(branchArtifact.base_ref), headRef: asString(branchArtifact.head_ref) }
      : undefined,
    pull: Number.isFinite(pullId) ? { id: pullId, globalId: asString(pullArtifact?.global_id) } : undefined,
    createdAt: asString(raw.created_at),
    updatedAt: asString(raw.updated_at),
  };
}

/**
 * The branch a follow-up round should target, or null when the task has not produced one.
 *
 * Reading this back (rather than reusing the `headRef` that was requested) is the only
 * defence against the silent-ignore behaviour documented on {@link AgentTaskInput.headRef}.
 */
export function resolveTaskBranch(task: AgentTask): string | null {
  return task.branch?.headRef ?? task.sessions[task.sessions.length - 1]?.headRef ?? null;
}

function resolveTimeoutMs(explicit: number | undefined): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) return explicit;
  const fromEnv = Number(process.env.AGENT_TASKS_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_AGENT_TASKS_TIMEOUT_MS;
}

/**
 * Native `fetch` + `AbortSignal.timeout` rejects with `TimeoutError` (a DOMException);
 * a manual `AbortController.abort()` rejects with `AbortError`. Both mean the call did
 * not finish in time, and both must become the same 504 — otherwise a real hang escapes
 * as an unclassified network failure while only the manual-abort test path looks green.
 */
export function isAbortError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : undefined;
  return name === 'AbortError' || name === 'TimeoutError';
}

export function createAgentTasksClient(options: AgentTasksClientOptions): AgentTasksClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const [owner, name] = options.repo.split('/');
  if (!owner || !name) {
    throw new Error(`invalid repo "${options.repo}"`);
  }
  const base = `https://api.github.com/agents/repos/${owner}/${name}/tasks`;
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);

  async function request(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    // Caller-supplied signals win; otherwise every call gets the client ceiling so a
    // hung upstream cannot strand a creator-facing request that awaits dispatch.
    const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        signal,
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': AGENT_TASKS_API_VERSION,
          authorization: `Bearer ${options.token}`,
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new AgentTasksError(`agent tasks ${init.method ?? 'GET'} timed out after ${timeoutMs}ms`, 504);
      }
      throw error;
    }

    if (!response.ok) {
      // A rate-limited dispatch is worth naming distinctly: the same token is the only
      // way to start any build, so exhausting it stops creation outright.
      const detail = isRateLimitResponse(response) ? 'rate limited' : await response.text().catch(() => '');
      throw new AgentTasksError(
        `agent tasks ${init.method ?? 'GET'} ${response.status}: ${detail}`.trim(),
        response.status,
      );
    }

    return (await response.json()) as Record<string, unknown>;
  }

  return {
    async startTask(input: AgentTaskInput): Promise<AgentTask> {
      const body: Record<string, unknown> = {
        prompt: input.prompt,
        base_ref: input.baseRef,
        model: input.model,
        // Always sent explicitly — see AgentTaskInput.createPullRequest for why the
        // documented default cannot be relied on.
        create_pull_request: input.createPullRequest,
      };
      if (input.headRef) body.head_ref = input.headRef;
      if (input.customAgent) body.custom_agent = input.customAgent;

      return parseAgentTask(await request(base, { method: 'POST', body: JSON.stringify(body) }));
    },

    async getTask(taskId: string): Promise<AgentTask | null> {
      try {
        return parseAgentTask(await request(`${base}/${encodeURIComponent(taskId)}`, { method: 'GET' }));
      } catch (error) {
        if (error instanceof AgentTasksError && error.status === 404) return null;
        throw error;
      }
    },

    async listTasks(listOptions = {}): Promise<AgentTask[]> {
      const params = new URLSearchParams();
      if (listOptions.states?.length) params.set('state', listOptions.states.join(','));
      if (listOptions.since) params.set('since', listOptions.since);
      params.set('per_page', String(listOptions.perPage ?? 30));

      const payload = await request(`${base}?${params.toString()}`, { method: 'GET' });
      const tasks = Array.isArray(payload.tasks) ? (payload.tasks as Array<Record<string, unknown>>) : [];
      return tasks.map(parseAgentTask);
    },
  };
}
