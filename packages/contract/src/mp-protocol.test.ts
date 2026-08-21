import { describe, expect, it } from 'vitest';
import { INPUT_KEYS, ROOM_PHASES } from './mp-protocol.js';

describe('INPUT_KEYS', () => {
  it('lists the v1 controller layout', () => {
    expect(INPUT_KEYS).toEqual(['up', 'down', 'left', 'right', 'a']);
  });
});

describe('ROOM_PHASES', () => {
  it('lists the room lifecycle phases', () => {
    expect(ROOM_PHASES).toEqual(['lobby', 'playing', 'ended']);
  });
});
