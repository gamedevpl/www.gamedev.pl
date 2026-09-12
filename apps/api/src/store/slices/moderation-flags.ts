import type { Firestore } from '@google-cloud/firestore';
import type { AssessmentSource, ModerationFlagAction, ModerationFlagReason } from '@gamedevpl/contract';
import {
  MODERATION_FLAGS_COLLECTION,
  hydrateModerationFlag,
  moderationFlagId,
  type ModerationFlag,
} from '../records/moderation-flag.js';

export interface RaiseModerationFlagInput {
  slug: string;
  source: AssessmentSource;
  reason: ModerationFlagReason;
  note: string;
  raisedByUid: string;
  gameVersion?: string | null;
  createdAt: string;
}

export interface ResolveModerationFlagInput {
  action: ModerationFlagAction;
  resolvedByUid: string;
  resolutionNote?: string | null;
  resolvedAt: string;
}

export interface ModerationFlagStore {
  // Opens a report, or reopens the reviewer's resolved one.
  raiseModerationFlag(input: RaiseModerationFlagInput): Promise<ModerationFlag>;

  getModerationFlag(id: string): Promise<ModerationFlag | null>;

  // Newest first; an operator queue, not an audit export.
  listModerationFlags(opts?: { status?: 'open' | 'resolved'; limit?: number }): Promise<ModerationFlag[]>;

  resolveModerationFlag(id: string, input: ResolveModerationFlagInput): Promise<ModerationFlag | null>;
}

function openFlag(input: RaiseModerationFlagInput): ModerationFlag {
  return hydrateModerationFlag(moderationFlagId(input.slug, input.raisedByUid), {
    slug: input.slug,
    source: input.source,
    reason: input.reason,
    note: input.note,
    raisedByUid: input.raisedByUid,
    gameVersion: input.gameVersion ?? null,
    createdAt: input.createdAt,
    status: 'open',
    resolvedAt: null,
    resolvedByUid: null,
    action: null,
    resolutionNote: null,
  });
}

function byNewest(rows: ModerationFlag[]): ModerationFlag[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export class InMemoryModerationFlagStore implements ModerationFlagStore {
  private flags = new Map<string, ModerationFlag>();

  async raiseModerationFlag(input: RaiseModerationFlagInput): Promise<ModerationFlag> {
    const flag = openFlag(input);
    this.flags.set(flag.id, flag);
    return { ...flag };
  }

  async getModerationFlag(id: string): Promise<ModerationFlag | null> {
    const flag = this.flags.get(id);
    return flag ? { ...flag } : null;
  }

  async listModerationFlags(opts?: { status?: 'open' | 'resolved'; limit?: number }): Promise<ModerationFlag[]> {
    const rows = [...this.flags.values()].filter((flag) => !opts?.status || flag.status === opts.status);
    return byNewest(rows)
      .slice(0, opts?.limit ?? 200)
      .map((flag) => ({ ...flag }));
  }

  async resolveModerationFlag(id: string, input: ResolveModerationFlagInput): Promise<ModerationFlag | null> {
    const flag = this.flags.get(id);
    if (!flag) return null;
    const resolved: ModerationFlag = {
      ...flag,
      status: 'resolved',
      action: input.action,
      resolvedByUid: input.resolvedByUid,
      resolvedAt: input.resolvedAt,
      resolutionNote: input.resolutionNote ?? null,
    };
    this.flags.set(id, resolved);
    return { ...resolved };
  }
}

export class FirestoreModerationFlagStore implements ModerationFlagStore {
  constructor(private db: Firestore) {}

  private ref(id: string) {
    return this.db.collection(MODERATION_FLAGS_COLLECTION).doc(id);
  }

  async raiseModerationFlag(input: RaiseModerationFlagInput): Promise<ModerationFlag> {
    const flag = openFlag(input);
    await this.ref(flag.id).set(flag);
    return flag;
  }

  async getModerationFlag(id: string): Promise<ModerationFlag | null> {
    const snap = await this.ref(id).get();
    const data = snap.data() as Omit<ModerationFlag, 'id'> | undefined;
    return data ? hydrateModerationFlag(id, data) : null;
  }

  async listModerationFlags(opts?: { status?: 'open' | 'resolved'; limit?: number }): Promise<ModerationFlag[]> {
    let query = this.db.collection(MODERATION_FLAGS_COLLECTION).orderBy('createdAt', 'desc');
    if (opts?.status) query = query.where('status', '==', opts.status);
    const snap = await query.limit(opts?.limit ?? 200).get();
    return snap.docs.map((doc) => hydrateModerationFlag(doc.id, doc.data() as Omit<ModerationFlag, 'id'>));
  }

  async resolveModerationFlag(id: string, input: ResolveModerationFlagInput): Promise<ModerationFlag | null> {
    const ref = this.ref(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() as Omit<ModerationFlag, 'id'> | undefined;
      if (!data) return null;
      const resolved = hydrateModerationFlag(id, {
        ...data,
        status: 'resolved',
        action: input.action,
        resolvedByUid: input.resolvedByUid,
        resolvedAt: input.resolvedAt,
        resolutionNote: input.resolutionNote ?? null,
      });
      tx.set(ref, resolved);
      return resolved;
    });
  }
}
