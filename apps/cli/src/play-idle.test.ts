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
    const abort = new AbortController();
    const response = await fetch(`${url.origin}/presence`, { headers, signal: abort.signal });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    cleanup.push(async () => {
      abort.abort();
      await reader.cancel().catch(() => {});
    });
    return async () => {
      abort.abort();
      await reader.cancel().catch(() => {});
      await new Promise((r) => setTimeout(r, 50));
    };
  };
  return { session, server, url, headers, open };
}

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
