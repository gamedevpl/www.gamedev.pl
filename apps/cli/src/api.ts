import { cliUsage } from './bin-name.js';
import { credentialExpired, moderationRefusal } from './errors.js';
import { CliError, EXIT_AUTH, EXIT_INPUT, EXIT_REFUSED } from './exit-codes.js';
import type { StoredTokens, TokenStore } from './keychain.js';
import { refreshGrant } from './oauth.js';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ApiClient {
  origin: string;
  request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
  requestBytes(path: string, signal?: AbortSignal): Promise<Buffer>;
}

export function bearerFrom(tokens: StoredTokens | null, env: NodeJS.ProcessEnv): string | null {
  const pat = env.GAMEDEV_TOKEN?.trim();
  if (pat) return pat;
  return tokens?.accessToken ?? null;
}

function throwForStatus(res: Response, errBody: { error?: string; message?: string }): never {
  const error =
    res.status === 422 && errBody.error === 'content_rejected'
      ? moderationRefusal()
      : res.status === 401
        ? credentialExpired()
        : new CliError(
            res.status === 404 ? 'not found' : (errBody.message ?? errBody.error ?? `request failed (${res.status})`),
            EXIT_REFUSED,
          );
  error.apiCode = errBody.error;
  error.httpStatus = res.status;
  throw error;
}

async function waitForRefresh(refresh: Promise<void>, signal?: AbortSignal | null): Promise<void> {
  if (!signal) return refresh;
  let stop: () => void;
  try {
    await new Promise<void>((resolve, reject) => {
      stop = () => reject(signal.reason);
      signal.addEventListener('abort', stop, { once: true });
      refresh.then(resolve, reject);
      if (signal.aborted) stop();
    });
  } finally {
    signal.removeEventListener('abort', stop!);
  }
}

export function createApi(input: {
  origin: string;
  store: TokenStore;
  fetch?: FetchLike;
  env?: NodeJS.ProcessEnv;
  shutdownSignal?: AbortSignal;
}): ApiClient {
  const fetchImpl = input.fetch ?? fetch;
  const env = input.env ?? process.env;
  let refreshWait: Promise<void> | null = null;

  async function send(path: string, init: RequestInit): Promise<{ response: Response; token: string }> {
    const token = bearerFrom(await input.store.get(), env);
    if (!token) {
      throw new CliError(`not signed in — run \`${cliUsage('login')}\``, EXIT_AUTH, cliUsage('login'));
    }
    const response = await fetchImpl(`${input.origin}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    return { response, token };
  }

  async function refreshOnce(failedToken: string): Promise<void> {
    if (env.GAMEDEV_TOKEN?.trim()) return;
    await input.store.withLock(async () => {
      const tokens = await input.store.get();
      if (!tokens?.refreshToken || tokens.accessToken !== failedToken) return;
      const next = await refreshGrant({
        origin: input.origin,
        refreshToken: tokens.refreshToken,
        fetch: fetchImpl,
        signal: input.shutdownSignal,
      });
      await input.store.set({
        accessToken: next.accessToken,
        refreshToken: next.refreshToken ?? tokens.refreshToken,
        tokenType: next.tokenType,
        scope: next.scope,
      });
    }, input.shutdownSignal);
  }

  async function authorized(path: string, init: RequestInit): Promise<Response> {
    const first = await send(path, init);
    if (first.response.status !== 401) return first.response;
    if (env.GAMEDEV_TOKEN?.trim()) return first.response;
    const tokens = await input.store.get();
    if (!tokens?.refreshToken) return first.response;
    if (!refreshWait) {
      refreshWait = refreshOnce(first.token).finally(() => {
        refreshWait = null;
      });
    }
    await waitForRefresh(refreshWait, init.signal);
    return (await send(path, init)).response;
  }

  return {
    origin: input.origin,
    async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
      const res = await authorized(path, {
        signal,
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : {},
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) {
        throwForStatus(res, (await res.json().catch(() => ({}))) as { error?: string; message?: string });
      }
      return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
    },
    async requestBytes(path: string, signal?: AbortSignal): Promise<Buffer> {
      const res = await authorized(path, {
        method: 'GET',
        signal,
      });
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
