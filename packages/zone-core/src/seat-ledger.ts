import type { ZoneEvent } from './contract.js';

// Who owned each slot's actor, as written into a zone snapshot.
export type StoredSeat = { slot: number; tag: string };

// Reconnect window for an owner whose actor survived a restart.
export const RECLAIM_GRACE_MS = 60_000;

// Malformed owners read as none, so every restored actor is retired.
export function readStoredSeats(value: unknown): StoredSeat[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ok = value.every((entry) => Number.isInteger(entry?.slot) && entry.slot >= 0 && typeof entry?.tag === 'string');
  return ok ? value.map(({ slot, tag }) => ({ slot, tag })) : undefined;
}

// Restored actors held for owners who have not reconnected yet.
export class SeatLedger {
  private readonly held = new Map<number, { tag: string; since: number }>();

  clear(): void {
    this.held.clear();
  }

  // Seats plus held owners, for the snapshot.
  record(seats: Map<number, string>): StoredSeat[] {
    const all = [...seats].map(([slot, tag]) => ({ slot, tag }));
    for (const [slot, { tag }] of this.held) all.push({ slot, tag });
    return all.sort((a, b) => a.slot - b.slot);
  }

  // Squares restored actors with who is seated; returns events to queue first.
  adopt(stored: StoredSeat[] | undefined, seats: Map<number, string>, maxPlayers: number, now: number): ZoneEvent[] {
    const events: ZoneEvent[] = [];
    this.held.clear();
    if (stored) {
      for (const { slot, tag } of stored) this.held.set(slot, { tag, since: now });
    } else {
      // Old snapshots name no owners, so no actor can be trusted.
      for (let slot = 0; slot < maxPlayers; slot++) events.push({ slot, k: 'leave' });
    }
    for (const [slot, tag] of seats) {
      const owner = this.held.get(slot);
      this.held.delete(slot);
      if (owner?.tag === tag) continue;
      if (owner) events.push({ slot, k: 'leave' });
      events.push({ slot, k: 'join' });
    }
    return events;
  }

  // The owner's own held slot, else the lowest unowned one.
  claim(tag: string, seats: Map<number, string>, maxPlayers: number): { slot: number; events: ZoneEvent[] } {
    for (const [slot, owner] of this.held) {
      if (owner.tag !== tag) continue;
      this.held.delete(slot);
      return { slot, events: [] };
    }
    let slot = 0;
    while (seats.has(slot) || this.held.has(slot)) slot += 1;
    if (slot < maxPlayers || this.held.size === 0) return { slot, events: [] };

    // Every free slot is held: retire the oldest before reseating it.
    let oldest = -1;
    let oldestSince = Infinity;
    for (const [held, { since }] of this.held) {
      if (since < oldestSince) [oldest, oldestSince] = [held, since];
    }
    this.held.delete(oldest);
    return { slot: oldest, events: [{ slot: oldest, k: 'leave' }] };
  }

  // Leave events for owners who did not come back in time.
  expire(now: number): ZoneEvent[] {
    const events: ZoneEvent[] = [];
    for (const [slot, { since }] of this.held) {
      if (now - since < RECLAIM_GRACE_MS) continue;
      this.held.delete(slot);
      events.push({ slot, k: 'leave' });
    }
    return events;
  }
}
