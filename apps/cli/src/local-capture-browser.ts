import { captureNetworkPolicy } from './capture-network-policy.js';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Readable, Writable } from 'node:stream';

export type CaptureImage = { png: string; errors: string[] };
export type CaptureViewport = 'desktop' | 'mobile';
export function chromeExecutable(): string {
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find(existsSync);
  if (!found) throw new Error('Local capture needs installed Chrome or Chromium. No browser was downloaded.');
  return found;
}

export async function captureBrowser(input: {
  url: string;
  viewport: CaptureViewport;
  signal: AbortSignal;
}): Promise<CaptureImage> {
  const executable = chromeExecutable();
  const network = await captureNetworkPolicy(input.url);
  const profile = mkdtempSync(join(tmpdir(), 'gamedev-capture-'));
  network.prepareProfile(profile);
  const child = spawn(
    executable,
    [
      '--headless=new',
      ...network.flags,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      `--user-data-dir=${profile}`,
      '--remote-debugging-pipe',
      'about:blank',
    ],
    {
      stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        SystemRoot: process.env.SystemRoot,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
      },
    },
  );
  const pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let sequence = 0;
  let buffer = Buffer.alloc(0);
  let stderr = '';
  let failure: Error | undefined;
  const errors: string[] = [];
  const fail = (error: Error): void => {
    failure = error;
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pending.clear();
  };
  child.stderr?.on('data', (data: Buffer) => {
    stderr = (stderr + data.toString()).slice(-2000);
  });
  child.once('error', fail);
  child.once('exit', () => fail(new Error(`Capture browser exited. ${stderr}`)));
  const stop = (): void => {
    fail(new Error('Capture cancelled.'));
    child.kill();
  };
  input.signal.addEventListener('abort', stop, { once: true });
  const reader = child.stdio[4] as Readable;
  const writer = child.stdio[3] as Writable;
  writer.on('error', fail);
  reader.on('data', (data: Buffer) => {
    buffer = Buffer.concat([buffer, data]);
    if (buffer.length > 16 * 1024 * 1024) {
      fail(new Error('Browser response too large.'));
      child.kill();
      return;
    }
    let index: number;
    while ((index = buffer.indexOf(0)) !== -1) {
      const frame = buffer.subarray(0, index).toString();
      buffer = buffer.subarray(index + 1);
      try {
        const message = JSON.parse(frame) as {
          id?: number;
          result?: Record<string, unknown>;
          error?: { message: string };
          method?: string;
          params?: Record<string, unknown>;
        };
        if (message.method === 'Target.attachedToTarget') {
          const attached = message.params?.sessionId;
          const info = message.params?.targetInfo as { type?: string } | undefined;
          if (typeof attached === 'string') {
            void (async () => {
              if (info?.type === 'iframe') {
                await send('Runtime.enable', {}, attached);
                await send('Log.enable', {}, attached);
                await send(
                  'Target.setAutoAttach',
                  { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
                  attached,
                );
              }
              await send('Runtime.runIfWaitingForDebugger', {}, attached);
            })().catch((error: Error) => fail(error));
          }
        } else if (message.id !== undefined) {
          const waiter = pending.get(message.id);
          if (waiter) {
            pending.delete(message.id);
            clearTimeout(waiter.timer);
            if (message.error) waiter.reject(new Error(message.error.message));
            else waiter.resolve(message.result ?? {});
          }
        } else if (
          errors.length < 20 &&
          (message.method === 'Runtime.exceptionThrown' ||
            (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') ||
            (message.method === 'Log.entryAdded' &&
              (message.params?.entry as { level?: string } | undefined)?.level === 'error'))
        ) {
          errors.push(JSON.stringify(message.params).slice(0, 1000));
        }
      } catch {
        fail(new Error('Invalid browser response.'));
      }
    }
  });
  const send = (
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> => {
    if (failure) return Promise.reject(failure);
    input.signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Browser timeout: ${method}`));
      }, 10_000);
      pending.set(id, { resolve, reject, timer });
      writer.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
  };
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    if (typeof sessionId !== 'string') throw new Error('Browser did not attach a capture session.');
    const call = (method: string, params: Record<string, unknown> = {}) => send(method, params, sessionId);
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Log.enable');
    await call('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    const [width, height] = input.viewport === 'mobile' ? [390, 844] : [960, 600];
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: input.viewport === 'mobile',
    });
    const navigation = await call('Page.navigate', { url: input.url });
    if (navigation.errorText) throw new Error(String(navigation.errorText));
    await delay(1500, undefined, { signal: input.signal });
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (typeof shot.data !== 'string' || shot.data.length > 4 * 1024 * 1024)
      throw new Error('Invalid or oversized screenshot.');
    const png = Buffer.from(shot.data, 'base64');
    if (!png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('Browser returned no PNG.');
    return { png: shot.data, errors };
  } finally {
    input.signal.removeEventListener('abort', stop);
    fail(new Error('Capture finished.'));
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
    child.kill();
    await Promise.race([closed, delay(1500)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await network.close();
    rmSync(profile, { recursive: true, force: true });
  }
}
