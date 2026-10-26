import {
  closeSync,
  constants,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { expect, it, vi } from 'vitest';
import { createPlayScriptClient } from './play-script-client.js';
import { liveGameTools } from './live-game-tools.js';

it('bounds script calls, keeps credentials out of results and releases on cancellation', async () => {
  const abort = new AbortController();
  const release = vi.fn();
  const call = vi.fn(async () => ({ content: [{ type: 'text', text: JSON.stringify({ data: { value: 1 } }) }] }));
  const setup = await createPlayScriptClient({ call, signal: abort.signal, maxCalls: 2, timeoutMs: 60000, release });
  try {
    const { connect } = await import(pathToFileURL(setup.modulePath).href);
    const client = await connect();
    expect(await client.observe()).toEqual({ data: { value: 1 } });
    await client.act([{ kind: 'step', frames: 1 }]);
    await expect(client.observe()).rejects.toThrow('budget exhausted');
    expect(call).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledOnce();
    await client.call('game_release_control');
    await expect(client.call('game_script_client')).rejects.toThrow('Unsupported');
    await expect(client.call('submit_sources')).rejects.toThrow('Unsupported');
    expect(readFileSync(setup.modulePath, 'utf8')).toContain('Bearer');
    abort.abort();
    expect(existsSync(setup.modulePath)).toBe(false);
    await expect(client.observe()).rejects.toThrow();
  } finally {
    setup.close();
  }
});

it('closes idle script endpoints at the deadline', async () => {
  const release = vi.fn();
  const setup = await createPlayScriptClient({
    call: vi.fn(),
    signal: new AbortController().signal,
    maxCalls: 5,
    timeoutMs: 1000,
    release,
  });
  try {
    await vi.waitFor(() => expect(existsSync(setup.modulePath)).toBe(false), { timeout: 3000 });
    expect(release).toHaveBeenCalledOnce();
  } finally {
    setup.close();
  }
});

it('releases control if the heuristic throws, without replaying its actions', async () => {
  const call = vi.fn(async (..._args: unknown[]) => ({ content: [{ type: 'text', text: '{}' }] }));
  const setup = await createPlayScriptClient({
    call,
    signal: new AbortController().signal,
    maxCalls: 10,
    timeoutMs: 60000,
    release: vi.fn(),
  });
  try {
    const { connect } = await import(pathToFileURL(setup.modulePath).href);
    const client = await connect();
    await expect(
      client.run(async ({ act }: { act: (actions: unknown[]) => Promise<unknown> }) => {
        await act([{ kind: 'step', frames: 1 }]);
        throw Error('heuristic got stuck');
      }),
    ).rejects.toThrow('heuristic got stuck');
    expect(call.mock.calls.map((args) => args[0])).toEqual(['game_take_control', 'game_act', 'game_release_control']);
  } finally {
    setup.close();
  }
});

it('serializes client replacement within the task', async () => {
  const tools = liveGameTools(() => undefined);
  try {
    const pending = tools.call('game_script_client', {}, new AbortController().signal);
    await expect(tools.call('game_script_client', {}, new AbortController().signal)).rejects.toThrow('already running');
    const result = await pending;
    const first = JSON.parse((result.content[0] as { text: string }).text).modulePath;
    const replacement = await tools.call('game_script_client', {}, new AbortController().signal);
    expect(existsSync(first)).toBe(false);
    const last = JSON.parse((replacement.content[0] as { text: string }).text).modulePath;
    expect(existsSync(last)).toBe(true);
    tools.close();
    expect(existsSync(last)).toBe(false);
  } finally {
    tools.close();
  }
});

it.skipIf(process.platform === 'win32')(
  'preserves large Unicode observations and serializes concurrent requests without network',
  async () => {
    const value = 'zażółć 🐉 '.repeat(16000);
    const setup = await createPlayScriptClient({
      call: vi.fn(async () => ({ content: [{ type: 'text', text: JSON.stringify({ data: { value } }) }] })),
      signal: new AbortController().signal,
      maxCalls: 10,
      timeoutMs: 60000,
      release: vi.fn(),
    });
    try {
      const { connect } = await import(pathToFileURL(setup.modulePath).href);
      const client = await connect();
      await expect(connect()).rejects.toThrow('already in use');
      const replies = await Promise.all([client.observe(), client.observe(), client.observe()]);
      for (const reply of replies) expect(reply.data.value).toBe(value);
      client.close();
    } finally {
      setup.close();
    }
  },
);

it('cancels an in-flight action and removes its client when the task stops', async () => {
  const abort = new AbortController();
  const release = vi.fn();
  const call = vi.fn(
    (_name: unknown, _args: unknown, signal: AbortSignal) =>
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true });
      }),
  );
  const setup = await createPlayScriptClient({ call, signal: abort.signal, maxCalls: 10, timeoutMs: 60000, release });
  try {
    const { connect } = await import(pathToFileURL(setup.modulePath).href);
    const client = await connect();
    const running = client.act([{ kind: 'step', frames: 20 }]);
    const failure = expect(running).rejects.toThrow();
    await vi.waitFor(() => expect(call).toHaveBeenCalledOnce());
    abort.abort();
    await failure;
    expect(release).toHaveBeenCalledOnce();
    expect(existsSync(setup.modulePath)).toBe(false);
  } finally {
    setup.close();
  }
});

