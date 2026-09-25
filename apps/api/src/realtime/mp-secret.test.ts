import { afterEach, expect, it, vi } from 'vitest';
import { RoomRegistry, verifyRoomToken } from './mp.js';

afterEach(() => vi.unstubAllEnvs());

it('signs room tokens with the dedicated key when it is configured', () => {
  vi.stubEnv('SESSION_SECRET', 'session-key');
  vi.stubEnv('MP_ROOM_SECRET', 'room-key');
  const registry = new RoomRegistry();
  const room = registry.createRoom('arena-tag', 'g:1', 4);
  expect(verifyRoomToken(room.joinToken, 'room-key')).toMatchObject({ code: room.code });
  expect(() => verifyRoomToken(room.joinToken, 'session-key')).toThrow();
});
