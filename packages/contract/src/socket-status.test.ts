import { describe, expect, it } from 'vitest';
import { SOCKET_STATUSES } from './socket-status.js';

describe('SOCKET_STATUSES', () => {
  it('lists the socket lifecycle states', () => {
    expect(SOCKET_STATUSES).toEqual(['connecting', 'connected', 'reconnecting', 'closed']);
  });
});
