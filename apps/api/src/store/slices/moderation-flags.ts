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

export type ResolveModerationFlagResult =
  { ok: true; flag: ModerationFlag } | { ok: false; reason: 'not_found' | 'already_resolved' };

export interface ModerationFlagStore {
  // Opens a report, or reopens the reviewer's resolved one.
  raiseModerationFlag(input: RaiseModerationFlagInput): Promise<ModerationFlag>;

  getModerationFlag(id: string): Promise<ModerationFlag | null>;

  // Newest first; an operator queue, not an audit export.
  listModerationFlags(opts?: { status?: 'open' | 'resolved'; limit?: number }): Promise<ModerationFlag[]>;

  // Only from open, so a replay cannot re-run a takedown.
  resolveModerationFlag(id: string, input: ResolveModerationFlagInput): Promise<ResolveModerationFlagResult>;

  // Undoes a claim whose takedown then failed.
  reopenModerationFlag(id: string): Promise<void>;

  countModerationFlagsByUid(uid: string): Promise<number>;

  deleteModerationFlagsByUid(uid: string): Promise<number>;
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
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

// A resolved flag names the operator as well as the reporter.
function touchesUid(flag: ModerationFlag, uid: string): boolean {
  return flag.raisedByUid === uid || flag.resolvedByUid === uid;
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

  async resolveModerationFlag(id: string, input: ResolveModerationFlagInput): Promise<ResolveModerationFlagResult> {
    const flag = this.flags.get(id);
    if (!flag) return { ok: false, reason: 'not_found' };
    if (flag.status !== 'open') return { ok: false, reason: 'already_resolved' };
    const resolved: ModerationFlag = {
      ...flag,
      status: 'resolved',
      action: input.action,
      resolvedByUid: input.resolvedByUid,
      resolvedAt: input.resolvedAt,
      resolutionNote: input.resolutionNote ?? null,
    };
    this.flags.set(id, resolved);
    return { ok: true, flag: { ...resolved } };
  }

  async reopenModerationFlag(id: string): Promise<void> {
    const flag = this.flags.get(id);
    if (!flag) return;
    this.flags.set(id, {
      ...flag,
      status: 'open',
      action: null,
      resolvedByUid: null,
      resolvedAt: null,
      resolutionNote: null,
    });
  }

  async countModerationFlagsByUid(uid: string): Promise<number> {
    return [...this.flags.values()].filter((flag) => touchesUid(flag, uid)).length;
  }

  async deleteModerationFlagsByUid(uid: string): Promise<number> {
    let deleted = 0;
    for (const [id, flag] of [...this.flags.entries()]) {
      if (!touchesUid(flag, uid)) continue;
      this.flags.delete(id);
      deleted += 1;
    }
    return deleted;
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
    // Equality only — no orderBy / composite index.
    const collection = this.db.collection(MODERATION_FLAGS_COLLECTION);
    const snap = await (opts?.status ? collection.where('status', '==', opts.status) : collection).get();
    const rows = snap.docs.map((doc) => hydrateModerationFlag(doc.id, doc.data() as Omit<ModerationFlag, 'id'>));
    return byNewest(rows).slice(0, opts?.limit ?? 200);
  }

  async resolveModerationFlag(id: string, input: ResolveModerationFlagInput): Promise<ResolveModerationFlagResult> {
    const ref = this.ref(id);
    return this.db.runTransaction<ResolveModerationFlagResult>(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() as Omit<ModerationFlag, 'id'> | undefined;
      if (!data) return { ok: false, reason: 'not_found' };
      if (data.status !== 'open') return { ok: false, reason: 'already_resolved' };
      const resolved = hydrateModerationFlag(id, {
        ...data,
        status: 'resolved',
        action: input.action,
        resolvedByUid: input.resolvedByUid,
        resolvedAt: input.resolvedAt,
        resolutionNote: input.resolutionNote ?? null,
      });
      tx.set(ref, resolved);
      return { ok: true, flag: resolved };
    });
  }

  async reopenModerationFlag(id: string): Promise<void> {
    const ref = this.ref(id);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() as Omit<ModerationFlag, 'id'> | undefined;
      if (!data) return;
      tx.set(
        ref,
        hydrateModerationFlag(id, {
          ...data,
          status: 'open',
          action: null,
          resolvedByUid: null,
          resolvedAt: null,
          resolutionNote: null,
        }),
      );
    });
  }

  private async flagsTouching(uid: string): Promise<ModerationFlag[]> {
    // Equality only — two reads, no composite index.
    const collection = this.db.collection(MODERATION_FLAGS_COLLECTION);
    const [raised, resolved] = await Promise.all([
      collection.where('raisedByUid', '==', uid).get(),
      collection.where('resolvedByUid', '==', uid).get(),
    ]);
    const rows = new Map<string, ModerationFlag>();
    for (const doc of [...raised.docs, ...resolved.docs]) {
      rows.set(doc.id, hydrateModerationFlag(doc.id, doc.data() as Omit<ModerationFlag, 'id'>));
    }
    return [...rows.values()];
  }

  async countModerationFlagsByUid(uid: string): Promise<number> {
    return (await this.flagsTouching(uid)).length;
  }

  async deleteModerationFlagsByUid(uid: string): Promise<number> {
    const rows = await this.flagsTouching(uid);
    await Promise.all(rows.map((flag) => this.ref(flag.id).delete()));
    return rows.length;
  }
}
