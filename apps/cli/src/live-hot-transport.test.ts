import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { LIVE_GAME_SCRIPT } from './live-game-script.js';

const windows: JSDOM[] = [];
afterEach(() => {
  windows.splice(0).forEach((dom) => dom.window.close());
  vi.clearAllTimers();
  vi.useRealTimers();
});
function fixture(reply: (message: { type: string; phase?: string; id?: string }) => object | undefined) {
  vi.useFakeTimers();
  const dom = new JSDOM(
    '<iframe id="game"></iframe><div id="agent-control"></div><button id="agent-reclaim"></button><button id="agent-select"></button>',
    { runScripts: 'outside-only' },
  );
  windows.push(dom);
  const win = dom.window;
  const messages: { type: string; phase?: string; id?: string }[] = [];
  const socket = Object.assign(new win.EventTarget(), {
    readyState: 1,
    send(value: string) {
      const message = JSON.parse(value) as (typeof messages)[number];
      messages.push(message);
      const response = reply(message);
      if (response)
        socket.dispatchEvent(
          new win.MessageEvent('message', {
            data: JSON.stringify({ type: 'live:hot-result', id: message.id, ...response }),
          }),
        );
    },
  });
  win.eval(
    "var frame=document.getElementById('game'),sourceId=1,revision='A';const el=id=>document.getElementById(id);" +
      LIVE_GAME_SCRIPT,
  );
  win.dispatchEvent(new win.CustomEvent('play-presence-connected', { detail: socket }));
  return {
    messages,
    update: (phase: string) =>
      win.eval(`liveHotUpdate(${JSON.stringify({ phase, id: 'transaction' })})`) as Promise<{ state: string }>,
  };
}

it('returns an explicit busy rejection without querying an unknown transaction', async () => {
  const f = fixture((m) =>
    m.type === 'live:hot' ? { error: 'Wait for the current live operation to finish' } : undefined,
  );
  await expect(f.update('begin')).rejects.toThrow('Wait');
  expect(f.messages.filter((m) => m.type === 'live:hot').map((m) => m.phase)).toEqual(['begin']);
});
it('queries a lost commit acknowledgement before considering another commit', async () => {
  const f = fixture((m) =>
    m.type === 'live:hot' && m.phase === 'status' ? { transaction: { state: 'committed' } } : undefined,
  );
  const pending = f.update('finish');
  await vi.advanceTimersByTimeAsync(3001);
  await expect(pending).resolves.toEqual({ state: 'committed' });
  expect(f.messages.filter((m) => m.type === 'live:hot').map((m) => m.phase)).toEqual(['finish', 'status']);
});

it('retries a lost abort request after confirming that the fence is still prepared', async () => {
  let attempts = 0;
  const f = fixture((m) => {
    if (m.type !== 'live:hot') return;
    if (m.phase === 'status') return { transaction: { state: 'prepared' } };
    if (m.phase === 'abort' && ++attempts === 2) return { transaction: { state: 'aborted' } };
  });
  const pending = f.update('abort');
  await vi.advanceTimersByTimeAsync(3001);
  await expect(pending).resolves.toEqual({ state: 'aborted' });
  expect(f.messages.filter((m) => m.type === 'live:hot').map((m) => m.phase)).toEqual(['abort', 'status', 'abort']);
});
