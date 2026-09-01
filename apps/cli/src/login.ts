import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { hostname as osHostname } from 'node:os';
import { cliUsage } from './bin-name.js';
import { CliError, EXIT_AUTH, EXIT_INPUT } from './exit-codes.js';
import { FILE_FALLBACK_WARNING, fileKeychainOptedIn, type TokenStore } from './keychain.js';
import { authorizeUrl, GAMEDEV_CLI_CLIENT_ID, randomVerifier, s256Challenge } from './oauth.js';
import { openUrl as defaultOpenUrl } from './open-url.js';
import { glyphs, wantsColor } from './renderer.js';

export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const DONE_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>gamedevpl</title></head><body><p>Signed in. You can close this tab.</p></body></html>';
const DENY_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>gamedevpl</title></head><body><p>Sign-in cancelled. You can close this tab.</p></body></html>';
const BAD_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>gamedevpl</title></head><body><p>This sign-in link is invalid. Return to the terminal.</p></body></html>';

const FAIL_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>gamedevpl</title></head><body><p>Sign-in failed. Return to the terminal.</p></body></html>';

type CallbackResult = { kind: 'code'; code: string } | { kind: 'denied'; error: string };

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type LoopbackLoginInput = {
  origin: string;
  store: TokenStore;
  stdout: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  isTty?: boolean;
  fetch?: FetchLike;
  openUrl?: (url: string) => Promise<boolean>;
  device?: string;
  timeoutMs?: number;
};

function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function deviceName(explicit?: string): string {
  const raw = (explicit ?? osHostname()).trim() || 'this device';
  return raw.slice(0, 40);
}

async function exchangeCode(input: {
  origin: string;
  code: string;
  redirectUri: string;
  verifier: string;
  fetch: FetchLike;
}): Promise<{ accessToken: string; refreshToken?: string; tokenType: string; scope: string }> {
  const res = await input.fetch(`${input.origin}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: GAMEDEV_CLI_CLIENT_ID,
      code_verifier: input.verifier,
    }).toString(),
  });
  if (!res.ok) {
    throw new CliError(`sign-in failed — run \`${cliUsage('login')}\` again`, EXIT_AUTH, cliUsage('login'));
  }
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
  };
  if (!body.access_token) {
    throw new CliError(`sign-in failed — run \`${cliUsage('login')}\` again`, EXIT_AUTH, cliUsage('login'));
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    tokenType: body.token_type ?? 'Bearer',
    scope: body.scope ?? 'creator',
  };
}

function listen(expectedState: string): Promise<{
  redirectUri: string;
  done: Promise<CallbackResult>;
  close: () => Promise<void>;
}> {
  return new Promise((resolveListen, rejectListen) => {
    let settle: ((value: CallbackResult) => void) | undefined;
    const done = new Promise<CallbackResult>((resolve) => {
      settle = resolve;
    });
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const host = req.headers.host ?? '127.0.0.1';
      const url = new URL(req.url ?? '/', `http://${host}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }
      const state = url.searchParams.get('state') ?? '';
      if (!sameSecret(state, expectedState)) {
        sendHtml(res, 400, BAD_PAGE);
        return;
      }
      const err = url.searchParams.get('error');
      if (err) {
        const cancelled = err === 'access_denied';
        sendHtml(res, 200, cancelled ? DENY_PAGE : FAIL_PAGE);
        settle?.({ kind: 'denied', error: err });
        return;
      }
      const code = url.searchParams.get('code') ?? '';
      if (!code) {
        sendHtml(res, 400, BAD_PAGE);
        return;
      }
      sendHtml(res, 200, DONE_PAGE);
      settle?.({ kind: 'code', code });
    });
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        rejectListen(new Error('loopback listen failed'));
        return;
      }
      resolveListen({
        redirectUri: `http://127.0.0.1:${addr.port}/callback`,
        done,
        close: () =>
          new Promise((resolve) => {
            server.close(() => resolve());
          }),
      });
    });
  });
}

export async function runLoopbackLogin(input: LoopbackLoginInput): Promise<void> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetch ?? fetch;
  const open = input.openUrl ?? defaultOpenUrl;
  const timeoutMs = input.timeoutMs ?? LOGIN_TIMEOUT_MS;
  const g = glyphs(wantsColor(env, input.isTty ?? false));
  const verifier = randomVerifier();
  const state = randomVerifier();
  const loop = await listen(state);
  const url = authorizeUrl({
    origin: input.origin,
    redirectUri: loop.redirectUri,
    challenge: s256Challenge(verifier),
    state,
    device: deviceName(input.device),
  });
  input.stdout.write(`${g.work} opening the browser to sign in\n`);
  const opened = await open(url);
  if (!opened) input.stdout.write(`open ${url}\n`);
  else input.stdout.write(`${url}\n`);
  let result: CallbackResult;
  try {
    result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new CliError(`sign-in timed out — run \`${cliUsage('login')}\` again`, EXIT_INPUT, cliUsage('login')));
      }, timeoutMs);
      loop.done.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  } finally {
    await loop.close();
  }
  if (result.kind === 'denied') {
    if (result.error === 'access_denied') {
      throw new CliError('sign-in cancelled', EXIT_AUTH, cliUsage('login'));
    }
    throw new CliError(
      `sign-in failed (${result.error}) — run \`${cliUsage('login')}\` again`,
      EXIT_AUTH,
      cliUsage('login'),
    );
  }
  const tokens = await exchangeCode({
    origin: input.origin,
    code: result.code,
    redirectUri: loop.redirectUri,
    verifier,
    fetch: fetchImpl,
  });
  await input.store.set({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: tokens.tokenType,
    scope: tokens.scope,
  });
  if (fileKeychainOptedIn(env) && input.store.kind === 'encrypted-file') {
    input.stderr?.write(`${FILE_FALLBACK_WARNING}\n`);
  }
  input.stdout.write(`${g.ok} signed in\n`);
}
