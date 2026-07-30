// Builds the coding-agent backend from the environment.
//
// Kept apart from app.ts so that "which backend, configured how" is one readable
// decision rather than a branch buried in server wiring — and so a second backend can be
// added here without touching the server at all.

import type { AgentBackend } from './agent-backend.js';
import { createAgentTasksClient, type AgentTaskModel } from './agent-tasks.js';
import { createCopilotBackend } from './copilot-backend.js';
import { createGitHubClient } from './github-client.js';

interface Logger {
  info: (context: object, message: string) => void;
  warn: (context: object, message: string) => void;
}

/**
 * Returns a backend, or undefined when this environment is not set up to dispatch.
 *
 * Undefined is a supported state, not a failure: local development has no dispatch
 * credential, and an environment can run the whole product without one — submissions
 * still succeed and the games repo's label workflow still starts builds. Refusing to
 * boot without it would make the credential a hard dependency of serving the site,
 * which is the coupling this work exists to remove.
 */
export function createAgentBackendFromEnv(log?: Logger): AgentBackend | undefined {
  // Deliberately its own credential rather than reusing GITHUB_TOKEN. The agent tasks
  // API needs a user-to-server token (installation tokens are unsupported), and keeping
  // it separate means dispatch and serving fail independently — a dispatch PAT expiring
  // must not take the catalog down with it, which is exactly the shared-budget coupling
  // that 403'd two jobs at once on 2026-07-28.
  const token = process.env.AGENT_TASKS_TOKEN?.trim();
  const repo = process.env.GAMES_REPO?.trim() ?? 'gamedevpl/www.gamedev.pl-games';
  if (!token) return undefined;

  const model = (process.env.AGENT_TASKS_MODEL?.trim() as AgentTaskModel | undefined) ?? 'claude-sonnet-4.6';

  log?.info({ repo, model, backend: 'copilot' }, 'agent dispatch enabled');

  return createCopilotBackend({
    tasks: createAgentTasksClient({ token, repo }),
    // Only ever used to open the resumption pull request a revision round needs.
    github: createGitHubClient({ token, repo }),
    baseRef: process.env.GAMES_PUBLISHED_REF?.trim() || 'main',
    model,
    customAgent: process.env.AGENT_CUSTOM_AGENT?.trim() || 'game-builder',
    // Delivery is by upload; a pull request is opened lazily, only when a revision round
    // needs one as resumption context.
    createPullRequest: false,
  });
}
