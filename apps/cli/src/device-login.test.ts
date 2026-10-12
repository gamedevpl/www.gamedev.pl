import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDeviceLogin, shouldOpenLoginBrowser } from './device-login.js';
import { memoryStore } from './keychain.js';
import { GAMEDEV_CLI_CLIENT_ID } from './oauth.js';
import { runLogin } from './sign-in.js';

vi.mock('node:timers/promises', () => ({
  setTimeout: (ms: number, value: unknown, options: { signal: AbortSignal }) =>
    new Promise((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        reject(options.signal.reason);
      };
      const timer = setTimeout(() => {
        options.signal.removeEventListener('abort', cancel);
        resolve(value);
      }, ms);
      options.signal.addEventListener('abort', cancel, { once: true });
      if (options.signal.aborted) cancel();
    }),
}));

const origin = 'https://www.gamedev.pl';
const authorization = {
  device_code: 'private-device-code',
  user_code: 'BCDF-GHJK',
  verification_uri: `${origin}/device`,
  verification_uri_complete: `${origin}/device?user_code=BCDF-GHJK`,
  expires_in: 600,
  interval: 5,
};
const tokens = {
  access_token: 'private-access-token',
  refresh_token: 'private-refresh-token',
  token_type: 'Bearer',
  scope: 'creator',
};
const response = (body: unknown, status = 200) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body, headers: new Headers() }) as Response;

afterEach(() => vi.useRealTimers());

function fixture(env: NodeJS.ProcessEnv = { CODESPACES: 'true' }) {
  vi.useFakeTimers();
  const stdout = new PassThrough();
  let output = '';
  stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  const store = memoryStore();
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response(authorization));
  const openUrl = vi.fn().mockResolvedValue(true);
  return { input: { origin, stdout, store, fetch, openUrl, env }, output: () => output };
}

