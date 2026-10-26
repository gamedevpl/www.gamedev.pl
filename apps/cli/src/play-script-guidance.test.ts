import { pathToFileURL } from 'node:url';
import { expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  call: vi.fn(async () => ({ data: { observation: { frame: 1 } } })),
  release: vi.fn(),
}));
vi.mock('./live-game.js', () => ({ findLiveGame: () => fake }));
import { liveGameTools } from './live-game-tools.js';

it('nudges repeated direct actions once, without adding guidance to script calls', async () => {
  const tools = liveGameTools(() => 'preview');
  const signal = new AbortController().signal;
  const act = { actions: [{ kind: 'step', frames: 1 }], screenshot: false };
  const guidance = (result: { content: Array<{ type: string; text?: string }> }) =>
    result.content.find((item) => item.type === 'text' && item.text?.startsWith('Play guidance:'))?.text;
  const read = (result: { content: Array<{ type: string; text?: string }> }) => JSON.parse(result.content[0]!.text!);
  try {
    expect(guidance(await tools.call('game_act', act, signal))).toBeUndefined();
    expect(guidance(await tools.call('game_act', act, signal))).toContain('game_script_client');
    expect(guidance(await tools.call('game_act', act, signal))).toBeUndefined();
    const setup = read(await tools.call('game_script_client', {}, signal));
    expect(guidance(await tools.call('game_act', act, signal))).toContain('working directory');
    expect(guidance(await tools.call('game_act', act, signal))).toBeUndefined();
    const { connect } = await import(pathToFileURL(setup.modulePath).href);
    const client = await connect();
    expect((await client.act(act.actions)).hostGuidance).toBeUndefined();
    expect((await client.act(act.actions)).hostGuidance).toBeUndefined();
    expect(guidance(await tools.call('game_act', act, signal))).toBeUndefined();
  } finally {
    tools.close();
  }
});
