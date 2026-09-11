import { describe, expect, it } from 'vitest';
import { createFrameLimiter } from './frame-limiter.js';
import { MAX_SOCKET_FRAMES_PER_SECOND } from './socket-limits.js';

describe('createFrameLimiter', () => {
  it('allows frames up to the cap and refuses the one past it', () => {
    const limiter = createFrameLimiter(3);
    expect(limiter.allow(0)).toBe(true);
    expect(limiter.allow(0)).toBe(true);
    expect(limiter.allow(0)).toBe(true);
    expect(limiter.allow(0)).toBe(false);
  });

  it('slides: frames older than a second stop counting', () => {
    const limiter = createFrameLimiter(2);
    expect(limiter.allow(0)).toBe(true);
    expect(limiter.allow(500)).toBe(true);
    expect(limiter.allow(999)).toBe(false);
    // The frame at 0 aged out; the one at 500 did not.
    expect(limiter.allow(1000)).toBe(true);
    expect(limiter.allow(1001)).toBe(false);
  });

  it('defaults to the shared socket cap', () => {
    const limiter = createFrameLimiter();
    for (let i = 0; i < MAX_SOCKET_FRAMES_PER_SECOND; i += 1) expect(limiter.allow(0)).toBe(true);
    expect(limiter.allow(0)).toBe(false);
  });

  it("keeps each connection's budget separate", () => {
    const a = createFrameLimiter(1);
    const b = createFrameLimiter(1);
    expect(a.allow(0)).toBe(true);
    expect(a.allow(0)).toBe(false);
    expect(b.allow(0)).toBe(true);
  });
});
