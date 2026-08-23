import { randomUUID } from 'node:crypto';
import type { DocumentData, Firestore } from '@google-cloud/firestore';
import type { VoteValue } from '@gamedevpl/contract';
import type { GameVoteCounts, PlayerFeedbackRecord } from '../records/social.js';

export interface SocialStore {
  // A user's current vote, or null if they haven't voted.
  getVote(slug: string, uid: string): Promise<VoteValue | null>;

  // Casts or changes a vote; repeating a value is a no-op.
  castVote(slug: string, uid: string, value: VoteValue): Promise<GameVoteCounts>;

  // Removes a user's vote. Returns the game's updated aggregate counts.
  clearVote(slug: string, uid: string): Promise<GameVoteCounts>;

  // Follow/unfollow a game; denormalised onto the game doc beside votes.
  setGameFollow(slug: string, uid: string, at: string): Promise<number>;

  clearGameFollow(slug: string, uid: string): Promise<number>;

  isFollowingGame(slug: string, uid: string): Promise<boolean>;

  countGameFollowers(slug: string): Promise<number>;

  // Uids to notify on publish, newest follower first; bounded, best-effort fanout.
  listGameFollowers(slug: string, opts?: { limit?: number }): Promise<string[]>;

  // A game's aggregate vote counts -- the public read, no uid involved.
  getVoteCounts(slug: string): Promise<GameVoteCounts>;

  // Appends one already-moderated, already-sanitized feedback row.
  addPlayerFeedback(slug: string, uid: string, text: string): Promise<PlayerFeedbackRecord>;

  // A game's feedback, newest first; limit bounds the sweep's read.
  listPlayerFeedback(slug: string, opts?: { limit?: number }): Promise<PlayerFeedbackRecord[]>;

  // A count, not a length -- one aggregate scan, not many reads.
  countPlayerFeedback(slug: string): Promise<number>;

  // Deletes every feedback row a user wrote, across all games.
  deletePlayerFeedbackByUid(uid: string): Promise<number>;

  // Same predicate as the delete above; a count -- the preview.
  countPlayerFeedbackByUid(uid: string): Promise<number>;
}

export class InMemorySocialStore implements SocialStore {
  // Not private -- PublicationStore.listGameSlugs reaches across these (documented exception, see PR).
  votes = new Map<string, Map<string, VoteValue>>(); // slug -> (uid -> value)
  follows = new Map<string, Map<string, string>>(); // slug -> uid -> followedAt
  playerFeedback = new Map<string, PlayerFeedbackRecord[]>(); // slug -> feedback rows

  private voteCounts(slug: string): GameVoteCounts {
    const counts: GameVoteCounts = { up: 0, down: 0 };
    for (const value of this.votes.get(slug)?.values() ?? []) counts[value] += 1;
    return counts;
  }

  async getVote(slug: string, uid: string): Promise<VoteValue | null> {
    return this.votes.get(slug)?.get(uid) ?? null;
  }

  async castVote(slug: string, uid: string, value: VoteValue): Promise<GameVoteCounts> {
    const forGame = this.votes.get(slug) ?? new Map<string, VoteValue>();
    forGame.set(uid, value);
    this.votes.set(slug, forGame);
    return this.voteCounts(slug);
  }

  async clearVote(slug: string, uid: string): Promise<GameVoteCounts> {
    this.votes.get(slug)?.delete(uid);
    return this.voteCounts(slug);
  }

  async getVoteCounts(slug: string): Promise<GameVoteCounts> {
    return this.voteCounts(slug);
  }

  async setGameFollow(slug: string, uid: string, at: string): Promise<number> {
    const forGame = this.follows.get(slug) ?? new Map<string, string>();
    if (!forGame.has(uid)) forGame.set(uid, at);
    this.follows.set(slug, forGame);
    return forGame.size;
  }

  async clearGameFollow(slug: string, uid: string): Promise<number> {
    const forGame = this.follows.get(slug);
    forGame?.delete(uid);
    return forGame?.size ?? 0;
  }

  async isFollowingGame(slug: string, uid: string): Promise<boolean> {
    return this.follows.get(slug)?.has(uid) ?? false;
  }