it('removes the client even if releasing control throws', async () => {
  const setup = await createPlayScriptClient({
    call: vi.fn(),
    signal: new AbortController().signal,
    maxCalls: 5,
    timeoutMs: 60000,
    release: () => {
      throw Error('closed socket');
    },
  });
  expect(() => setup.close()).not.toThrow();
  expect(existsSync(setup.modulePath)).toBe(false);
});

it.skipIf(process.platform === 'win32')('does not follow a replaced client directory during cleanup', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'play-fifo-path-'));
  const outside = mkdtempSync(join(tmpdir(), 'play-fifo-outside-'));
  const setup = await createPlayScriptClient({
    cwd,
    call: vi.fn(),
    signal: new AbortController().signal,
    maxCalls: 5,
    timeoutMs: 60000,
    release: vi.fn(),
  });
  try {
    const directory = dirname(setup.modulePath);
    renameSync(directory, `${directory}-moved`);
    writeFileSync(join(outside, 'client.mjs'), 'keep');
    symlinkSync(outside, directory);
    setup.close();
    expect(readFileSync(join(outside, 'client.mjs'), 'utf8')).toBe('keep');
    expect(existsSync(join(`${directory}-moved`, 'client.mjs'))).toBe(false);
  } finally {
    setup.close();
    rmSync(cwd, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

it.skipIf(process.platform === 'win32')('rejects unauthenticated pipe requests', async () => {
  const call = vi.fn();
  const setup = await createPlayScriptClient({
    call,
    signal: new AbortController().signal,
    maxCalls: 5,
    timeoutMs: 60000,
    release: vi.fn(),
  });
  let request: number | undefined, response: number | undefined;
  try {
    expect(statSync(dirname(setup.modulePath)).mode & 0o077).toBe(0);
    expect(statSync(setup.modulePath).mode & 0o077).toBe(0);
    const source = readFileSync(setup.modulePath, 'utf8');
    const config = JSON.parse(source.match(/const config=(\{[^\n]+\});/)![1]!);
    request = openSync(config.request, constants.O_WRONLY | constants.O_NONBLOCK);
    response = openSync(config.response, constants.O_RDONLY | constants.O_NONBLOCK);
    writeSync(
      request,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        authorization: 'Bearer wrong',
        method: 'tools/call',
        params: { name: 'game_take_control', arguments: {} },
      }) + '\n',
    );
    await vi.waitFor(() => {
      const bytes = Buffer.alloc(1024);
      const count = readSync(response!, bytes, 0, bytes.length, null);
      const reply = JSON.parse(bytes.toString('utf8', 0, count));
      expect(reply.error.message).toContain('Invalid Play script request');
    });
    expect(call).not.toHaveBeenCalled();
  } finally {
    if (request !== undefined) closeSync(request);
    if (response !== undefined) closeSync(response);
    setup.close();
  }
});
