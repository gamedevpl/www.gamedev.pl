// Action checks from canonical GameAccess only. Do not widen ownsGame.

import { createHash } from 'node:crypto';
import { ownsGame, resolveGameAccess, type ResolvedGameAccess } from './game-access-resolve.js';
import type { GameOwnerLookup } from './game-access-resolve.js';
import type { Store, SubmissionRecord } from './store.js';

export type GameAccessAction =
  'read' | 'edit' | 'build' | 'publish' | 'reviewProposals' | 'manageMembers' | 'transfer' | 'delete' | 'leave';

const EDITOR_ACTIONS: ReadonlySet<GameAccessAction> = new Set(['read', 'edit', 'build', 'leave']);
const FROZEN_EDITOR_ACTIONS: ReadonlySet<GameAccessAction> = new Set(['read', 'leave']);

export function isGameMember(access: ResolvedGameAccess, uid: string): boolean {
  return ownsGame(access, uid) || access.editorUids.includes(uid);
}

export function viewerRoleOnGame(access: ResolvedGameAccess, uid: string): 'owner' | 'editor' | null {
  if (ownsGame(access, uid)) return 'owner';
  if (access.editorUids.includes(uid)) return 'editor';
  return null;
}

export function canonicalCreatorOwnerUid(access: ResolvedGameAccess): string | null {
  return access.owner.kind === 'creator' ? access.owner.uid : null;
}

// Opaque in API bodies so counterparties never see raw uids.
export function memberKey(slug: string, uid: string): string {
  return createHash('sha256').update(`member\0${slug}\0${uid}`).digest('hex').slice(0, 16);
}

export function canActOnGame(access: ResolvedGameAccess, uid: string, action: GameAccessAction): boolean {
  if (ownsGame(access, uid)) return action !== 'leave';
  if (!access.editorUids.includes(uid)) return false;
  if (access.owner.kind !== 'creator') return FROZEN_EDITOR_ACTIONS.has(action);
  return EDITOR_ACTIONS.has(action);
}

export async function canActOnSlug(
  store: GameOwnerLookup,
  slug: string,
  uid: string,
  action: GameAccessAction,
): Promise<boolean> {
  return canActOnGame(await resolveGameAccess(store, slug), uid, action);
}

// Unslugged jobs are the actor's draft, not a shared game.
export async function canActOnSubmissionOrSlug(
  store: GameOwnerLookup,
  record: { ownerUid: string | null; slug?: SubmissionRecord['slug'] },
  uid: string,
  action: GameAccessAction,
): Promise<boolean> {
  if (!record.slug) return record.ownerUid === uid && action !== 'leave';
  return canActOnSlug(store, record.slug, uid, action);
}

export async function listMemberRoundsForSlug(store: Store, uid: string, slug: string): Promise<SubmissionRecord[]> {
  if (!(await canActOnSlug(store, slug, uid, 'read'))) return [];
  return store.listSubmissionsBySlug(slug);
}
