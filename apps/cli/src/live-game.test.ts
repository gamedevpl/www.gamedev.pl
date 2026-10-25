import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { afterEach, expect, it, vi } from 'vitest';
import { createLiveGame, findLiveGame } from './live-game.js';

const games: ReturnType<typeof createLiveGame>[] = [];
afterEach(() => {
  games.splice(0).forEach((game) => game.close());
  vi.useRealTimers();
});
function fixture() {
  let source = 1;
  const game = createLiveGame(() => source);
  games.push(game);
  game.register('http://127.0.0.1:12345/');
  const tab = () => {
    const socket = Object.assign(new EventEmitter(), { readyState: WebSocket.OPEN, send: vi.fn() });
    const id = randomUUID();
    const message = (data: unknown) => socket.emit('message', Buffer.from(JSON.stringify(data)));
    game.connect(socket as unknown as WebSocket);
    const hello = (revision = 'build') => message({ type: 'live:hello', tabId: id, sourceId: source, revision });
    hello();
    return {
      socket,
      id,
      message,
      hello,
      reply() {
        const request = JSON.parse(socket.send.mock.calls.at(-1)![0]);
        message({ type: 'live:result', id: request.id, data: { observation: { frame: 42 } } });
      },
    };
  };
  const signal = new AbortController();
  return {
    game,
    tab,
    signal,
    changeSource() {
      source++;
      game.register('http://127.0.0.1:12346/');
    },
  };
}

it('observes the selected tab without taking control; correlates replies with their socket', async () => {
  const { game, tab, signal } = fixture();
  const first = tab(),
    second = tab();
  expect(() => first.message(null)).not.toThrow();
  expect(() => first.message([])).not.toThrow();
  await expect(game.call('task', 'game_observe', {}, signal.signal)).rejects.toThrow('Available tabs');
  first.message({ type: 'live:select' });
  const pending = game.call('task', 'game_observe', {}, signal.signal);
  const request = JSON.parse(first.socket.send.mock.calls.at(-1)![0]);
  expect(request).toMatchObject({ operation: 'game_observe', revision: 'build', sourceId: 1 });
  second.message({ type: 'live:result', id: request.id, data: 'forged' });
  first.reply();
  expect(await pending).toMatchObject({ tabId: first.id, data: { observation: { frame: 42 } } });
  await expect(
    game.call('task', 'game_act', { actions: [{ kind: 'step', frames: 2 }] }, signal.signal),
  ).rejects.toThrow('first');
});

it('pins control to one task and tab, and refuses reacquisition after the creator reclaims it', async () => {
  const { game, tab, signal } = fixture();
  const first = tab();
  const take = game.call('task', 'game_take_control', {}, signal.signal);
  first.reply();
  await take;
  await expect(game.call('other', 'game_take_control', {}, signal.signal)).rejects.toThrow('owns');
  const act = game.call(
    'task',
    'game_act',
    { actions: [{ kind: 'press', key: 'ArrowRight', frames: 30 }] },
    signal.signal,
  );
  const failure = expect(act).rejects.toThrow('reclaimed');
  first.message({ type: 'live:reclaim' });
  await failure;
  await expect(game.call('task', 'game_take_control', {}, signal.signal)).rejects.toThrow('revoked');
  await expect(game.call('task', 'game_release_control', {}, signal.signal)).resolves.toMatchObject({
    data: { alreadyReleased: true },
  });
  game.release('task');
  const next = game.call('next-task', 'game_take_control', {}, signal.signal);
  first.reply();
  await next;
  const sent = first.socket.send.mock.calls.length;
  await expect(game.call('task', 'game_release_control', {}, signal.signal)).resolves.toMatchObject({
    data: { alreadyReleased: true },
  });
  expect(first.socket.send.mock.calls).toHaveLength(sent);
  game.release('next-task');
  expect(JSON.parse(first.socket.send.mock.calls.at(-1)![0])).toEqual({ type: 'live:release' });
});

it('rejects arbitrary execution, excess frames and extra fields before sending commands', async () => {
  const { game, tab, signal } = fixture();
  const first = tab();
  for (const args of [
    { actions: [{ kind: 'eval', code: 'alert(1)' }] },
    { actions: [{ kind: 'step', frames: 301 }] },
    { actions: Array.from({ length: 3 }, () => ({ kind: 'step', frames: 300 })) },
    { actions: [{ kind: 'click', x: 3, y: 0 }] },
    { actions: [{ kind: 'step', frames: 1 }], url: 'https://example.com' },
  ])
    await expect(game.call('task', 'game_act', args, signal.signal)).rejects.toThrow();
  expect(first.socket.send).not.toHaveBeenCalled();
});

it.each(['abort', 'disconnect', 'build', 'source', 'timeout'])(
  'releases control and refuses late action replies on %s',
  async (reason) => {
    vi.useFakeTimers();
    const { game, tab, signal, changeSource } = fixture();
    const first = tab();
    const take = game.call('task', 'game_take_control', {}, signal.signal);
    first.reply();
    await take;
    const act = game.call('task', 'game_act', { actions: [{ kind: 'step', frames: 30 }] }, signal.signal);
    const failure = expect(act).rejects.toThrow();
    if (reason === 'abort') signal.abort();
    if (reason === 'disconnect') first.socket.emit('close');
    if (reason === 'build') first.hello('new-build');
    if (reason === 'source') changeSource();
    if (reason === 'timeout') await vi.advanceTimersByTimeAsync(10_001);
    await failure;
    expect(first.socket.send.mock.calls.some(([data]) => JSON.parse(data).type === 'live:release')).toBe(true);
    expect(findLiveGame('http://127.0.0.1:12345/')).toBe(reason === 'source' ? undefined : game);
  },
);
