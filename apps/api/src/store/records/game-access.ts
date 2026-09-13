// Canonical game authority, separate from the submission that recorded the actor.

// Ownership model and migration: ops docs/game-ownership-and-collaboration-plan.md

export type GameAccessRole = 'owner' | 'editor';

export interface GameAccessRecord {
  slug: string;

  // Verbatim, including bot: and deleted-account uids; classification stays in the resolver.
  ownerUid: string;

  // Accepted editors. Empty until GO-03 builds collaboration.
  editorUids: string[];

  // Owner plus editors, for shelf queries. Written with them, never apart.
  memberUids: string[];

  // Bumped on every authority change; fences work admitted before a revocation.
  accessRevision: number;

  // The job whose settled slug claim wrote this. Absent while still tentative.
  settledJobId?: number;

  createdAt: string;

  updatedAt: string;
}

// Cap the single-document membership shape is conditional on.
export const MAX_GAME_MEMBERS = 25;

// The one definition of members.
export function membersOf(ownerUid: string, editorUids: readonly string[]): string[] {
  return [ownerUid, ...editorUids.filter((uid) => uid !== ownerUid)];
}

export function newGameAccess(slug: string, ownerUid: string, at: string, settledJobId?: number): GameAccessRecord {
  return {
    slug,
    ownerUid,
    editorUids: [],
    memberUids: membersOf(ownerUid, []),
    accessRevision: 1,
    ...(settledJobId === undefined ? {} : { settledJobId }),
    createdAt: at,
    updatedAt: at,
  };
}

// A later job settles over a tentative record; earlier never wins.
export function settlementWins(existing: GameAccessRecord, jobId: number): boolean {
  return existing.settledJobId === undefined || existing.settledJobId <= jobId;
}

// An owner change carries the revision on, never restarts it.
export function settledOver(
  existing: GameAccessRecord | null,
  slug: string,
  ownerUid: string,
  at: string,
  jobId: number,
): GameAccessRecord {
  const fresh = newGameAccess(slug, ownerUid, at, jobId);
  if (!existing) return fresh;
  return { ...fresh, createdAt: existing.createdAt, accessRevision: existing.accessRevision + 1 };
}

// Work begun before erasure belongs to the erased incarnation.
export function fencedOut(erasedAt: string | null, workAt: string): boolean {
  return erasedAt !== null && workAt <= erasedAt;
}

// Erasure: the platform takes custody, and the uid leaves every membership.

// Null when the record does not involve the uid at all.
export function withMemberErased(
  record: GameAccessRecord,
  uid: string,
  platformUid: string,
  at: string,
): GameAccessRecord | null {
  const wasOwner = record.ownerUid === uid;
  const wasEditor = record.editorUids.includes(uid);
  if (!wasOwner && !wasEditor) return null;

  const ownerUid = wasOwner ? platformUid : record.ownerUid;
  const editorUids = record.editorUids.filter((editor) => editor !== uid);
  return {
    ...record,
    ownerUid,
    editorUids,
    memberUids: membersOf(ownerUid, editorUids),
    accessRevision: record.accessRevision + 1,
    updatedAt: at,
  };
}
