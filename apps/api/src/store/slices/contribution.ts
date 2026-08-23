import type { Firestore } from '@google-cloud/firestore';
import type { ProposalState } from '../../proposal-state.js';
import { stripUndefined } from '../firestore-util.js';
import type {
  SuggestionStatus,
  SuggestionRecord,
  ProposalRecord,
  GameContributionSettings,
  ContributorBlockRecord,
} from '../records/contribution.js';
import { compareProposals } from '../records/contribution.js';

// Presentation order: worst first, then newest, then slug -- a work queue.
function compareSuggestions(a: SuggestionRecord, b: SuggestionRecord): number {
  return (
    b.priority - a.priority ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.slug.localeCompare(b.slug) ||
    a.id.localeCompare(b.id)
  );
}

export interface ContributionStore {
  // What the creator has allowed the platform to do unasked (IL-4).
  getGameAutonomy(slug: string): Promise<string | null>;

  setGameAutonomy(slug: string, mode: string): Promise<void>;

  // Cleanup for the superseded per-game suggestion sweep's leftover docs.
  purgeLegacyGameSuggestions(limit: number): Promise<number>;

  // Writes a suggestion whole (docs/improvement-loop-plan.md IL-3).
  putSuggestion(record: SuggestionRecord): Promise<void>;

  // One suggestion by id, or null.
  getSuggestion(id: string): Promise<SuggestionRecord | null>;

  // Suggestions, newest first, optionally narrowed by status/owner.
  listSuggestions(opts?: {
    status?: SuggestionStatus[];
    ownerUid?: string;
    limit?: number;
  }): Promise<SuggestionRecord[]>;

  // Writes a proposal whole.
  putProposal(record: ProposalRecord): Promise<void>;

  // One proposal by id, or null.
  getProposal(id: string): Promise<ProposalRecord | null>;

  // Proposals, newest first, optionally narrowed by proposer/owner/game/state.
  listProposals(opts?: {
    proposerUid?: string;
    targetOwnerUid?: string | null;
    targetSlug?: string;
    state?: ProposalState[];
    limit?: number;
  }): Promise<ProposalRecord[]>;

  // A game's contribution setting, or null if never set.
  getContributionSettings(slug: string): Promise<GameContributionSettings | null>;

  putContributionSettings(record: GameContributionSettings): Promise<void>;

  // Whether `ownerUid` has blocked `blockedUid` from proposing to their games.
  isContributorBlocked(ownerUid: string, blockedUid: string): Promise<boolean>;

  blockContributor(record: ContributorBlockRecord): Promise<void>;

  unblockContributor(ownerUid: string, blockedUid: string): Promise<void>;

  // Everyone this creator has blocked -- the settings surface's read.
  listContributorBlocks(ownerUid: string): Promise<ContributorBlockRecord[]>;
}

export class InMemoryContributionStore implements ContributionStore {
  // Not private -- deleteAccountIdentity reaches across these (documented exception, see PR).
  suggestions = new Map<string, SuggestionRecord>();
  gameAutonomy = new Map<string, string>(); // slug -> mode
  proposals = new Map<string, ProposalRecord>(); // id -> proposal
  private contributionSettings = new Map<string, GameContributionSettings>(); // slug -> setting
  private contributorBlocks = new Map<string, Map<string, ContributorBlockRecord>>(); // ownerUid -> blockedUid -> row
  private legacyGameSuggestions = new Set<string>();

  async getGameAutonomy(slug: string): Promise<string | null> {
    return this.gameAutonomy.get(slug) ?? null;
  }

  async setGameAutonomy(slug: string, mode: string): Promise<void> {
    this.gameAutonomy.set(slug, mode);
  }

  async purgeLegacyGameSuggestions(limit: number): Promise<number> {
    const doomed = [...this.legacyGameSuggestions].slice(0, limit);
    for (const slug of doomed) this.legacyGameSuggestions.delete(slug);
    return doomed.length;
  }

  // Test-only seed for the purge above; not on the Store interface.
  seedLegacyGameSuggestion(slug: string): void {
    this.legacyGameSuggestions.add(slug);
  }

  async putSuggestion(record: SuggestionRecord): Promise<void> {
    this.suggestions.set(record.id, structuredClone(record));
  }

  async getSuggestion(id: string): Promise<SuggestionRecord | null> {
    const found = this.suggestions.get(id);
    return found ? structuredClone(found) : null;
  }

  async listSuggestions(opts?: {
    status?: SuggestionStatus[];
    ownerUid?: string;
    limit?: number;
  }): Promise<SuggestionRecord[]> {
    const wanted = opts?.status ? new Set(opts.status) : null;
    return (
      [...this.suggestions.values()]
        .filter((record) => (wanted ? wanted.has(record.status) : true))
        .filter((record) => (opts?.ownerUid ? record.ownerUid === opts.ownerUid : true))
        .map((record) => structuredClone(record))
        .sort(compareSuggestions)
        // No limit means every match, matching Firestore's paged read.
        .slice(0, opts?.limit ?? Number.MAX_SAFE_INTEGER)
    );
  }

