import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { expect, it, vi } from 'vitest';
import { createPlayScriptClient } from './play-script-client.js';

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
    timeoutMs: 25,
    release,
  });
  try {
    await vi.waitFor(() => expect(existsSync(setup.modulePath)).toBe(false));
    expect(release).toHaveBeenCalledOnce();
  } finally {
    setup.close();
  }
});