  async countGameFollowers(slug: string): Promise<number> {
    return this.follows.get(slug)?.size ?? 0;
  }

  async listGameFollowers(slug: string, opts?: { limit?: number }): Promise<string[]> {
    const forGame = this.follows.get(slug);
    if (!forGame) return [];
    const sorted = Array.from(forGame.entries())
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([uid]) => uid);
    return opts?.limit ? sorted.slice(0, opts.limit) : sorted;
  }

  async addPlayerFeedback(slug: string, uid: string, text: string): Promise<PlayerFeedbackRecord> {
    const record: PlayerFeedbackRecord = { id: randomUUID(), uid, text, createdAt: new Date().toISOString() };
    const forGame = this.playerFeedback.get(slug) ?? [];
    forGame.push(record);
    this.playerFeedback.set(slug, forGame);
    return record;
  }

  async listPlayerFeedback(slug: string, opts?: { limit?: number }): Promise<PlayerFeedbackRecord[]> {
    const newestFirst = [...(this.playerFeedback.get(slug) ?? [])].reverse();
    return opts?.limit === undefined ? newestFirst : newestFirst.slice(0, opts.limit);
  }

  async countPlayerFeedback(slug: string): Promise<number> {
    return this.playerFeedback.get(slug)?.length ?? 0;
  }

  async deletePlayerFeedbackByUid(uid: string): Promise<number> {
    let deleted = 0;
    for (const [slug, rows] of this.playerFeedback) {
      const kept = rows.filter((row) => row.uid !== uid);
      deleted += rows.length - kept.length;
      this.playerFeedback.set(slug, kept);
    }
    return deleted;
  }

  async countPlayerFeedbackByUid(uid: string): Promise<number> {
    let total = 0;
    for (const rows of this.playerFeedback.values()) {
      total += rows.filter((row) => row.uid === uid).length;
    }
    return total;
  }
}

export class FirestoreSocialStore implements SocialStore {
  constructor(private db: Firestore) {}

  // Duplicated in contribution.ts -- trivial enough not to share.
  private gameRef(slug: string) {
    return this.db.collection('games').doc(slug);
  }

  private voteRef(slug: string, uid: string) {
    return this.gameRef(slug).collection('votes').doc(uid);
  }

  private feedbackCollection(slug: string) {
    return this.gameRef(slug).collection('playerFeedback');
  }

  private followerRef(slug: string, uid: string) {
    return this.gameRef(slug).collection('followers').doc(uid);
  }

  private static readVoteCounts(data: DocumentData | undefined): GameVoteCounts {
    return { up: (data?.votesUp as number | undefined) ?? 0, down: (data?.votesDown as number | undefined) ?? 0 };
  }

  async getVote(slug: string, uid: string): Promise<VoteValue | null> {
    const snap = await this.voteRef(slug, uid).get();
    return snap.exists ? ((snap.data()?.value as VoteValue | undefined) ?? null) : null;
  }

