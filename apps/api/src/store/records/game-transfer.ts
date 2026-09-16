// GO-02 pending game-transfer invitation: one per slug at a time.

import { randomUUID } from 'node:crypto';

export type GameTransferStatus = 'pending' | 'accepted' | 'cancelled' | 'rejected' | 'expired';

export interface GameTransferInvitation {
  slug: string;

  // Identifies this invitation, not the slug it is about.

  // A slug outlives any one offer; a response names one.
  invitationId: string;
  senderUid: string;
  recipientUid: string;
  status: GameTransferStatus;
  createdAt: string;
  expiresAt: string;
  respondedAt?: string;
  // The access revision this invitation was created against; acceptance re-checks it.
  accessRevision: number;
}

export const TRANSFER_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newTransferInvitation(
  slug: string,
  senderUid: string,
  recipientUid: string,
  accessRevision: number,
  at: string,
): GameTransferInvitation {
  return {
    slug,
    invitationId: randomUUID(),
    senderUid,
    recipientUid,
    accessRevision,
    status: 'pending',
    createdAt: at,
    expiresAt: new Date(Date.parse(at) + TRANSFER_INVITE_TTL_MS).toISOString(),
  };
}

// No sweep writes expiry; a stale pending row just reads as over.
export function effectiveStatus(invite: GameTransferInvitation, at: string): GameTransferStatus {
  if (invite.status === 'pending' && invite.expiresAt <= at) return 'expired';
  return invite.status;
}

export function isPending(invite: GameTransferInvitation | null, at: string): invite is GameTransferInvitation {
  return invite !== null && effectiveStatus(invite, at) === 'pending';
}
