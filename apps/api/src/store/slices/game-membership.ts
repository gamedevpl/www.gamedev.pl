import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { withEditorRemoved, type GameAccessRecord } from '../records/game-access.js';
import { editorInviteDocId, isPendingEditorInvite, type GameEditorInvitation } from '../records/game-editor-invite.js';
import { newMembershipAudit } from '../records/game-membership-audit.js';
import { isActiveBuildRound, revokedRoundGeneration } from '../../creation/job-state.js';
import type { JobState } from '@gamedevpl/contract';
import type { JobTransition } from '../../creation/job-state.js';

export const MAX_REVOKED_ROUNDS_PER_MEMBER = 200;

export type MembershipChangeResult = GameAccessRecord | 'not_editor' | 'stale_owner' | null;

export interface GameMembershipStore {
  removeEditor(slug: string, ownerUid: string, editorUid: string, at: string): Promise<MembershipChangeResult>;
  leaveGame(slug: string, editorUid: string, at: string): Promise<MembershipChangeResult>;
}

function newestOwnedRounds<T extends { data: () => unknown }>(docs: readonly T[], uid: string): T[] {
  return [...docs]
    .filter((doc) => (doc.data() as { ownerUid?: string }).ownerUid === uid)
    .sort((a, b) => {
      const left = a.data() as { createdAt?: string; jobId?: number };
      const right = b.data() as { createdAt?: string; jobId?: number };
      return (right.createdAt ?? '').localeCompare(left.createdAt ?? '') || (right.jobId ?? 0) - (left.jobId ?? 0);
    })
    .slice(0, MAX_REVOKED_ROUNDS_PER_MEMBER);
}

export class InMemoryGameMembershipStore implements GameMembershipStore {
  constructor(
    private getGameAccess: (slug: string) => GameAccessRecord | null,
    private writeGameAccess: (slug: string, record: GameAccessRecord) => void,
    private cancelInvite: (slug: string, recipientUid: string, at: string) => void,
    private revokeActorRounds: (slug: string, uid: string, cancelActive: boolean) => void,
    private writeAudit: (
      slug: string,
      action: 'editor_removed' | 'editor_left',
      actorUid: string,
      subjectUid: string,
      at: string,
    ) => void,
  ) {}

  async removeEditor(slug: string, ownerUid: string, editorUid: string, at: string): Promise<MembershipChangeResult> {
    const access = this.getGameAccess(slug);
    if (!access || access.ownerUid !== ownerUid) return 'stale_owner';
    const next = withEditorRemoved(access, editorUid, at);
    if (!next) return 'not_editor';
    this.writeGameAccess(slug, next);
    this.cancelInvite(slug, editorUid, at);
    this.revokeActorRounds(slug, editorUid, false);
    this.writeAudit(slug, 'editor_removed', ownerUid, editorUid, at);
    return next;
  }

  async leaveGame(slug: string, editorUid: string, at: string): Promise<MembershipChangeResult> {
    const access = this.getGameAccess(slug);
    if (!access) return null;
    const next = withEditorRemoved(access, editorUid, at);
    if (!next) return 'not_editor';
    this.writeGameAccess(slug, next);
    this.cancelInvite(slug, editorUid, at);
    this.revokeActorRounds(slug, editorUid, true);
    this.writeAudit(slug, 'editor_left', editorUid, editorUid, at);
    return next;
  }
}

export class FirestoreGameMembershipStore implements GameMembershipStore {
  constructor(private db: Firestore) {}

  private async changeMembership(
    slug: string,
    editorUid: string,
    at: string,
    action: 'editor_removed' | 'editor_left',
    expectedOwnerUid?: string,
  ): Promise<MembershipChangeResult> {
    const accessRef = this.db.collection('gameAccess').doc(slug);
    const inviteRef = this.db.collection('gameEditorInvites').doc(editorInviteDocId(slug, editorUid));
    const gameRef = this.db.collection('games').doc(slug);
    const agentKeyRef = this.db.collection('gameAgentKeys').doc(slug);
    const activeQuery = this.db.collection('submissions').where('slug', '==', slug);
    return this.db.runTransaction(async (tx) => {
      const [accessSnap, inviteSnap, activeSnap, gameSnap, agentKeySnap] = await Promise.all([
        tx.get(accessRef),
        tx.get(inviteRef),
        tx.get(activeQuery),
        tx.get(gameRef),
        tx.get(agentKeyRef),
      ]);
      const access = accessSnap.exists ? (accessSnap.data() as GameAccessRecord) : null;
      if (!access) return null;
      if (expectedOwnerUid && access.ownerUid !== expectedOwnerUid) return 'stale_owner';
      const next = withEditorRemoved(access, editorUid, at);
      if (!next) return 'not_editor';
      tx.set(accessRef, next);
      const invite = inviteSnap.exists ? (inviteSnap.data() as GameEditorInvitation) : null;
      if (isPendingEditorInvite(invite, at)) {
        tx.set(inviteRef, { ...invite, status: 'cancelled', respondedAt: at });
      }
      const actor = expectedOwnerUid ?? editorUid;
      tx.set(this.db.collection('gameMembershipAudit').doc(), newMembershipAudit(slug, action, actor, editorUid, at));
      let releasedLease = false;
      // Owner-remove keeps the live round; leave cancels it.
      const cancelActive = action === 'editor_left';
      for (const doc of newestOwnedRounds(activeSnap.docs, editorUid)) {
        const current = doc.data() as { roundGeneration?: number; state?: JobState; transitions?: JobTransition[] };
        const patch: Record<string, unknown> = { roundGeneration: revokedRoundGeneration(current.roundGeneration) };
        if (cancelActive && isActiveBuildRound(current)) {
          patch.state = 'canceled';
          releasedLease = true;
        }
        tx.update(doc.ref, patch);
      }
      if (releasedLease && gameSnap.exists) tx.update(gameRef, { recoveryAdmission: FieldValue.delete() });
      if (releasedLease && agentKeySnap.exists) {
        tx.update(agentKeyRef, { agentOpenRoundPending: FieldValue.delete() });
      }
      return next;
    });
  }

  async removeEditor(slug: string, ownerUid: string, editorUid: string, at: string): Promise<MembershipChangeResult> {
    return this.changeMembership(slug, editorUid, at, 'editor_removed', ownerUid);
  }

  async leaveGame(slug: string, editorUid: string, at: string): Promise<MembershipChangeResult> {
    return this.changeMembership(slug, editorUid, at, 'editor_left');
  }
}
