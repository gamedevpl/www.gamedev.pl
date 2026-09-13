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

  createdAt: string;

  updatedAt: string;
}

// Cap the single-document membership shape is conditional on.
export const MAX_GAME_MEMBERS = 25;

// The one definition of members.
export function membersOf(ownerUid: string, editorUids: readonly string[]): string[] {
  return [ownerUid, ...editorUids.filter((uid) => uid !== ownerUid)];
}

export function newGameAccess(slug: string, ownerUid: string, at: string): GameAccessRecord {
  return {
    slug,
    ownerUid,
    editorUids: [],
    memberUids: membersOf(ownerUid, []),
    accessRevision: 1,
    createdAt: at,
    updatedAt: at,
  };
}
