import { FieldValue } from '@google-cloud/firestore';
import type { GuardedFirestore } from '../shelf-guard-firestore.js';
import { fromStoredSubmission, type SubmissionRecord } from '../records/submission.js';
import type { PublicationRecord } from '../../delivery/games-store.js';
import { classifyOwnerUid, deriveOwnerFromSubmissions } from '../../platform/game-access-resolve.js';

export const GAME_TRASH_DAYS = 14;
export type TrashEntry = { slug: string; requestedAt: string; purgeAfter: string; ownerUid: string };
export type GameAction = 'unpublish' | 'trash';
export interface GameTrashStore {
  reservesSlug(slug: string): Promise<boolean>;
  change(slug: string, uid: string, action: GameAction, at: string): Promise<void>;
  list(until?: string): Promise<TrashEntry[]>;
  purge(slug: string, until: string | undefined, eraseObjects: () => Promise<void>): Promise<void>;
}

export function refuse(error: string, statusCode = 409): never {
  throw Object.assign(new Error(error), { statusCode });
}
function entry(slug: string, ownerUid: string, requestedAt: string): TrashEntry {
  const purgeAfter = new Date(Date.parse(requestedAt) + GAME_TRASH_DAYS * 86400000).toISOString();
  return { slug, ownerUid, requestedAt, purgeAfter };
}

function authorize(uid: string, canonical: string | undefined, rows: SubmissionRecord[], trash?: TrashEntry) {
  const owner = canonical
    ? classifyOwnerUid(canonical)
    : deriveOwnerFromSubmissions([...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.jobId - a.jobId));
  if (owner.kind === 'creator' && owner.uid === uid) return;
  if (!canonical && trash?.ownerUid === uid) return;
  refuse('only the owner can manage this game', 403);
}

function check(action: GameAction, publication?: PublicationRecord, shared = false) {
  if (action === 'unpublish' && publication?.state !== 'published') refuse('not_published');
  if (action === 'trash' && (publication?.state === 'published' || shared)) refuse('unpublish_first');
}

function retired(record: SubmissionRecord, at: string) {
  return {
    abandonedAt: record.abandonedAt ?? at,
    openRound: false,
    state: 'canceled' as const,
    roundGeneration: (record.roundGeneration ?? 1) + 1,
  };
}

export class FirestoreGameTrash implements GameTrashStore {
  constructor(private db: GuardedFirestore) {}

  async reservesSlug(slug: string) {
    const data = (await this.db.collection('games').doc(slug).get()).data();
    return Boolean(data?.publication || data?.trash || data?.purged);
  }