  async putProposal(record: ProposalRecord): Promise<void> {
    this.proposals.set(record.id, structuredClone(record));
  }

  async getProposal(id: string): Promise<ProposalRecord | null> {
    const found = this.proposals.get(id);
    return found ? structuredClone(found) : null;
  }

  async listProposals(opts?: {
    proposerUid?: string;
    targetOwnerUid?: string | null;
    targetSlug?: string;
    state?: ProposalState[];
    limit?: number;
  }): Promise<ProposalRecord[]> {
    const wanted = opts?.state ? new Set(opts.state) : null;
    // Checks key presence, not truthiness -- null means the platform queue.
    const filterByOwner = opts !== undefined && 'targetOwnerUid' in opts;
    return [...this.proposals.values()]
      .filter((record) => (opts?.proposerUid ? record.proposerUid === opts.proposerUid : true))
      .filter((record) => (filterByOwner ? record.targetOwnerUid === opts.targetOwnerUid : true))
      .filter((record) => (opts?.targetSlug ? record.targetSlug === opts.targetSlug : true))
      .filter((record) => (wanted ? wanted.has(record.state) : true))
      .map((record) => structuredClone(record))
      .sort(compareProposals)
      .slice(0, opts?.limit ?? Number.MAX_SAFE_INTEGER);
  }

  async getContributionSettings(slug: string): Promise<GameContributionSettings | null> {
    const found = this.contributionSettings.get(slug);
    return found ? { ...found } : null;
  }

  async putContributionSettings(record: GameContributionSettings): Promise<void> {
    this.contributionSettings.set(record.slug, { ...record });
  }

  async isContributorBlocked(ownerUid: string, blockedUid: string): Promise<boolean> {
    return this.contributorBlocks.get(ownerUid)?.has(blockedUid) ?? false;
  }

  async blockContributor(record: ContributorBlockRecord): Promise<void> {
    const forOwner = this.contributorBlocks.get(record.ownerUid) ?? new Map<string, ContributorBlockRecord>();
    forOwner.set(record.blockedUid, { ...record });
    this.contributorBlocks.set(record.ownerUid, forOwner);
  }

  async unblockContributor(ownerUid: string, blockedUid: string): Promise<void> {
    this.contributorBlocks.get(ownerUid)?.delete(blockedUid);
  }

  async listContributorBlocks(ownerUid: string): Promise<ContributorBlockRecord[]> {
    return [...(this.contributorBlocks.get(ownerUid)?.values() ?? [])]
      .map((record) => ({ ...record }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.blockedUid.localeCompare(b.blockedUid));
  }
}

export class FirestoreContributionStore implements ContributionStore {
  constructor(private db: Firestore) {}

  // Duplicated in social.ts -- trivial enough not to share.
  private gameRef(slug: string) {
    return this.db.collection('games').doc(slug);
  }

  // Top-level -- read as a cross-game queue, not per-game.
  private proposalRef(id: string) {
    return this.db.collection('proposals').doc(id);
  }

  // Top-level: a suggestion is read as a cross-game queue.
  private suggestionRef(id: string) {
    return this.db.collection('suggestions').doc(id);
  }

  // Composite id, not a subcollection -- keeps the hot read a point.
  private contributorBlockRef(ownerUid: string, blockedUid: string) {
    return this.db.collection('contributorBlocks').doc(`${ownerUid}_${blockedUid}`);
  }

  async getGameAutonomy(slug: string): Promise<string | null> {
    const snap = await this.gameRef(slug).get();
    return (snap.data() as { autonomy?: string } | undefined)?.autonomy ?? null;
  }

  async setGameAutonomy(slug: string, mode: string): Promise<void> {
    // Merge -- a whole-document write would drop other per-game facts.
    await this.gameRef(slug).set({ autonomy: mode }, { merge: true });
  }

  async purgeLegacyGameSuggestions(limit: number): Promise<number> {
    // Needs no index -- finds leftovers even where the scorecard expired.
    const snap = await this.db.collectionGroup('suggestion').limit(limit).get();
    if (snap.empty) return 0;
    const batch = this.db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    return snap.size;
  }

  async putSuggestion(record: SuggestionRecord): Promise<void> {
    // Whole-document set -- a suggestion is a snapshot, not a merge target.
    await this.suggestionRef(record.id).set(stripUndefined(record));
  }

  async getSuggestion(id: string): Promise<SuggestionRecord | null> {
    const snap = await this.suggestionRef(id).get();
    return snap.exists ? (snap.data() as SuggestionRecord) : null;
  }

