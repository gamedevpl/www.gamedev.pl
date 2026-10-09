import WebSocket from 'ws';
import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createSessionController } from './session-controller.js';
import { startSessionBrowser } from './session-browser-server.js';
import { PLAY_IDLE_MS } from './play-presence.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
  vi.useRealTimers();
});
async function fixture(detached = true, canStop?: () => boolean) {
  const session = createSessionController('');
  const server = await startSessionBrowser(session, { detached, canStop });
  const url = new URL(server.url);
  const headers = { Authorization: `Bearer ${url.hash.slice(1)}` };
  cleanup.push(async () => {
    session.close();
    await server.close();
  });
  const open = async () => {
    const socket = new WebSocket(`${url.origin}/presence`.replace('http:', 'ws:'), { headers });
    await once(socket, 'open');
    const close = async () => {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, 'close');
      socket.close();
      await closed;
    };
    cleanup.push(close);
    return close;
  };
  return { session, server, url, headers, open };
}

it('authenticates upgrades and rejects cross-origin or opaque-origin sockets', async () => {
  const f = await fixture();
  const address = `${f.url.origin}/presence`.replace('http:', 'ws:');
  for (const headers of [{}, { ...f.headers, Origin: 'https://evil.test' }, { ...f.headers, Origin: 'null' }]) {
    const socket = new WebSocket(address, { headers });
    await expect(once(socket, 'open')).rejects.toThrow('403');
  }
  const socket = new WebSocket(address, ['gamedevpl-presence', `token.${f.url.hash.slice(1)}`], {
    origin: f.url.origin,
  });
  await once(socket, 'open');
  expect(socket.protocol).toBe('gamedevpl-presence');
  const closed = once(socket, 'close');
  socket.close();
  await closed;
});

it('excludes CLI health probes and unauthenticated clients from keeping a detached session alive', async () => {
  const f = await fixture();
  const prompt = f.session.prompt();
  expect((await fetch(`${f.url.origin}/presence`)).status).toBe(401);
  const disconnect = await f.open();
  await disconnect();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + PLAY_IDLE_MS + 1000);
  expect((await fetch(`${f.url.origin}/state`, { headers: f.headers })).status).toBe(200);
  await expect(prompt).resolves.toBe('/quit');
  expect(f.session.get().lines).toContain('No Play tabs connected for 60 seconds. Ending session.');
});

it('keeps another tab and active work alive, then gracefully ends after both are gone', async () => {
  let working = true;
  const f = await fixture(true, () => !working);
  const prompt = f.session.prompt();
  const first = await f.open(),
    last = await f.open();
  await first();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 3 * PLAY_IDLE_MS);
  await new Promise((r) => setTimeout(r, 1100));
  expect(f.session.acceptInput('', -1)).toBe(false);
  expect(f.session.get().lines).not.toContain('No Play tabs connected for 60 seconds. Ending session.');
  await last();
  vi.setSystemTime(Date.now() + 2 * PLAY_IDLE_MS);
  await new Promise((r) => setTimeout(r, 1100));
  expect(f.session.get().lines).not.toContain('No Play tabs connected for 60 seconds. Ending session.');
  working = false;
  await expect(prompt).resolves.toBe('/quit');
});

it('does not close a terminal-owned session when its browser panel disconnects', async () => {
  const f = await fixture(false);
  const prompt = f.session.prompt();
  const disconnect = await f.open();
  await disconnect();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 2 * PLAY_IDLE_MS);
  await new Promise((r) => setTimeout(r, 1100));
  expect(f.session.get().lines).not.toContain('No Play tabs connected for 60 seconds. Ending session.');
  f.session.close();
  await prompt;
});
