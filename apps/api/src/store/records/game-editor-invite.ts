import { randomUUID } from 'node:crypto';

// GO-03 pending editor invitation: one per (slug, recipient).

export type GameEditorInviteStatus = 'pending' | 'accepted' | 'cancelled' | 'rejected' | 'expired';

export interface GameEditorInvitation {
  inviteId: string;
  slug: string;
  senderUid: string;
  recipientUid: string;
  status: GameEditorInviteStatus;
  createdAt: string;
  expiresAt: string;
  respondedAt?: string;
}

export const EDITOR_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Firestore ids cannot contain slash; colons in uids are fine.
export function editorInviteDocId(slug: string, recipientUid: string): string {
  return `${slug}__${recipientUid.replaceAll('/', '_')}`;
}

export function newEditorInvitation(
  slug: string,
  senderUid: string,
  recipientUid: string,
  at: string,
): GameEditorInvitation {
  return {
    inviteId: randomUUID(),
    slug,
    senderUid,
    recipientUid,
    status: 'pending',
    createdAt: at,
    expiresAt: new Date(Date.parse(at) + EDITOR_INVITE_TTL_MS).toISOString(),
  };
}

export function effectiveEditorInviteStatus(invite: GameEditorInvitation, at: string): GameEditorInviteStatus {
  if (invite.status === 'pending' && invite.expiresAt <= at) return 'expired';
  return invite.status;
}

export function isPendingEditorInvite(invite: GameEditorInvitation | null, at: string): invite is GameEditorInvitation {
  return invite !== null && effectiveEditorInviteStatus(invite, at) === 'pending';
}
