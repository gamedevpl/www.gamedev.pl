import { createHash, randomBytes } from 'node:crypto';
import { grantRevoked, credentialExpired } from './errors.js';

export function randomVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function s256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export const GAMEDEV_CLI_CLIENT_ID = 'gamedev-cli';
export const DEFAULT_ORIGIN = 'https://www.gamedev.pl';

export function originFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (env.GAMEDEV_ORIGIN ?? DEFAULT_ORIGIN).replace(/\/$/, '');
}

export function authorizeUrl(input: {
  origin: string;
  redirectUri: string;
  challenge: string;
  state: string;
  device?: string;
}): string {
  const url = new URL('/oauth/authorize', input.origin);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', GAMEDEV_CLI_CLIENT_ID);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', 'creator');
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (input.device) url.searchParams.set('device', input.device);
  return url.toString();
}

export type TokenResponse = {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope: string;
};

export async function refreshGrant(input: {
  origin: string;
  refreshToken: string;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}): Promise<TokenResponse> {
  const res = await input.fetch(`${input.origin}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
      client_id: GAMEDEV_CLI_CLIENT_ID,
    }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
    error?: string;
  };
  if (!res.ok) {
    if (body.error === 'invalid_grant') throw grantRevoked();
    throw credentialExpired();
  }
  if (!body.access_token) throw grantRevoked();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    tokenType: body.token_type ?? 'Bearer',
    scope: body.scope ?? 'creator',
  };
}
