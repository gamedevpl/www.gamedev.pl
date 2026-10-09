import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { afterEach, expect, it, vi } from 'vitest';
import { playPresence, PLAY_IDLE_MS } from './play-presence.js';

afterEach(() => vi.useRealTimers());
function client() {
  const events = new EventEmitter();
  return Object.assign(events, {
    ping: vi.fn(() => events.emit('pong')),
    terminate: vi.fn(() => events.emit('close')),
  }) as unknown as WebSocket;
}

it('counts open tabs rather than clicks, and stops only after the last disconnect', () => {
  vi.useFakeTimers();
  const idle = vi.fn();
  const presence = playPresence(idle);
  const one = client(),
    two = client();
  presence.connect(one);
  presence.connect(two);
  one.emit('close');
  vi.advanceTimersByTime(10 * PLAY_IDLE_MS);
  expect(idle).not.toHaveBeenCalled();
  expect(two.ping).toHaveBeenCalled();
  two.emit('close');
  vi.advanceTimersByTime(PLAY_IDLE_MS - 1000);
  expect(idle).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(idle).toHaveBeenCalledOnce();
  presence.close();
});

it('cancels the deadline on reconnect and gives the next disconnect a full grace period', () => {
  vi.useFakeTimers();
  const idle = vi.fn(),
    presence = playPresence(idle);
  const first = client();
  presence.connect(first);
  first.emit('close');
  vi.advanceTimersByTime(PLAY_IDLE_MS - 1000);
  const reloaded = client();
  presence.connect(reloaded);
  vi.advanceTimersByTime(PLAY_IDLE_MS * 2);
  expect(idle).not.toHaveBeenCalled();
  reloaded.emit('close');
  vi.advanceTimersByTime(PLAY_IDLE_MS);
  expect(idle).toHaveBeenCalledOnce();
  presence.close();
});

it('waits for active work, then stops once and clears resources on close', () => {
  vi.useFakeTimers();
  let busy = true;
  const idle = vi.fn(),
    presence = playPresence(idle, () => !busy);
  const tab = client();
  presence.connect(tab);
  tab.emit('close');
  vi.advanceTimersByTime(PLAY_IDLE_MS * 3);
  expect(idle).not.toHaveBeenCalled();
  busy = false;
  vi.advanceTimersByTime(1000);
  expect(idle).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(PLAY_IDLE_MS);
  expect(idle).toHaveBeenCalledOnce();
  presence.close();
  expect(vi.getTimerCount()).toBe(0);
  const late = client();
  presence.connect(late);
  expect(late.terminate).toHaveBeenCalledOnce();
});

it('keeps an unopened --no-open session available until a tab has connected', () => {
  vi.useFakeTimers();
  const idle = vi.fn(),
    presence = playPresence(idle);
  vi.advanceTimersByTime(60 * PLAY_IDLE_MS);
  expect(idle).not.toHaveBeenCalled();
  presence.close();
});

it('reaps a crashed tab that stops answering native pings', () => {
  vi.useFakeTimers();
  const idle = vi.fn(),
    presence = playPresence(idle);
  const tab = client();
  tab.ping = vi.fn();
  presence.connect(tab);
  vi.advanceTimersByTime(30_000);
  expect(tab.terminate).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(PLAY_IDLE_MS);
  expect(idle).toHaveBeenCalledOnce();
  presence.close();
});
