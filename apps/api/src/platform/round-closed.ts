import type { RoundClosed, RoundClosedReason } from '../store/records/rounds.js';

// Why a valid key went stale; forged keys carry none.
export interface RoundClosedInfo {
  reason: RoundClosedReason | 'expired' | 'superseded';
  at?: string;
  detail?: string;
}

const CLOSED_HINTS: Record<RoundClosedInfo['reason'], string> = {
  new_round: 'a newer round was opened for this game (continue_draft, start on a new round, or a creator revision)',
  creator_action: 'the creator closed or cancelled the round in Studio',
  builder_handoff: 'the round was handed to another builder',
  gate_green: 'a green gate verdict sealed the round',
  session_finished: 'the platform judged this session finished',
  session_failed: 'the platform judged this session failed',
  credentials_revoked: 'the creator rotated or revoked the credentials that opened this session',
  operator: 'an operator closed the round',
  abandoned: 'the round sat with no activity for days and was abandoned',
  expired: 'the session key expired',
  superseded: 'more than one round has opened since this key was minted',
};

// Lets agents tell stale-key causes apart.
export function roundClosedFields(error: { closed?: RoundClosedInfo }): Record<string, unknown> {
  if (!error.closed) return {};
  return {
    code: 'round_closed',
    reason: error.closed.reason,
    hint: CLOSED_HINTS[error.closed.reason],
    ...(error.closed.at ? { closedAt: error.closed.at } : {}),
    ...(error.closed.detail ? { detail: error.closed.detail } : {}),
  };
}

export function closedInfo(generation: number, record: { roundClosed?: RoundClosed }): RoundClosedInfo {
  const closed = record.roundClosed;
  if (!closed || closed.generation !== generation) return { reason: 'superseded' };
  return { reason: closed.reason, at: closed.at, ...(closed.detail ? { detail: closed.detail } : {}) };
}

export function expiredInfo(exp: number): RoundClosedInfo {
  return { reason: 'expired', at: new Date(exp * 1000).toISOString() };
}