  async listSuggestions(opts?: {
    status?: SuggestionStatus[];
    ownerUid?: string;
    limit?: number;
  }): Promise<SuggestionRecord[]> {
    let query: FirebaseFirestore.Query = this.db.collection('suggestions');
    // `in` caps at 30 values; 8 statuses never need chunking.
    if (opts?.status?.length) query = query.where('status', 'in', opts.status);
    if (opts?.ownerUid) query = query.where('ownerUid', '==', opts.ownerUid);

    // No `orderBy` -- avoids a composite index; order restored in memory.
    const pageSize = 500;
    if (opts?.limit !== undefined) {
      const snap = await query.limit(opts.limit).get();
      return snap.docs.map((doc) => doc.data() as SuggestionRecord).sort(compareSuggestions);
    }

    const records: SuggestionRecord[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      const page = cursor ? query.startAfter(cursor).limit(pageSize) : query.limit(pageSize);
      const snap = await page.get();
      if (snap.empty) break;
      records.push(...snap.docs.map((doc) => doc.data() as SuggestionRecord));
      if (snap.docs.length < pageSize) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return records.sort(compareSuggestions);
  }

  async putProposal(record: ProposalRecord): Promise<void> {
    // Whole-document set -- a merge would let a stale decision survive.
    await this.proposalRef(record.id).set(stripUndefined(record));
  }

  async getProposal(id: string): Promise<ProposalRecord | null> {
    const snap = await this.proposalRef(id).get();
    return snap.exists ? (snap.data() as ProposalRecord) : null;
  }

  async listProposals(opts?: {
    proposerUid?: string;
    targetOwnerUid?: string | null;
    targetSlug?: string;
    state?: ProposalState[];
    limit?: number;
  }): Promise<ProposalRecord[]> {
    let query: FirebaseFirestore.Query = this.db.collection('proposals');
    if (opts?.proposerUid) query = query.where('proposerUid', '==', opts.proposerUid);
    // Null is a real filter value here -- the platform queue.
    if (opts !== undefined && 'targetOwnerUid' in opts) {
      query = query.where('targetOwnerUid', '==', opts.targetOwnerUid ?? null);
    }
    if (opts?.targetSlug) query = query.where('targetSlug', '==', opts.targetSlug);
    // 12 states, well under the 30-value `in` cap.
    if (opts?.state?.length) query = query.where('state', 'in', opts.state);

    // No `orderBy`, paged rather than limited -- same rule as listSuggestions.
    const pageSize = 500;
    if (opts?.limit !== undefined) {
      const snap = await query.limit(opts.limit).get();
      return snap.docs.map((doc) => doc.data() as ProposalRecord).sort(compareProposals);
    }

    const records: ProposalRecord[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      const page = cursor ? query.startAfter(cursor).limit(pageSize) : query.limit(pageSize);
      const snap = await page.get();
      if (snap.empty) break;
      records.push(...snap.docs.map((doc) => doc.data() as ProposalRecord));
      if (snap.docs.length < pageSize) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return records.sort(compareProposals);
  }

  async getContributionSettings(slug: string): Promise<GameContributionSettings | null> {
    const snap = await this.gameRef(slug).get();
    const data = (snap.data() as { contributions?: { mode?: string; updatedAt?: string; updatedByUid?: string } })
      ?.contributions;
    if (!data) return null;
    // Field-by-field, not a cast -- an unknown mode reads as `off`.
    return {
      slug,
      mode: data.mode === 'review' ? 'review' : 'off',
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      ...(typeof data.updatedByUid === 'string' ? { updatedByUid: data.updatedByUid } : {}),
    };
  }

  async putContributionSettings(record: GameContributionSettings): Promise<void> {
    // Merge, not whole-document -- the game doc carries other live fields.
    await this.gameRef(record.slug).set(
      {
        contributions: stripUndefined({
          mode: record.mode,
          updatedAt: record.updatedAt,
          updatedByUid: record.updatedByUid,
        }),
      },
      { merge: true },
    );
  }

  async isContributorBlocked(ownerUid: string, blockedUid: string): Promise<boolean> {
    const snap = await this.contributorBlockRef(ownerUid, blockedUid).get();
    return snap.exists;
  }

  async blockContributor(record: ContributorBlockRecord): Promise<void> {
    await this.contributorBlockRef(record.ownerUid, record.blockedUid).set(stripUndefined(record));
  }

  async unblockContributor(ownerUid: string, blockedUid: string): Promise<void> {
    await this.contributorBlockRef(ownerUid, blockedUid).delete();
  }

  async listContributorBlocks(ownerUid: string): Promise<ContributorBlockRecord[]> {
    const snap = await this.db.collection('contributorBlocks').where('ownerUid', '==', ownerUid).get();
    return snap.docs
      .map((doc) => doc.data() as ContributorBlockRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.blockedUid.localeCompare(b.blockedUid));
  }
}
