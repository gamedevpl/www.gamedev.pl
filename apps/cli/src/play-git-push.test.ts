import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { forwardPlayPush, playPushBridge, playTurnWriter } from './play-git-push.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture(push = vi.fn(async () => ({ ok: true }))) {
  const env: NodeJS.ProcessEnv = {};
  const bridge = playPushBridge(env, process.cwd(), 'snake', push);
  const server = createServer((req, res) => {
    if (!bridge.handle(req, res)) res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => {
    await bridge.finish();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  bridge.start(url);
  return { env, bridge, push, url };
}

it('authenticates pushes and expires each turn without falling back to a local write', async () => {
  const f = await fixture();
  const expired = { ...f.env };
  expect(
    await forwardPlayPush({ ...f.env, GAMEDEVPL_PLAY_PUSH_TOKEN: 'wrong' }, 'origin', 'HEAD', 'snake'),
  ).toMatchObject({
    ok: false,
  });
  expect(f.push).not.toHaveBeenCalled();
  expect(await forwardPlayPush(f.env, 'origin', 'HEAD', 'snake')).toEqual({ ok: true });
  expect(f.push).toHaveBeenCalledWith('origin', 'HEAD');
  await f.bridge.finish();
  f.bridge.start(f.url);
  expect(await forwardPlayPush(expired, 'origin', 'HEAD', 'snake')).toMatchObject({ ok: false });
  expect(f.push).toHaveBeenCalledTimes(1);
  expect(await forwardPlayPush({}, 'origin', 'HEAD', 'snake')).toBeUndefined();
});

it('refuses browser requests, malformed input, and overlapping pushes', async () => {
  let release!: () => void;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const f = await fixture(
    vi.fn(async () => {
      began();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { ok: true };
    }),
  );
  const request = (body: string, origin?: string) =>
    fetch(f.env.GAMEDEVPL_PLAY_PUSH_URL!, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${f.env.GAMEDEVPL_PLAY_PUSH_TOKEN}`,
        ...(origin ? { origin } : {}),
      },
      body,
    });
  expect((await request('{}', 'https://hostile.test')).status).toBe(403);
  expect((await request('x'.repeat(4097))).status).toBe(400);
  expect((await request('{')).status).toBe(400);
  expect((await request(JSON.stringify({ remote: '--config', srcRef: 'HEAD' }))).status).toBe(400);
  expect(
    (await request(JSON.stringify({ remote: 'origin', srcRef: 'HEAD', game: 'other', cwd: process.cwd() }))).status,
  ).toBe(400);
  expect(
    (await request(JSON.stringify({ remote: 'origin', srcRef: 'HEAD', game: 'snake', cwd: '/other-checkout' }))).status,
  ).toBe(400);
  const first = forwardPlayPush(f.env, 'origin', 'HEAD', 'snake');
  await started;
  try {
    expect(await forwardPlayPush(f.env, 'origin', 'HEAD', 'snake')).toMatchObject({ ok: false });
    let ended = false;
    const ending = f.bridge.finish().then(() => {
      ended = true;
    });
    await Promise.resolve();
    expect(ended).toBe(false);
    release();
    await ending;
    expect(await first).toEqual({ ok: true });
  } finally {
    release();
  }
});

it('serializes work in the captured writer context and continues after a failure', async () => {
  const writer = playTurnWriter();
  const order: number[] = [];
  const first = writer.run(async () => {
    order.push(1);
    throw Error('failed');
  });
  const second = writer.run(async () => {
    order.push(2);
    return 42;
  });
  await expect(first).rejects.toThrow('failed');
  await expect(second).resolves.toBe(42);
  await writer.finish();
  expect(order).toEqual([1, 2]);
});
