// Multiplayer relay wire vocabulary, shared by the room server and controller UI.

// Party-mode wire version, checked by both ends of the socket.
export const MP_PROTOCOL_VERSION = 1;
export const INPUT_KEYS = ['up', 'down', 'left', 'right', 'a'] as const;

export type InputKey = (typeof INPUT_KEYS)[number];

export const ROOM_PHASES = ['lobby', 'playing', 'ended'] as const;

export type RoomPhase = (typeof ROOM_PHASES)[number];
