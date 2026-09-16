import { describe, expect, it } from 'vitest';
import { summarizeTransfers } from './visit-transfers.js';
import type { VisitEvent } from '../platform/store.js';

function step(visitId: string, value: string): VisitEvent {
  return { visitId, type: 'transfer_step', step: value, at: '2026-09-15T00:00:00.000Z' } as VisitEvent;
}

describe('summarizeTransfers', () => {
  it('counts each side against its own denominator', () => {
    const read = summarizeTransfers([
      step('v1', 'invite_sent'),
      step('v2', 'invite_sent'),
      step('v2', 'invite_cancelled'),
      step('v3', 'offer_shown'),
      step('v3', 'offer_accepted'),
      step('v4', 'offer_shown'),
      step('v4', 'offer_declined'),
      step('v5', 'offer_shown'),
    ]);

    expect(read).toEqual({ sent: 2, cancelled: 1, offered: 3, answered: 2, accepted: 1, declined: 1 });
  });

  it('ignores a decision whose exposure never arrived, so no ratio exceeds one', () => {
    // Batches are best-effort; the shown rung can be lost.
    const read = summarizeTransfers([step('v1', 'offer_shown'), step('v2', 'offer_accepted')]);

    expect(read.offered).toBe(1);
    expect(read.accepted).toBe(0);
    expect(read.answered).toBe(0);
  });

  it('ignores a cancellation from a visit that never sent one', () => {
    const read = summarizeTransfers([step('v1', 'invite_sent'), step('v2', 'invite_cancelled')]);

    expect(read.sent).toBe(1);
    expect(read.cancelled).toBe(0);
  });

  it('keeps the two sides apart when one visit does both', () => {
    // One sitting can both give a game and be offered one.
    const read = summarizeTransfers([
      step('v1', 'invite_sent'),
      step('v1', 'offer_shown'),
      step('v1', 'offer_declined'),
    ]);

    expect(read).toEqual({ sent: 1, cancelled: 0, offered: 1, answered: 1, accepted: 0, declined: 1 });
  });

  it('reads all zeroes rather than throwing when nothing happened', () => {
    expect(summarizeTransfers([])).toEqual({
      sent: 0,
      cancelled: 0,
      offered: 0,
      answered: 0,
      accepted: 0,
      declined: 0,
    });
  });

  it('ignores a step name it does not know', () => {
    expect(summarizeTransfers([step('v1', 'invite_forwarded')]).sent).toBe(0);
  });
});
