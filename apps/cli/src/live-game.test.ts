import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { afterEach, expect, it, vi } from 'vitest';
import { createLiveGame, findLiveGame } from './live-game.js';

const games: ReturnType<typeof createLiveGame>[] = [];

it('commits code epochs while retaining an idle lease and fencing actions behind fresh observation', async () => {
  const { game, tab, signal } = fixture();
  const htmlA = '<html>A</html>',
    htmlB = '<html>B</html>';
  const a = createHash('sha256').update(htmlA).digest('hex'),
    b = createHash('sha256').update(htmlB).digest('hex');
  game.retainBuild(1, { html: htmlA, revision: a });
  game.retainBuild(1, { html: htmlB, revision: b });
  const first = tab();
  first.hello(a);
  const take = game.call('owner', 'game_take_control', {}, signal.signal);
  first.reply();
  await take;
  const id = randomUUID(),
    recordingId = randomUUID(),
    previousRecordingId = randomUUID(),
    runtimeInstanceId = randomUUID();
  const begin = {
    type: 'live:hot',
    phase: 'begin',
    id,
    sourceId: 1,
    previousRevision: a,
    revision: b,
    expectedEpoch: 0,
  };
  first.message(begin);
  expect(JSON.parse(first.socket.send.mock.calls.at(-1)![0]).transaction.state).toBe('prepared');
  await expect(game.call('owner', 'game_observe', {}, signal.signal)).rejects.toThrow('update');
  const finish = {
    type: 'live:hot',
    phase: 'finish',
    id,
    result: 'applied',
    epoch: 1,
    runtimeInstanceId,
    previousRecordingId,
    recordingId,
    frame: 12,
    simulationTick: 8,
  };
  first.message(finish);
  first.hello(a);
  await expect(game.call('other', 'game_take_control', {}, signal.signal)).rejects.toThrow('owns');
  await expect(
    game.call('owner', 'game_act', { actions: [{ kind: 'step', frames: 1 }] }, signal.signal),
  ).rejects.toThrow('game_observe');
  const observation = game.call('owner', 'game_observe', {}, signal.signal);
  first.reply();
  await observation;
  const action = game.call('owner', 'game_act', { actions: [{ kind: 'step', frames: 1 }] }, signal.signal);
  expect(JSON.parse(first.socket.send.mock.calls.at(-1)![0]).revision).toBe(b);
  first.reply();
  await action;
  first.message(finish);
  first.message({ type: 'live:hot', phase: 'status', id });
  expect(JSON.parse(first.socket.send.mock.calls.at(-1)![0]).transaction).toMatchObject({
    state: 'committed',
    result: { epoch: 1 },
  });
  for (const record of [previousRecordingId, recordingId])
    first.message({
      type: 'live:journal',
      recordingId: record,
      startedAt: 1,
      entries: [{ seq: 1, timeMs: 1, frame: 12, kind: 'state', data: { value: record } }],
    });
  const history = await game.call('reader', 'game_journal', {}, signal.signal);
  expect(history.data.recordings.map((r: { revision: string }) => r.revision)).toEqual([a, b]);
  first.hello(b);
});

