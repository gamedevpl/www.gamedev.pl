import { CliError, EXIT_AUTH, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import type { StoredTokens, TokenStore } from './keychain.js';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ApiClient {
  origin: string;
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
}

export function bearerFrom(tokens: StoredTokens | null, env: NodeJS.ProcessEnv): string | null {
  const pat = env.GAMEDEV_TOKEN?.trim();
  if (pat) return pat;
  return tokens?.accessToken ?? null;
}

export function createApi(input: {
  origin: string;
  store: TokenStore;
  fetch?: FetchLike;
  env?: NodeJS.ProcessEnv;
}): ApiClient {
  const fetchImpl = input.fetch ?? fetch;
  const env = input.env ?? process.env;
  return {
    origin: input.origin,
    async request<T>(method: string, path: string, body?: unknown): Promise<T> {
      const token = bearerFrom(await input.store.get(), env);
      if (!token) {
        throw new CliError('not signed in — run `gamedev login`', EXIT_AUTH, 'gamedev login');
      }
      const res = await fetchImpl(`${input.origin}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (res.status === 401) {
        throw new CliError('credential expired or revoked — run `gamedev login`', EXIT_AUTH, 'gamedev login');
      }
      if (res.status === 404) {
        throw new CliError('not found', EXIT_REFUSED);
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new CliError(err.error ?? `request failed (${res.status})`, EXIT_REFUSED);
      }
      return (await res.json()) as T;
    },
  };
}

export function requireTtyFlag(isTty: boolean, flag: string, hint: string): void {
  if (!isTty) {
    throw new CliError(`this needs a terminal, or pass ${flag}`, EXIT_INPUT, hint);
  }
}
