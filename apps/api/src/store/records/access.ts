import type { BetaInviteStatus, WaitlistStatus } from '@gamedevpl/contract';

export interface WaitlistEntry {
  uid: string;
  email?: string;
  name?: string;
  requestedAt: string;
  locale?: string;
  status: WaitlistStatus;
  welcomeEmailedAt?: string;
}

export interface BetaInvite {
  id: string;
  codeHash: string;
  createdAt: string;
  createdByUid: string;
  status: BetaInviteStatus;
  claimedAt?: string;
  claimedUid?: string;
  revokedAt?: string;
  revokedByUid?: string;
}

export interface CreatedBetaInvite {
  invite: BetaInvite;
  code: string;
}

export type ClaimBetaInviteResult =
  { ok: true; invite: BetaInvite } | { ok: false; reason: 'not_found' | 'claimed' | 'revoked' };
