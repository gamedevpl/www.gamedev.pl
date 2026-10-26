import { existsSync, readFileSync } from 'node:fs';
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