it('refuses updates during an RPC and preserves a human revocation through commit', async () => {
  const { game, tab, signal } = fixture();
  const html = '<html>next</html>',
    revision = createHash('sha256').update(html).digest('hex');
  const previousRevision = 'a'.repeat(64);
  game.retainBuild(1, { html, revision });
  const first = tab();
  first.hello(previousRevision);
  const take = game.call('owner', 'game_take_control', {}, signal.signal);
  const request = JSON.parse(first.socket.send.mock.calls.at(-1)![0]);
  const id = randomUUID(),
    begin = { type: 'live:hot', phase: 'begin', id, sourceId: 1, previousRevision, revision, expectedEpoch: 0 };
  first.message(begin);
  expect(JSON.parse(first.socket.send.mock.calls.at(-1)![0]).error).toContain('Wait');
  first.message({ type: 'live:result', id: request.id, data: {} });
  await take;
  first.message(begin);
  first.message({ type: 'live:reclaim' });
  first.message({
    type: 'live:hot',
    phase: 'finish',
    id,
    result: 'applied',
    epoch: 1,
    runtimeInstanceId: randomUUID(),
    previousRecordingId: randomUUID(),
    recordingId: randomUUID(),
    frame: 5,
    simulationTick: 3,
  });
  expect(JSON.parse(first.socket.send.mock.calls.at(-1)![0]).transaction.state).toBe('committed');
  await expect(game.call('owner', 'game_take_control', {}, signal.signal)).rejects.toThrow('revoked');
});
afterEach(() => {
  games.splice(0).forEach((game) => game.close());
  vi.useRealTimers();
});
it('releases an idle lease during a prepared update without reacquiring it on commit', async () => {
  const { game, tab, signal } = fixture();
  const html = '<html>release</html>',
    revision = createHash('sha256').update(html).digest('hex');
  const previousRevision = 'a'.repeat(64);
  game.retainBuild(1, { html, revision });
  const first = tab();
  first.hello(previousRevision);
  const take = game.call('owner', 'game_take_control', {}, signal.signal);
  first.reply();
  await take;
  const id = randomUUID();
  first.message({ type: 'live:hot', phase: 'begin', id, sourceId: 1, previousRevision, revision, expectedEpoch: 0 });
  await expect(game.call('owner', 'game_release_control', {}, signal.signal)).resolves.toMatchObject({
    data: { released: true },
  });
  first.message({
    type: 'live:hot',
    phase: 'finish',
    id,
    result: 'applied',
    epoch: 1,
    runtimeInstanceId: randomUUID(),
    previousRecordingId: randomUUID(),
    recordingId: randomUUID(),
    frame: 5,
    simulationTick: 3,
  });
  const next = game.call('other', 'game_take_control', {}, signal.signal);
  first.reply();
  await next;
});
it('retains committed epochs and receipts when the same iframe reconnects', async () => {
  const { game, tab } = fixture();
  const a = 'a'.repeat(64),
    html = '<html>B</html>',
    b = createHash('sha256').update(html).digest('hex');
  game.retainBuild(1, { html, revision: b });
  const first = tab(),
    instanceId = randomUUID();
  first.message({ type: 'live:hello', tabId: first.id, instanceId, sourceId: 1, revision: a });
  const id = randomUUID();
  first.message({
    type: 'live:hot',
    phase: 'begin',
    id,
    sourceId: 1,
    previousRevision: a,
    revision: b,
    expectedEpoch: 0,
  });
  first.message({
    type: 'live:hot',
    phase: 'finish',
    id,
    result: 'applied',
    epoch: 1,
    runtimeInstanceId: randomUUID(),
    previousRecordingId: randomUUID(),
    recordingId: randomUUID(),
    frame: 4,
    simulationTick: 3,
  });
  first.socket.emit('close');
  const second = tab();
  second.message({ type: 'live:hello', tabId: first.id, instanceId, sourceId: 1, revision: b });
  second.message({ type: 'live:hot', phase: 'status', id });
  expect(JSON.parse(second.socket.send.mock.calls.at(-1)![0]).transaction).toMatchObject({
    state: 'committed',
    result: { epoch: 1 },
  });
  second.message({
    type: 'live:hot',
    phase: 'begin',
    id: randomUUID(),
    sourceId: 1,
    previousRevision: b,
    revision: b,
    expectedEpoch: 1,
  });
  expect(JSON.parse(second.socket.send.mock.calls.at(-1)![0]).transaction.state).toBe('prepared');
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
  game.release('task', { taskEnded: false });
  await expect(game.call('task', 'game_take_control', {}, signal.signal)).rejects.toThrow('revoked');
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

it('binds history to retained code across builds, source switches and disconnected tabs', async () => {
  const { game, tab, signal, changeSource } = fixture();
  const first = tab();
  const a = '<script>let score=1;</script>',
    b = '<script>let score=2;</script>';
  const revision = (html: string) => createHash('sha256').update(html).digest('hex');
  game.retainBuild(1, { revision: revision(a), html: a });
  first.hello(revision(a));
  const recordingId = randomUUID();
  first.message({
    type: 'live:journal',
    recordingId,
    startedAt: 1,
    entries: [{ seq: 1, timeMs: 1, frame: 1, kind: 'state', data: { score: 1 } }],
  });
  const take = game.call('owner', 'game_take_control', {}, signal.signal);
  const pendingMessages = first.socket.send.mock.calls.length;
  expect(await game.call('reader', 'game_journal_code', { recordingId }, signal.signal)).toMatchObject({
    data: { content: a },
  });
  expect(first.socket.send).toHaveBeenCalledTimes(pendingMessages);
  first.reply();
  await take;
  game.retainBuild(1, { revision: revision(b), html: b });
  first.hello(revision(b));
  first.socket.emit('close');
  changeSource();
  const result = await game.call('reader', 'game_journal_code', { recordingId }, signal.signal);
  expect(result.data).toMatchObject({ available: true, revision: revision(a), content: a });
  const history = await game.call('reader', 'game_journal_read', { recordingId }, signal.signal);
  expect(history.data).toMatchObject({ revision: revision(a), code: { available: true, revision: revision(a) } });
  const sent = first.socket.send.mock.calls.length;
  expect(await game.call('reader', 'game_journal_code', { recordingId, find: 'score=1' }, signal.signal)).toMatchObject(
    { data: { found: true } },
  );
  expect(first.socket.send).toHaveBeenCalledTimes(sent);
  await expect(
    game.call('reader', 'game_journal_code', { recordingId, path: '../../secret' }, signal.signal),
  ).rejects.toThrow();
  await expect(
    game.call('reader', 'game_journal_code', { recordingId, limit: 32_001 }, signal.signal),
  ).rejects.toThrow();
  await expect(game.call('reader', 'game_journal_code', { recordingId: randomUUID() }, signal.signal)).rejects.toThrow(
    'Unknown',
  );
});

it.each(['abort', 'disconnect', 'build', 'source', 'timeout', 'lease'])(
  'releases control and refuses late action replies on %s',
  async (reason) => {
    vi.useFakeTimers();
    const { game, tab, signal, changeSource } = fixture();
    const first = tab();
    const take = game.call('task', 'game_take_control', {}, signal.signal);
    first.reply();
    await take;
    const act = game.call('task', 'game_act', { actions: [{ kind: 'step', frames: 30 }] }, signal.signal);
    const failure = expect(act).rejects.toThrow(reason === 'lease' ? 'heartbeat/lease expired' : undefined);
    if (reason === 'lease') first.message({ type: 'live:expired' });
    if (reason === 'abort') signal.abort();
    if (reason === 'disconnect') first.socket.emit('close');
    if (reason === 'build') first.hello('new-build');
    if (reason === 'source') changeSource();
    if (reason === 'timeout') await vi.advanceTimersByTimeAsync(120_001);
    await failure;
    expect(first.socket.send.mock.calls.some(([data]) => JSON.parse(data).type === 'live:release')).toBe(true);
    expect(findLiveGame('http://127.0.0.1:12345/')).toBe(reason === 'source' ? undefined : game);
  },
);
