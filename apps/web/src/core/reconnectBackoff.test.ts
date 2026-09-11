import { describe, expect, it } from 'vitest';
import { createReconnectBackoff, DEFAULT_MAX_RECONNECT_ATTEMPTS } from './reconnectBackoff.js';

describe('createReconnectBackoff', () => {
  it('doubles from 500ms and caps at 8s', () => {
    const backoff = createReconnectBackoff();
    expect([
      backoff.nextDelayMs(),
      backoff.nextDelayMs(),
      backoff.nextDelayMs(),
      backoff.nextDelayMs(),
      backoff.nextDelayMs(),
      backoff.nextDelayMs(),
    ]).toEqual([500, 1000, 2000, 4000, 8000, 8000]);
  });

  it('returns null once the attempt budget is spent', () => {
    const backoff = createReconnectBackoff();
    for (let i = 0; i < DEFAULT_MAX_RECONNECT_ATTEMPTS; i += 1) expect(backoff.nextDelayMs()).not.toBeNull();
    expect(backoff.nextDelayMs()).toBeNull();
  });

  it('reports the first attempt until something fails, and again after reset', () => {
    const backoff = createReconnectBackoff();
    expect(backoff.isFirstAttempt()).toBe(true);
    backoff.nextDelayMs();
    expect(backoff.isFirstAttempt()).toBe(false);
    backoff.reset();
    expect(backoff.isFirstAttempt()).toBe(true);
    expect(backoff.nextDelayMs()).toBe(500);
  });

  it('honours a smaller budget', () => {
    const backoff = createReconnectBackoff(2);
    expect(backoff.nextDelayMs()).toBe(500);
    expect(backoff.nextDelayMs()).toBe(1000);
    expect(backoff.nextDelayMs()).toBeNull();
  });
});
