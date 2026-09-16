// One answer to who controls a game.

// Canonical records win; everything else keeps today's derived rule.

import type { GameAccessRecord } from '../store/records/game-access.js';
import type { GameAccessStore } from '../store/slices/game-access.js';
import type { SubmissionRecord } from '../store/records/submission.js';
import { BOT_UID_PREFIX, DELETED_ACCOUNT_UID } from './store.js';

// platform covers repo-lane, erased and bot-owned games: nobody to ask.
export type GameOwner =
  { kind: 'creator'; uid: string } | { kind: 'platform'; reason: 'no_owner' | 'bot_owned' | 'owner_deleted' };

export interface ResolvedGameAccess {
  owner: GameOwner;
  editorUids: string[];

  // 0 means derived authority, which has no revision to fence with.
  accessRevision: number;

  source: 'canonical' | 'derived';
}

export interface GameAccessResolveStore extends GameAccessStore {
  listSubmissionsBySlug(slug: string): Promise<SubmissionRecord[]>;
}

// The two reads resolving an owner needs, so a slice can answer.
export interface GameOwnerLookup {
  getGameAccess(slug: string): Promise<GameAccessRecord | null>;
  listSubmissionsBySlug(slug: string): Promise<SubmissionRecord[]>;
}

// The single classification rule, wherever the uid came from.
export function classifyOwnerUid(ownerUid: string): GameOwner {
  if (ownerUid === DELETED_ACCOUNT_UID) return { kind: 'platform', reason: 'owner_deleted' };
  if (ownerUid.startsWith(BOT_UID_PREFIX)) return { kind: 'platform', reason: 'bot_owned' };
  return { kind: 'creator', uid: ownerUid };
}

// The legacy rule, named so call sites stop re-implementing it inline.
export function deriveOwnerFromSubmissions(records: readonly SubmissionRecord[]): GameOwner {
  const newestLive = records.find((record) => !record.abandonedAt);
  if (!newestLive) return { kind: 'platform', reason: 'no_owner' };
  return classifyOwnerUid(newestLive.ownerUid);
}

function fromRecord(record: GameAccessRecord): ResolvedGameAccess {
  return {
    owner: classifyOwnerUid(record.ownerUid),
    editorUids: [...record.editorUids],
    accessRevision: record.accessRevision,
    source: 'canonical',
  };
}

export async function resolveGameAccess(store: GameOwnerLookup, slug: string): Promise<ResolvedGameAccess> {
  const record = await store.getGameAccess(slug);
  if (record) return fromRecord(record);
  return {
    owner: deriveOwnerFromSubmissions(await store.listSubmissionsBySlug(slug)),
    editorUids: [],
    accessRevision: 0,
    source: 'derived',
  };
}

// Who owns `slug` now; `fallback` covers games with no creator.
export async function currentOwnerUid(
  store: GameOwnerLookup,
  slug: string,
  fallback: string | undefined,
): Promise<string | undefined> {
  const owner = (await resolveGameAccess(store, slug)).owner;
  return owner.kind === 'creator' ? owner.uid : fallback;
}

// A round's keys answer to the game's current owner.

// Derived authority has no revision, so it is left alone.
export function roundAuthorityCurrent(record: { ownerUid: string }, access: ResolvedGameAccess): boolean {
  if (access.source !== 'canonical') return true;
  return sameOwner(classifyOwnerUid(record.ownerUid), access.owner);
}

// Editors are resolved but never admitted here: roles are GO-03.
export function ownsGame(access: ResolvedGameAccess, uid: string): boolean {
  return access.owner.kind === 'creator' && access.owner.uid === uid;
}

// Same authority, by kind and by uid where there is one.
export function sameOwner(a: GameOwner, b: GameOwner): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'creator' && b.kind === 'creator' ? a.uid === b.uid : true;
}

// The migration's dry-run gate.
export async function gameAccessMatchesDerived(store: GameAccessResolveStore, slug: string): Promise<boolean> {
  const record = await store.getGameAccess(slug);
  if (!record) return true;
  const derived = deriveOwnerFromSubmissions(await store.listSubmissionsBySlug(slug));
  return sameOwner(classifyOwnerUid(record.ownerUid), derived);
}
