// Mirrors the games repo sim contract; the two must move together.

// Tick rates a zone may declare.
export const TICK_HZ_VALUES = [5, 10, 15, 20] as const;
export type TickHz = (typeof TICK_HZ_VALUES)[number];

// A zone is a room-sized problem.
export const MAX_PLAYERS_PER_ZONE = 16;

// A snapshot shares a Firestore document with its event log.
export const MAX_STATE_BYTES = 192 * 1024;

// The platform sends these; clients never do.
export const RESERVED_EVENT_KINDS = ['join', 'leave'] as const;

// One event in the ordered stream a tick is fed.
export interface ZoneEvent {
  slot: number;
  k: string;
  v?: number | string | boolean;
}
