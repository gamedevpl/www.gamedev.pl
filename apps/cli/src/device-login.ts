import { hostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { cliUsage } from './bin-name.js';
import { CliError, EXIT_AUTH, EXIT_INPUT } from './exit-codes.js';
import type { LoopbackLoginInput } from './login.js';
import { GAMEDEV_CLI_CLIENT_ID } from './oauth.js';
import { openUrl } from './open-url.js';
import { glyphs, wantsColor } from './renderer.js';

export const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

export type DeviceLoginInput = LoopbackLoginInput & { noBrowser?: boolean };

const authorizationSchema = z.object({
  device_code: z.string().min(1).max(512),
  user_code: z.string().min(1).max(64),
  verification_uri: z.string().url(),
  verification_uri_complete: z.string().url().optional(),
  expires_in: z.number().int().positive().max(3600),
  interval: z.number().int().positive().max(3600).default(5),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.literal('Bearer'),
  scope: z.literal('creator'),
});

export function shouldOpenLoginBrowser(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): boolean {
  if (env.CODESPACES === 'true' || env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY || env.CI) return false;
  return platform !== 'linux' || Boolean(env.DISPLAY || env.WAYLAND_DISPLAY || env.MIR_SOCKET);
}

function signInError(message = 'sign-in failed'): CliError {
  return new CliError(`${message} — run \`${cliUsage('login')}\` again`, EXIT_AUTH, cliUsage('login'));
}

export async function runDeviceLogin(input: DeviceLoginInput): Promise<void> {
  const env = input.env ?? process.env;
  const request = input.fetch ?? fetch;
  const g = glyphs(wantsColor(env, input.isTty ?? false));
  let deadline = Date.now() + (input.timeoutMs ?? 10 * 60 * 1000);
  const timeout = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
  let signal = input.abort ? AbortSignal.any([input.abort, timeout]) : timeout;
  let expiration: AbortSignal | undefined;
  const post = async (path: string, fields: Record<string, string>): Promise<Response> =>
    request(`${input.origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      signal,
      redirect: 'error',
    });
  try {
    input.abort?.throwIfAborted();
    const response = await post('/oauth/device', {
      client_id: GAMEDEV_CLI_CLIENT_ID,
      scope: 'creator',
      device: (input.device ?? hostname()).trim().slice(0, 40) || 'this device',
    });
    if (!response.ok) {
      if (response.status === 404)
        throw signInError(`device sign-in is unavailable; for local sign-in use \`${cliUsage('login --loopback')}\``);
      throw signInError(response.status === 429 ? 'too many sign-in attempts; try later' : undefined);
    }
    const parsed = authorizationSchema.safeParse(await response.json());
    if (!parsed.success) throw signInError();
    const authorization = parsed.data;
    const url = authorization.verification_uri_complete ?? authorization.verification_uri;
    for (const candidate of [authorization.verification_uri, url]) {
      const target = new URL(candidate);
      if (target.origin !== new URL(input.origin).origin || target.username || target.password) throw signInError();
    }
    deadline = Math.min(deadline, Date.now() + authorization.expires_in * 1000);
    expiration = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
    signal = AbortSignal.any([signal, expiration]);
    input.stdout.write(`open ${url}\ncode ${authorization.user_code}\n`);
    if (!input.noBrowser && shouldOpenLoginBrowser(env)) {
      input.stdout.write(`${g.work} opening the browser to sign in\n`);
      await (input.openUrl ?? openUrl)(url).catch(() => false);
    }
    input.stdout.write('Approve access on gamedev.pl. Keep this terminal open; Ctrl+C cancels sign-in.\n');
    let intervalMs = authorization.interval * 1000;
    while (Date.now() < deadline) {
      await delay(Math.min(intervalMs, deadline - Date.now()), undefined, { signal });
      if (Date.now() >= deadline) break;
      let tokenResponse: Response;
      try {
        tokenResponse = await post('/oauth/token', {
          grant_type: DEVICE_GRANT_TYPE,
          device_code: authorization.device_code,
          client_id: GAMEDEV_CLI_CLIENT_ID,
        });
      } catch (error) {
        if (signal.aborted) throw error;
        intervalMs = Math.max(intervalMs, Math.min(intervalMs * 2, 60_000));
        continue;
      }
      if (tokenResponse.status >= 500 || tokenResponse.status === 429) {
        const retryAfter = Number(tokenResponse.headers.get('retry-after'));
        intervalMs = Math.max(
          intervalMs,
          Math.min(intervalMs * 2, 60_000),
          Number.isFinite(retryAfter) ? retryAfter * 1000 : 0,
        );
        continue;
      }
      const body: unknown = await tokenResponse.json();
      if (tokenResponse.ok) {
        const tokens = tokenSchema.safeParse(body);
        if (!tokens.success) throw signInError();
        await input.store.withLock(async () => {
          signal.throwIfAborted();
          await input.store.set({
            accessToken: tokens.data.access_token,
            refreshToken: tokens.data.refresh_token,
            tokenType: tokens.data.token_type,
            scope: tokens.data.scope,
          });
        }, signal);
        input.stdout.write(`${g.ok} signed in\n`);
        return;
      }
      const failure = z.object({ error: z.string() }).safeParse(body);
      if (!failure.success) throw signInError();
      switch (failure.data.error) {
        case 'authorization_pending':
          continue;
        case 'slow_down':
          intervalMs += 5000;
          continue;
        case 'access_denied':
          throw signInError('sign-in denied');
        case 'expired_token':
          throw signInError('sign-in code expired');
        default:
          throw signInError();
      }
    }
    throw signInError('sign-in code expired');
  } catch (error) {
    if (input.abort?.aborted) throw new CliError('sign-in cancelled', EXIT_INPUT, cliUsage('login'));
    if (timeout.aborted) throw signInError('sign-in timed out');
    if (expiration?.aborted) throw signInError('sign-in code expired');
    if (error instanceof CliError) throw error;
    throw signInError('could not contact gamedev.pl');
  }
}
