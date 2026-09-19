import type { VisitEvent } from '../platform/store.js';

// Two sides, two denominators: invitations sent, and invitations seen.

export interface TransferRead {
  // Visits that sent at least one invitation.
  sent: number;
  // Of those, visits that took one back.
  cancelled: number;
  // Visits shown at least one incoming invitation.
  offered: number;
  // Of those, visits that answered it either way.
  answered: number;
  accepted: number;
  declined: number;
}

type Seen = {
  sent: Set<string>;
  cancelled: Set<string>;
  offered: Set<string>;
  accepted: Set<string>;
  declined: Set<string>;
};

function seen(): Seen {
  return { sent: new Set(), cancelled: new Set(), offered: new Set(), accepted: new Set(), declined: new Set() };
}

const BUCKETS: Record<string, keyof Seen> = {
  invite_sent: 'sent',
  invite_cancelled: 'cancelled',
  offer_shown: 'offered',
  offer_accepted: 'accepted',
  offer_declined: 'declined',
};

export function summarizeTransfers(events: readonly VisitEvent[]): TransferRead {
  const all = seen();
  for (const event of events) {
    if (event.type !== 'transfer_step') continue;
    const bucket = event.step ? BUCKETS[event.step] : undefined;
    if (bucket) all[bucket].add(event.visitId);
  }

  // Each side counted inside its own denominator, so no ratio exceeds one.
  const within = (ids: Set<string>, of: Set<string>) => [...ids].filter((id) => of.has(id)).length;
  return {
    sent: all.sent.size,
    cancelled: within(all.cancelled, all.sent),
    offered: all.offered.size,
    answered: within(new Set([...all.accepted, ...all.declined]), all.offered),
    accepted: within(all.accepted, all.offered),
    declined: within(all.declined, all.offered),
  };
}
