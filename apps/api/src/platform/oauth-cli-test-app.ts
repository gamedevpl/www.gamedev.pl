import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { consentToken } from './oauth-as.js';
import { GAMEDEV_CLI_CLIENT_ID } from './oauth-first-party.js';
import { pkceChallengeS256 } from './oauth-pkce.js';
import { InMemoryStore } from './store.js';

export const SESSION_SECRET = 'dev-session-secret-change-me';
export const MCP_SECRET = 'oauth-cli-mcp-secret';
export const CLI_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
export const CLI_LOOPBACK = 'http://127.0.0.1:43721/callback';

export function sessionCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, SESSION_SECRET)}`;
}

export function enableCliSurface(): () => void {
  const prev = process.env.CLI_SURFACE;
  process.env.CLI_SURFACE = 'true';
  return () => {
    if (prev === undefined) delete process.env.CLI_SURFACE;
    else process.env.CLI_SURFACE = prev;
  };
}

export async function buildOAuthApp(store: InMemoryStore, extra?: { now?: () => number }) {
  return buildApp({
    store,
    sessionSecret: SESSION_SECRET,
    adminUids: 'g:boss',
    submissionRoutes: {
      githubClient: { createIssue: async () => ({ number: 42 }) } as never,
      githubToken: 'gh-token',
      submissionTokenSecret: MCP_SECRET,
      agentChannel: {},
      now: extra?.now,
    },
  });
}

export async function seedSelfRound(store: InMemoryStore, issue = 42, owner = 'g:creator'): Promise<void> {
  await store.createSubmission(issue, owner, 'Comet Courier');
  await store.setSubmissionSlug(issue, 'comet-courier');
  await store.setSubmissionLocale(issue, 'en');
  await store.setRoundBuilder(issue, 'self');
  await store.setSubmissionBrief(issue, { spec: 'Build it.', qa: [] });
  await store.recordJobTransition(issue, { to: 'dispatched', at: new Date().toISOString(), by: 'system' });
}

export async function mintCreatorTokens(
  app: FastifyInstance,
  input: { redirectUri?: string; uid?: string; scope?: string; device?: string; verifier?: string } = {},
): Promise<{ access_token: string; refresh_token: string; scope: string }> {
  const uid = input.uid ?? 'g:creator';
  const redirectUri = input.redirectUri ?? CLI_LOOPBACK;
  const verifier = input.verifier ?? CLI_VERIFIER;
  const clientId = GAMEDEV_CLI_CLIENT_ID;
  const challenge = pkceChallengeS256(verifier);
  const fields: Record<string, string> = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: input.scope ?? 'creator',
    state: 'xyz',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    action: 'approve',
    consent_token: consentToken({ uid, clientId, codeChallenge: challenge, secret: SESSION_SECRET }),
  };
  if (input.device) fields.device = input.device;
  const approve = await app.inject({
    method: 'POST',
    url: '/oauth/authorize',
    headers: { cookie: sessionCookie(uid), 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(fields).toString(),
  });
  const code = new URL(approve.headers.location as string).searchParams.get('code');
  const tokenRes = await app.inject({
    method: 'POST',
    url: '/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code ?? '',
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }).toString(),
  });
  return tokenRes.json() as { access_token: string; refresh_token: string; scope: string };
}
