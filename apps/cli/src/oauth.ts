import { createHash, randomBytes } from 'node:crypto';

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