describe('device sign-in', () => {
  it('receives tokens without opening a browser or requiring a localhost callback', async () => {
    const f = fixture();
    f.input.fetch
      .mockResolvedValueOnce(response({ error: 'authorization_pending' }, 400))
      .mockResolvedValueOnce(response(tokens));
    const done = runLogin(f.input);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(f.input.openUrl).not.toHaveBeenCalled();
    expect(f.input.fetch.mock.calls.map(([url]) => url)).toEqual([
      `${origin}/oauth/device`,
      `${origin}/oauth/token`,
      `${origin}/oauth/token`,
    ]);
    const issued = new URLSearchParams(f.input.fetch.mock.calls[0]![1]!.body as string);
    expect(issued.get('client_id')).toBe(GAMEDEV_CLI_CLIENT_ID);
    expect(issued.get('scope')).toBe('creator');
    const poll = new URLSearchParams(f.input.fetch.mock.calls[1]![1]!.body as string);
    expect(poll.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
    expect(poll.get('device_code')).toBe(authorization.device_code);
    expect(await f.input.store.get()).toEqual({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: 'Bearer',
      scope: 'creator',
    });
    expect(f.output()).toContain(authorization.verification_uri_complete);
    expect(f.output()).toContain('signed in');
    expect(f.output()).not.toContain('private-');
  });

  it('opens the approval page locally and respects --no-browser', async () => {
    for (const noBrowser of [false, true]) {
      const f = fixture({ DISPLAY: ':0' });
      f.input.fetch.mockResolvedValueOnce(response(tokens));
      const done = runDeviceLogin({ ...f.input, noBrowser });
      await vi.advanceTimersByTimeAsync(5000);
      await done;
      if (noBrowser) expect(f.input.openUrl).not.toHaveBeenCalled();
      else expect(f.input.openUrl).toHaveBeenCalledWith(authorization.verification_uri_complete);
    }
  });

  it('continues with the printed link when opening the browser throws', async () => {
    const f = fixture({ DISPLAY: ':0' });
    f.input.openUrl.mockRejectedValue(new Error('browser unavailable'));
    f.input.fetch.mockResolvedValueOnce(response(tokens));
    const done = runDeviceLogin(f.input);
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(f.output()).toContain('signed in');
  });

  it('increases the polling interval after slow_down and transient failures', async () => {
    const f = fixture();
    f.input.fetch
      .mockResolvedValueOnce(response({ error: 'slow_down' }, 400))
      .mockRejectedValueOnce(new Error('temporary connection error'))
      .mockResolvedValueOnce(response({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(response(tokens));
    const done = runDeviceLogin(f.input);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.input.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(9999);
    expect(f.input.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.input.fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.input.fetch).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(40_000);
    await done;
  });

  it.each(['access_denied', 'expired_token', 'invalid_grant'])(
    'ends without saving credentials on %s',
    async (error) => {
      const f = fixture();
      f.input.fetch.mockResolvedValueOnce(response({ error }, 400));
      const done = runDeviceLogin(f.input);
      const rejected = expect(done).rejects.toThrow(/sign-in/);
      await vi.advanceTimersByTimeAsync(5000);
      await rejected;
      expect(await f.input.store.get()).toBeNull();
    },
  );

  it('expires without another poll when the authorization deadline passes', async () => {
    const f = fixture();
    f.input.fetch.mockReset().mockResolvedValueOnce(response({ ...authorization, expires_in: 3 }));
    const rejected = expect(runDeviceLogin(f.input)).rejects.toThrow('code expired');
    await vi.advanceTimersByTimeAsync(3000);
    await rejected;
    expect(f.input.fetch).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending poll without saving a token', async () => {
    const f = fixture();
    const controller = new AbortController();
    const rejected = expect(runDeviceLogin({ ...f.input, abort: controller.signal })).rejects.toThrow('cancelled');
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    expect(f.input.fetch).toHaveBeenCalledTimes(1);
    expect(await f.input.store.get()).toBeNull();
  });

  it('makes no request when sign-in is already cancelled', async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(runDeviceLogin({ ...f.input, abort: controller.signal })).rejects.toThrow('cancelled');
    expect(f.input.fetch).not.toHaveBeenCalled();
  });

  it('never retries faster than a server-provided polling interval', async () => {
    const f = fixture();
    f.input.fetch
      .mockReset()
      .mockResolvedValueOnce(response({ ...authorization, interval: 90 }))
      .mockRejectedValueOnce(new Error('temporary connection error'))
      .mockResolvedValueOnce(response(tokens));
    const done = runDeviceLogin(f.input);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(f.input.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(89_999);
    expect(f.input.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await done;
  });

  it('rejects approval links on another origin before opening a browser', async () => {
    const f = fixture({ DISPLAY: ':0' });
    f.input.fetch
      .mockReset()
      .mockResolvedValueOnce(response({ ...authorization, verification_uri_complete: 'https://example.com/device' }));
    await expect(runDeviceLogin(f.input)).rejects.toThrow('sign-in failed');
    expect(f.input.openUrl).not.toHaveBeenCalled();
  });

  it('explains unavailable device sign-in without silently launching loopback', async () => {
    const f = fixture();
    f.input.fetch.mockReset().mockResolvedValueOnce(response({}, 404));
    await expect(runLogin(f.input)).rejects.toThrow('--loopback');
    expect(f.input.openUrl).not.toHaveBeenCalled();
  });

  it('rejects malformed tokens without printing or storing them', async () => {
    const f = fixture();
    f.input.fetch.mockResolvedValueOnce(response({ ...tokens, scope: 'creator ownership' }));
    const rejected = expect(runDeviceLogin(f.input)).rejects.toThrow('sign-in failed');
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(await f.input.store.get()).toBeNull();
    expect(f.output()).not.toContain(tokens.access_token);
  });
});

describe('login browser selection', () => {
  it.each([
    { CODESPACES: 'true' },
    { SSH_CONNECTION: 'remote local' },
    { SSH_CLIENT: 'remote' },
    { SSH_TTY: '/dev/pts/0' },
    { CI: '1' },
  ])('prints a link in a remote environment: %j', (env) => {
    expect(shouldOpenLoginBrowser({ ...env, DISPLAY: ':0' })).toBe(false);
  });
  it('checks the display on Linux and permits local desktop platforms', () => {
    expect(shouldOpenLoginBrowser({}, 'linux')).toBe(false);
    expect(shouldOpenLoginBrowser({ WAYLAND_DISPLAY: 'wayland-0' }, 'linux')).toBe(true);
    expect(shouldOpenLoginBrowser({}, 'darwin')).toBe(true);
    expect(shouldOpenLoginBrowser({}, 'win32')).toBe(true);
  });
});
