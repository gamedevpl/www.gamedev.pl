import { cliUsage } from './bin-name.js';
import { credentialExpired } from './errors.js';
import { CliError, EXIT_AUTH, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import type { StoredTokens, TokenStore } from './keychain.js';
import { refreshGrant } from './oauth.js';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ApiClient {
  origin: string;
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
  requestBytes(path: string): Promise<Buffer>;
}

export function bearerFrom(tokens: StoredTokens | null, env: NodeJS.ProcessEnv): string | null {
  const pat = env.GAMEDEV_TOKEN?.trim();
  if (pat) return pat;
  return tokens?.accessToken ?? null;
}

function throwForStatus(res: Response, errBody: { error?: string; message?: string }): never {
  if (res.status === 401) throw credentialExpired();
  if (res.status === 404) throw new CliError('not found', EXIT_REFUSED);
  throw new CliError(errBody.message ?? errBody.error ?? `request failed (${res.status})`, EXIT_REFUSED);
}

export function createApi(input: {
  origin: string;
  store: TokenStore;
  fetch?: FetchLike;
  env?: NodeJS.ProcessEnv;
}): ApiClient {
  const fetchImpl = input.fetch ?? fetch;
  const env = input.env ?? process.env;
  let refreshWait: Promise<void> | null = null;

  async function send(path: string, init: RequestInit): Promise<Response> {
    const token = bearerFrom(await input.store.get(), env);
    if (!token) {
      throw new CliError(`not signed in — run \`${cliUsage('login')}\``, EXIT_AUTH, cliUsage('login'));
    }
    return fetchImpl(`${input.origin}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
  }

  async function refreshOnce(): Promise<void> {
    if (env.GAMEDEV_TOKEN?.trim()) return;
    const tokens = await input.store.get();
    if (!tokens?.refreshToken) return;
    const next = await refreshGrant({ origin: input.origin, refreshToken: tokens.refreshToken, fetch: fetchImpl });
    await input.store.set({
      accessToken: next.accessToken,
      refreshToken: next.refreshToken ?? tokens.refreshToken,
      tokenType: next.tokenType,
      scope: next.scope,
    });
  }

  async function authorized(path: string, init: RequestInit): Promise<Response> {
    const first = await send(path, init);
    if (first.status !== 401) return first;
    if (env.GAMEDEV_TOKEN?.trim()) return first;
    const tokens = await input.store.get();
    if (!tokens?.refreshToken) return first;
    if (!refreshWait) {
      refreshWait = refreshOnce().finally(() => {
        refreshWait = null;
      });
    }
    await refreshWait;
    return send(path, init);
  }

  return {
    origin: input.origin,
    async request<T>(method: string, path: string, body?: unknown): Promise<T> {
      const res = await authorized(path, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : {},
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) {
        throwForStatus(res, (await res.json().catch(() => ({}))) as { error?: string; message?: string });
      }
      return (await res.json()) as T;
    },
    async requestBytes(path: string): Promise<Buffer> {
      const res = await authorized(path, { method: 'GET' });
      if (!res.ok) {
        throwForStatus(res, (await res.json().catch(() => ({}))) as { error?: string; message?: string });
      }
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

export function requireTtyFlag(isTty: boolean, flag: string, hint: string): void {
  if (!isTty) {
    throw new CliError(`this needs a terminal, or pass ${flag}`, EXIT_INPUT, hint);
  }
}
