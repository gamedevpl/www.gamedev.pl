import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_SOCKETS_PER_IP, MAX_SOCKET_FRAME_BYTES, MAX_SOCKET_FRAMES_PER_SECOND } from './socket-limits.js';
import { TICK_HZ_VALUES } from './zone-contract.js';

describe('socket limits', () => {
  it('pins the caps both socket servers enforce', () => {
    expect(MAX_SOCKET_FRAME_BYTES).toBe(2 * 1024);
    expect(MAX_SOCKET_FRAMES_PER_SECOND).toBe(40);
    expect(DEFAULT_MAX_SOCKETS_PER_IP).toBe(24);
  });

  it('leaves headroom above the fastest tick rate a zone may declare', () => {
    expect(MAX_SOCKET_FRAMES_PER_SECOND).toBeGreaterThan(Math.max(...TICK_HZ_VALUES));
  });
});
