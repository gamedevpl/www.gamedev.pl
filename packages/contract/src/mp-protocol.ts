// Multiplayer relay wire vocabulary, shared by the room server and controller UI.
export const INPUT_KEYS = ['up', 'down', 'left', 'right', 'a'] as const;

export type InputKey = (typeof INPUT_KEYS)[number];

export const ROOM_PHASES = ['lobby', 'playing', 'ended'] as const;

export type RoomPhase = (typeof ROOM_PHASES)[number];
