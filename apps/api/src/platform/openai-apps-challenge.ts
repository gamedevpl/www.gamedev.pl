/**
 * OpenAI Apps domain-verification challenge.
 *
 * The ChatGPT/Codex plugin submission proves we control the MCP hostname by fetching a
 * token from the origin root: `https://www.gamedev.pl/.well-known/openai-apps-challenge`.
 * The portal issues the token per submission, so it is configuration rather than code and
 * arrives via `OPENAI_APPS_CHALLENGE_TOKEN`.
 *
 * It is **not a secret** — the whole point is that anyone can fetch it — but it is not in
 * git either, because it is per-submission and rotates. A repository *variable* (not a
 * secret) is the right home.
 *
 * Unset means **404, deliberately**. Serving an empty body would satisfy the route and
 * fail verification with no clue why; a 404 says plainly that nothing is configured. The
 * same reasoning as the wall's exemption list: a check that cannot explain itself is worse
 * than one that is absent.
 *
 * The path sits outside `/api/`, so the private-beta wall passes it through without an
 * exemption entry — same as the MCP discovery document.
 */

import type { FastifyInstance } from 'fastify';

export const OPENAI_APPS_CHALLENGE_PATH = '/.well-known/openai-apps-challenge';

/** Verification tokens must not be cached: a stale one outlives the submission it proves. */
const CHALLENGE_CACHE_CONTROL = 'no-store';

export interface OpenAiAppsChallengeOptions {
  /** Overrides `OPENAI_APPS_CHALLENGE_TOKEN`; tests pass it directly. */
  token?: string;
}

export function resolveOpenAiAppsChallengeToken(options: OpenAiAppsChallengeOptions = {}): string {
  return (options.token ?? process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? '').trim();
}

export function registerOpenAiAppsChallengeRoute(app: FastifyInstance, options: OpenAiAppsChallengeOptions = {}): void {
  app.get(OPENAI_APPS_CHALLENGE_PATH, async (_request, reply) => {
    const token = resolveOpenAiAppsChallengeToken(options);
    if (!token) {
      return reply.status(404).send({ error: 'not found' });
    }
    return reply.header('Cache-Control', CHALLENGE_CACHE_CONTROL).type('text/plain; charset=utf-8').send(token);
  });
}