  async castVote(slug: string, uid: string, value: VoteValue): Promise<GameVoteCounts> {
    const gameRef = this.gameRef(slug);
    const voteRef = this.voteRef(slug, uid);
    return await this.db.runTransaction(async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      const voteSnap = await transaction.get(voteRef);
      const counts = FirestoreSocialStore.readVoteCounts(gameSnap.data());
      const previous = voteSnap.exists ? (voteSnap.data()?.value as VoteValue | undefined) : undefined;

      // Repeating the same vote must not double-count the tally.
      if (previous !== value) {
        if (previous) counts[previous] = Math.max(0, counts[previous] - 1);
        counts[value] += 1;
        transaction.set(gameRef, { votesUp: counts.up, votesDown: counts.down }, { merge: true });
      }
      transaction.set(voteRef, { value, updatedAt: new Date().toISOString() });
      return counts;
    });
  }

  async clearVote(slug: string, uid: string): Promise<GameVoteCounts> {
    const gameRef = this.gameRef(slug);
    const voteRef = this.voteRef(slug, uid);
    return await this.db.runTransaction(async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      const voteSnap = await transaction.get(voteRef);
      const counts = FirestoreSocialStore.readVoteCounts(gameSnap.data());
      if (!voteSnap.exists) return counts;

      const previous = voteSnap.data()?.value as VoteValue | undefined;
      if (previous) counts[previous] = Math.max(0, counts[previous] - 1);
      transaction.delete(voteRef);
      transaction.set(gameRef, { votesUp: counts.up, votesDown: counts.down }, { merge: true });
      return counts;
    });
  }

  async setGameFollow(slug: string, uid: string, at: string): Promise<number> {
    const gameRef = this.gameRef(slug);
    const followerRef = this.followerRef(slug, uid);
    return await this.db.runTransaction(async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      const followerSnap = await transaction.get(followerRef);
      const count = (gameSnap.data()?.followers as number | undefined) ?? 0;
      // A repeat follow doesn't double the tally.
      if (followerSnap.exists) return count;
      transaction.set(followerRef, { followedAt: at });
      transaction.set(gameRef, { followers: count + 1 }, { merge: true });
      return count + 1;
    });
  }

  async clearGameFollow(slug: string, uid: string): Promise<number> {
    const gameRef = this.gameRef(slug);
    const followerRef = this.followerRef(slug, uid);
    return await this.db.runTransaction(async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      const followerSnap = await transaction.get(followerRef);
      const count = (gameSnap.data()?.followers as number | undefined) ?? 0;
      if (!followerSnap.exists) return count;
      const next = Math.max(0, count - 1);
      transaction.delete(followerRef);
      transaction.set(gameRef, { followers: next }, { merge: true });
      return next;
    });
  }

  async isFollowingGame(slug: string, uid: string): Promise<boolean> {
    const snap = await this.followerRef(slug, uid).get();
    return snap.exists;
  }

  async countGameFollowers(slug: string): Promise<number> {
    const snap = await this.gameRef(slug).get();
    return (snap.data()?.followers as number | undefined) ?? 0;
  }

  async listGameFollowers(slug: string, opts?: { limit?: number }): Promise<string[]> {
    let query = this.gameRef(slug).collection('followers').orderBy('followedAt', 'desc');
    if (opts?.limit) query = query.limit(opts.limit);
    const snap = await query.get();
    return snap.docs.map((doc) => doc.id);
  }

  async getVoteCounts(slug: string): Promise<GameVoteCounts> {
    const snap = await this.gameRef(slug).get();
    return FirestoreSocialStore.readVoteCounts(snap.data());
  }

  async addPlayerFeedback(slug: string, uid: string, text: string): Promise<PlayerFeedbackRecord> {
    const createdAt = new Date().toISOString();
    const ref = this.feedbackCollection(slug).doc();
    const record: PlayerFeedbackRecord = { id: ref.id, uid, text, createdAt };
    await ref.set({ uid, text, createdAt });
    return record;
  }

  async listPlayerFeedback(slug: string, opts?: { limit?: number }): Promise<PlayerFeedbackRecord[]> {
    // Unbounded by default; the sweep passes a limit to bound its read.
    const ordered = this.feedbackCollection(slug).orderBy('createdAt', 'desc');
    const snap = await (opts?.limit === undefined ? ordered : ordered.limit(opts.limit)).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlayerFeedbackRecord, 'id'>) }));
  }

  async countPlayerFeedback(slug: string): Promise<number> {
    const snap = await this.feedbackCollection(slug).count().get();
    return snap.data().count;
  }

  // Needs the COLLECTION_GROUP index (setup-gcp.sh); missing it fails outright.
  private feedbackByUid(uid: string) {
    return this.db.collectionGroup('playerFeedback').where('uid', '==', uid);
  }

  async deletePlayerFeedbackByUid(uid: string): Promise<number> {
    const snap = await this.feedbackByUid(uid).get();
    if (snap.empty) return 0;

    // Chunked -- a batch tops out at 500 writes.
    const docs = snap.docs;
    for (let index = 0; index < docs.length; index += 400) {
      const batch = this.db.batch();
      for (const doc of docs.slice(index, index + 400)) batch.delete(doc.ref);
      await batch.commit();
    }
    return docs.length;
  }

  async countPlayerFeedbackByUid(uid: string): Promise<number> {
    const snap = await this.feedbackByUid(uid).count().get();
    return snap.data().count;
  }
}
