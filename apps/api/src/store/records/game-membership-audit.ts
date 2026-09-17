// Operational membership trail, never mixed with visit telemetry.

export type GameMembershipAuditAction =
  | 'invite_created'
  | 'invite_cancelled'
  | 'invite_rejected'
  | 'invite_expired'
  | 'editor_accepted'
  | 'editor_removed'
  | 'editor_left';

export interface GameMembershipAuditRecord {
  id: string;
  slug: string;
  action: GameMembershipAuditAction;
  actorUid: string;
  subjectUid: string;
  at: string;
}

export function newMembershipAudit(
  slug: string,
  action: GameMembershipAuditAction,
  actorUid: string,
  subjectUid: string,
  at: string,
): GameMembershipAuditRecord {
  return {
    id: `${slug}:${action}:${subjectUid}:${at}`,
    slug,
    action,
    actorUid,
    subjectUid,
    at,
  };
}