  async change(slug: string, uid: string, action: GameAction, at: string) {
    const game = this.db.collection('games').doc(slug);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(game);
      const data = snap.data();
      const access = await tx.get(this.db.collection('gameAccess').doc(slug));
      const rows = await tx.get(this.db.collection('submissions').where('slug', '==', slug));
      const records = rows.docs.map((doc) => fromStoredSubmission(doc.data()));
      authorize(uid, access.data()?.ownerUid, records, data?.trash);
      if (data?.purged) refuse('already_purged');
      if (data?.trash && action === 'trash') return;
      check(
        action,
        data?.publication,
        records.some((row) => !row.abandonedAt && !!row.draftSharedAt),
      );
      if (action === 'trash') {
        const invitation = this.db.collection('gameTransfers').doc(slug);
        if ((await tx.get(invitation)).data()?.status === 'pending')
          tx.update(invitation, { status: 'cancelled', respondedAt: at });
        tx.set(game, { trash: entry(slug, uid, at) }, { merge: true });
      } else {
        tx.update(game, {
          'publication.state': 'archived',
          'publication.takedownAt': at,
          'publication.takedownReason': 'unpublished by owner',
        });
      }
      rows.docs.forEach((doc, index) => {
        if (action === 'trash' || records[index]!.draftSharedAt) {
          tx.update(doc.ref, {
            ...(action === 'trash' ? retired(records[index]!, at) : {}),
            draftSharedAt: FieldValue.delete(),
          });
        }
      });
    });
  }

  async list(until = '9999') {
    const snap = await this.db.collection('games').where('trash.purgeAfter', '<=', until).get();
    return snap.docs.map((doc) => doc.data().trash as TrashEntry);
  }

  async purge(slug: string, until: string | undefined, eraseObjects: () => Promise<void>) {
    const game = this.db.collection('games').doc(slug);
    const data = (await game.get()).data();
    if (data?.purged) return;
    if (!data?.trash || data.publication?.state === 'published' || (until && data.trash.purgeAfter > until))
      refuse('not_ready');
    await eraseObjects();
    const rows = await this.db.collection('submissions').where('slug', '==', slug).get();
    for (const row of rows.docs) {
      // Keep the indexed parent until every child is gone, including retries.
      for (const child of await row.ref.listCollections()) await this.db.recursiveDelete(child);
      await this.db.runTransaction(async (tx) => {
        const current = await tx.get(row.ref);
        if (current.exists && current.data()?.slug === slug) tx.delete(row.ref);
      });
    }
    for (const child of await game.listCollections()) await this.db.recursiveDelete(child);
    for (const collection of ['gameAgentKeys', 'gameTransfers', 'gameTransferProposalBySlug']) {
      await this.db.collection(collection).doc(slug).delete();
    }
    const access = this.db.collection('gameAccess').doc(slug);
    await this.db.runTransaction(async (tx) => {
      if ((await tx.get(access)).exists) tx.delete(access);
    });
    // Retire the address so stale workers cannot recreate a deleted game.
    await game.set({ purged: true });
  }
}

export class MemoryGameTrash implements GameTrashStore {
  private entries = new Map<string, TrashEntry>();
  private purged = new Set<string>();
  async reservesSlug(slug: string) {
    return this.blocked(slug) || this.publications.has(slug);
  }
  blocked = (slug: string) => this.entries.has(slug) || this.purged.has(slug);
  constructor(
    private rounds: Map<number, SubmissionRecord>,
    private publications: Map<string, PublicationRecord>,
    private owner: (slug: string) => string | undefined,
    private cancelTransfer: (slug: string, at: string) => void,
    private forgetAccess: (slug: string) => void,
  ) {}

  async change(slug: string, uid: string, action: GameAction, at: string) {
    const rows = [...this.rounds.values()].filter((row) => row.slug === slug);
    authorize(uid, this.owner(slug), rows, this.entries.get(slug));
    if (this.entries.has(slug) && action === 'trash') return;
    const publication = this.publications.get(slug);
    check(
      action,
      publication,
      rows.some((row) => !row.abandonedAt && !!row.draftSharedAt),
    );
    if (action === 'trash') {
      this.entries.set(slug, entry(slug, uid, at));
      this.cancelTransfer(slug, at);
    } else
      this.publications.set(slug, {
        ...publication!,
        state: 'archived',
        takedownAt: at,
        takedownReason: 'unpublished by owner',
      });
    for (const row of rows) {
      const next = { ...row, ...(action === 'trash' ? retired(row, at) : {}) };
      delete next.draftSharedAt;
      this.rounds.set(row.jobId, next);
    }
  }
  async list(until = '9999') {
    return [...this.entries.values()]
      .filter((row) => row.purgeAfter <= until)
      .sort((a, b) => a.purgeAfter.localeCompare(b.purgeAfter));
  }
  async purge(slug: string, until: string | undefined, eraseObjects: () => Promise<void>) {
    if (this.purged.has(slug)) return;
    const row = this.entries.get(slug);
    if (!row || this.publications.get(slug)?.state === 'published' || (until && row.purgeAfter > until))
      refuse('not_ready');
    await eraseObjects();
    for (const round of this.rounds.values()) if (round.slug === slug) this.rounds.delete(round.jobId);
    this.publications.delete(slug);
    this.forgetAccess(slug);
    this.purged.add(slug);
    this.entries.delete(slug);
  }
}
