import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { randomUUID } from 'node:crypto';
import type { CreatorProposal } from '@gamedevpl/contract';
import type { BuildEvent } from '../../platform/submission-status.js';
import type { CreatorMessage, CreatorMessageOrigin } from '../records/build-log.js';
import { isStudioOrigin } from '../records/build-log.js';
import type { AgentEndedBy } from '../records/rounds.js';
import type { SubmissionRecord } from '../records/submission.js';
import { ownsDreamClaim, type DreamClaimRef } from './round-budget.js';
import { newCreatorMessage } from './creator-message.js';
import {
  clearPendingInboxFlag,
  hasPendingInbox,
  queuesCreatorInbox,
  queueInboxMessage,
  setLocalPendingInboxFlag,
  stampListedInbox,
  stampLocalInbox,
  writePendingInboxFlag,
} from './pending-inbox-flag.js';

// Newest first, id as a tie-break for same-millisecond events.
export function byNewestFirst(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

// Which guard refused, decided with the write rather than read back after.
export type ProposalRefusedBy = 'claim' | 'version' | 'round' | 'muted' | 'paused' | 'blocked';

export type ProposalPostResult = { posted: CreatorMessage } | { posted: null; refusedBy: ProposalRefusedBy };

export interface BuildLogStore {
  // Appends a progress event. Returns it with its assigned id and timestamp.
  appendBuildEvent(
    jobId: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
    options?: { preserveEnded?: boolean },
  ): Promise<BuildEvent>;

  // Refreshes lastAgentSignalAt without a chat event (MCP presence heartbeats).
  touchLastAgentSignalAt(
    jobId: number,
    at?: string,
    presence?: { key: string },
    options?: { preserveEnded?: boolean },
  ): Promise<void>;

  // Marks the agent finished iterating this round (MCP `end`). Idempotent.
  markAgentEnded(jobId: number, at?: string, by?: AgentEndedBy): Promise<void>;

  // Agent progress events for a build, newest first.
  listBuildEvents(jobId: number, opts?: { limit?: number }): Promise<BuildEvent[]>;

  // How many events a build has recorded -- bounds a runaway agent.
  countBuildEvents(jobId: number): Promise<number>;

  // Queues a creator change request; `delivered` skips the inbox.
  appendCreatorMessage(
    jobId: number,
    text: string,
    opts?: {
      origin?: CreatorMessageOrigin;
      delivered?: boolean;
      textLocalized?: string;
      locale?: string;
      proposal?: CreatorProposal;
    },
  ): Promise<CreatorMessage>;

  // Posts only into the round and claim it was drawn for.
  appendProposalMessage(
    jobId: number,
    claim: DreamClaimRef,
    text: string,
    opts: {
      textLocalized?: string;
      locale?: string;
      proposal: CreatorProposal;
      ownerUid: string;
      roundGeneration: number;
      // The caller's stop rule, re-checked against the written row.
      blocked: (job: SubmissionRecord) => boolean;
    },
  ): Promise<ProposalPostResult>;

  // Undelivered messages, oldest first -- the agent's inbox. Never a 'studio' row.
  listPendingCreatorMessages(jobId: number, opts?: { limit?: number; stampEmpty?: boolean }): Promise<CreatorMessage[]>;

  // Every creator message, oldest first; cards drop before the limit.
  listCreatorMessages(jobId: number, opts?: { limit?: number; excludeProposals?: boolean }): Promise<CreatorMessage[]>;

  // Marks messages collected, so the agent isn't handed them twice.
  markCreatorMessagesDelivered(jobId: number, ids: string[]): Promise<void>;
}

// Names the attempt, so another worker's card cannot answer for it.
export function postedAttemptKey(claim: DreamClaimRef): string {
  return `${claim.version}:${claim.claimedAt}`;
}

// Which of the two refused; one must not read as the other.
function dreamClaimRefusal(
  record: Pick<SubmissionRecord, 'dreamRun' | 'previewVersion' | 'deliveredVersion'> | undefined,
  claim: DreamClaimRef,
): 'claim' | 'version' | null {
  if (!record || !ownsDreamClaim(record.dreamRun, claim)) return 'claim';
  if (record.dreamRun?.postedAt) return 'claim';
  // A moved delivery leaves the new one unclaimed, not carded.
  if ((record.previewVersion ?? record.deliveredVersion) !== claim.version) return 'version';
  return null;
}

export class InMemoryBuildLogStore implements BuildLogStore {
  private buildEvents = new Map<number, BuildEvent[]>();
  private creatorMessages = new Map<number, CreatorMessage[]>();

  constructor(
    private submissions: Map<number, SubmissionRecord>,
    private users: Map<string, { proposalsMutedAt?: string | null }>,
    private limits: () => Promise<{ dreamsPaused?: boolean } | null>,
  ) {}

  async appendBuildEvent(
    jobId: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
    options?: { preserveEnded?: boolean },
  ): Promise<BuildEvent> {
    const record: BuildEvent = { ...event, id: randomUUID(), createdAt: event.createdAt ?? new Date().toISOString() };
    const existing = this.buildEvents.get(jobId) ?? [];
    existing.push(record);
    this.buildEvents.set(jobId, existing);
    const submission = this.submissions.get(jobId);
    if (submission) {
      const next: SubmissionRecord = { ...submission, lastAgentSignalAt: record.createdAt };
      // A real chat row supersedes the ambient thought flash.
      delete next.lastAgentPresence;
      if (!options?.preserveEnded) {
        // Resumed work after MCP `end` — clear so stall is no longer `ended`.
        delete next.agentEndedAt;
        delete next.agentEndedBy;
      }
      this.submissions.set(jobId, next);
    }
    return { ...record };
  }

  async touchLastAgentSignalAt(
    jobId: number,
    at?: string,
    presence?: { key: string },
    options?: { preserveEnded?: boolean },
  ): Promise<void> {
    const submission = this.submissions.get(jobId);
    if (!submission) return;
    const stamped = at ?? new Date().toISOString();
    const next: SubmissionRecord = {
      ...submission,
      lastAgentSignalAt: stamped,
      ...(presence ? { lastAgentPresence: { key: presence.key, at: stamped } } : {}),
    };
    if (!options?.preserveEnded) {
      delete next.agentEndedAt;
      delete next.agentEndedBy;
    }
    this.submissions.set(jobId, next);
  }

  async markAgentEnded(jobId: number, at?: string, by: AgentEndedBy = 'end'): Promise<void> {
    const submission = this.submissions.get(jobId);
    if (!submission) return;
    this.submissions.set(jobId, {
      ...submission,
      agentEndedAt: at ?? new Date().toISOString(),
      agentEndedBy: by,
    });
  }

  async listBuildEvents(jobId: number, opts?: { limit?: number }): Promise<BuildEvent[]> {
    return [...(this.buildEvents.get(jobId) ?? [])]
      .sort(byNewestFirst)
      .slice(0, opts?.limit ?? 20)
      .map((event) => ({ ...event }));
  }

  async countBuildEvents(jobId: number): Promise<number> {
    return this.buildEvents.get(jobId)?.length ?? 0;
  }

  async appendCreatorMessage(
    jobId: number,
    text: string,
    opts?: {
      origin?: CreatorMessageOrigin;
      delivered?: boolean;
      textLocalized?: string;
      locale?: string;
      proposal?: CreatorProposal;
    },
  ): Promise<CreatorMessage> {
    const record = newCreatorMessage(text, opts);
    const existing = this.creatorMessages.get(jobId) ?? [];
    existing.push(record);
    this.creatorMessages.set(jobId, existing);
    if (queuesCreatorInbox(opts)) setLocalPendingInboxFlag(this.submissions, jobId, true);
    return { ...record };
  }

  async appendProposalMessage(
    jobId: number,
    claim: DreamClaimRef,
    text: string,
    opts: {
      textLocalized?: string;
      locale?: string;
      proposal: CreatorProposal;
      ownerUid: string;
      roundGeneration: number;
      blocked: (job: SubmissionRecord) => boolean;
    },
  ): Promise<ProposalPostResult> {
    const record = this.submissions.get(jobId);
    const refusedBy = dreamClaimRefusal(record, claim);
    if (refusedBy) return { posted: null, refusedBy };
    if ((record?.roundGeneration ?? 1) !== opts.roundGeneration) return { posted: null, refusedBy: 'round' };
    if (this.users.get(opts.ownerUid)?.proposalsMutedAt) return { posted: null, refusedBy: 'muted' };
    if ((await this.limits())?.dreamsPaused === true) return { posted: null, refusedBy: 'paused' };
    if (opts.blocked(record!)) return { posted: null, refusedBy: 'blocked' };
    const posted = await this.appendCreatorMessage(jobId, text, { ...opts, origin: 'studio', delivered: true });
    // Re-read; a concurrent inbox stamp must survive.
    const current = this.submissions.get(jobId) ?? record!;
    const attempts = [...new Set([...(current.proposalPostedAttempts ?? []), postedAttemptKey(claim)])];
    this.submissions.set(jobId, {
      ...current,
      dreamRun: { ...current.dreamRun!, postedAt: posted.createdAt },
      proposalPostedAttempts: attempts,
    });
    return { posted };
  }

  async listPendingCreatorMessages(
    jobId: number,
    opts?: { limit?: number; stampEmpty?: boolean },
  ): Promise<CreatorMessage[]> {
    const pending = (this.creatorMessages.get(jobId) ?? [])
      .filter((message) => !message.deliveredAt && !isStudioOrigin(message.origin))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, opts?.limit ?? 10)
      .map((message) => ({ ...message }));
    if (opts?.stampEmpty) stampLocalInbox(this.submissions, jobId, pending.length);
    return pending;
  }

  async listCreatorMessages(
    jobId: number,
    opts?: { limit?: number; excludeProposals?: boolean },
  ): Promise<CreatorMessage[]> {
    // No id tie-break -- a stable sort keeps same-millisecond append order.
    return [...(this.creatorMessages.get(jobId) ?? [])]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .filter((message) => !(opts?.excludeProposals && message.proposal))
      .slice(-(opts?.limit ?? 20))
      .map((message) => ({ ...message }));
  }

  async markCreatorMessagesDelivered(jobId: number, ids: string[]): Promise<void> {
    const existing = this.creatorMessages.get(jobId);
    if (!existing || ids.length === 0) return;
    const at = new Date().toISOString();
    const targets = new Set(ids);
    const next = existing.map((message) =>
      targets.has(message.id) && !message.deliveredAt ? { ...message, deliveredAt: at } : message,
    );
    this.creatorMessages.set(jobId, next);
    setLocalPendingInboxFlag(this.submissions, jobId, hasPendingInbox(next));
  }
}

export class FirestoreBuildLogStore implements BuildLogStore {
  constructor(private db: Firestore) {}

  private submissionRef(jobId: number) {
    return this.db.collection('submissions').doc(String(jobId));
  }

  private eventsCollection(jobId: number) {
    return this.submissionRef(jobId).collection('events');
  }

  private messagesCollection(jobId: number) {
    return this.submissionRef(jobId).collection('messages');
  }

  async appendBuildEvent(
    jobId: number,
    event: Omit<BuildEvent, 'id' | 'createdAt'> & { createdAt?: string },
    options?: { preserveEnded?: boolean },
  ): Promise<BuildEvent> {
    const record: BuildEvent = { ...event, id: randomUUID(), createdAt: event.createdAt ?? new Date().toISOString() };
    // Firestore rejects undefined values; optional fields are simply absent instead.
    const document = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
    await this.eventsCollection(jobId).doc(record.id).set(document);
    // Denormalized onto the parent -- lets the operator queue judge silence cheaply.
    await this.submissionRef(jobId).set(
      {
        lastAgentSignalAt: record.createdAt,
        // A real chat row supersedes the ambient thought flash.
        lastAgentPresence: FieldValue.delete(),
        // Resumed work after MCP `end`.
        ...(options?.preserveEnded ? {} : { agentEndedAt: FieldValue.delete(), agentEndedBy: FieldValue.delete() }),
      },
      { merge: true },
    );
    return record;
  }

  async touchLastAgentSignalAt(
    jobId: number,
    at?: string,
    presence?: { key: string },
    options?: { preserveEnded?: boolean },
  ): Promise<void> {
    const stamped = at ?? new Date().toISOString();
    await this.submissionRef(jobId).set(
      {
        lastAgentSignalAt: stamped,
        ...(options?.preserveEnded ? {} : { agentEndedAt: FieldValue.delete(), agentEndedBy: FieldValue.delete() }),
        ...(presence ? { lastAgentPresence: { key: presence.key, at: stamped } } : {}),
      },
      { merge: true },
    );
  }

  async markAgentEnded(jobId: number, at?: string, by: AgentEndedBy = 'end'): Promise<void> {
    await this.submissionRef(jobId).set(
      { agentEndedAt: at ?? new Date().toISOString(), agentEndedBy: by },
      { merge: true },
    );
  }

  async listBuildEvents(jobId: number, opts?: { limit?: number }): Promise<BuildEvent[]> {
    const snap = await this.eventsCollection(jobId)
      .orderBy('createdAt', 'desc')
      .limit(opts?.limit ?? 20)
      .get();
    return snap.docs.map((doc) => doc.data() as BuildEvent).sort(byNewestFirst);
  }

  async countBuildEvents(jobId: number): Promise<number> {
    const snap = await this.eventsCollection(jobId).count().get();
    return snap.data().count;
  }

  async appendCreatorMessage(
    jobId: number,
    text: string,
    opts?: {
      origin?: CreatorMessageOrigin;
      delivered?: boolean;
      textLocalized?: string;
      locale?: string;
      proposal?: CreatorProposal;
    },
  ): Promise<CreatorMessage> {
    const record = newCreatorMessage(text, opts);
    const messageRef = this.messagesCollection(jobId).doc(record.id);
    if (!queuesCreatorInbox(opts)) {
      await messageRef.set(record);
      return record;
    }
    await queueInboxMessage(this.db, jobId, messageRef, record);
    return record;
  }

  async appendProposalMessage(
    jobId: number,
    claim: DreamClaimRef,
    text: string,
    opts: {
      textLocalized?: string;
      locale?: string;
      proposal: CreatorProposal;
      ownerUid: string;
      roundGeneration: number;
      blocked: (job: SubmissionRecord) => boolean;
    },
  ): Promise<ProposalPostResult> {
    const record = newCreatorMessage(text, {
      origin: 'studio',
      delivered: true,
      textLocalized: opts.textLocalized,
      locale: opts.locale,
      proposal: opts.proposal,
    });
    const now = record.createdAt;
    return await this.db.runTransaction(async (transaction) => {
      // Read and post together, or a newer delivery wins the gap.
      const snap = await transaction.get(this.submissionRef(jobId));
      // Read here too, so an opt-out mid-write still refuses.
      const owner = await transaction.get(this.db.collection('users').doc(opts.ownerUid));
      // The operator's pause, read with the write rather than before it.
      const ops = await transaction.get(this.db.collection('opsConfig').doc('creationLimits'));
      const job = snap.data() as SubmissionRecord | undefined;
      const refusedBy = !snap.exists ? 'claim' : dreamClaimRefusal(job, claim);
      if (refusedBy) return { posted: null, refusedBy };
      // A reopen bumps the generation and leaves the version alone.
      if ((job?.roundGeneration ?? 1) !== opts.roundGeneration) return { posted: null, refusedBy: 'round' };
      if ((owner.data() as { proposalsMutedAt?: string | null } | undefined)?.proposalsMutedAt) {
        return { posted: null, refusedBy: 'muted' };
      }
      if ((ops.data() as { dreamsPaused?: boolean } | undefined)?.dreamsPaused === true) {
        return { posted: null, refusedBy: 'paused' };
      }
      if (opts.blocked(job!)) return { posted: null, refusedBy: 'blocked' };
      transaction.set(this.messagesCollection(jobId).doc(record.id), record);
      // Stamped with the card; the list outlives the claim it stamps.
      const attempts = [...new Set([...(job!.proposalPostedAttempts ?? []), postedAttemptKey(claim)])];
      transaction.set(
        this.submissionRef(jobId),
        { dreamRun: { ...job!.dreamRun!, postedAt: now }, proposalPostedAttempts: attempts },
        { merge: true },
      );
      return { posted: record };
    });
  }

  async listPendingCreatorMessages(
    jobId: number,
    opts?: { limit?: number; stampEmpty?: boolean },
  ): Promise<CreatorMessage[]> {
    // Filtered/sorted here, not by index -- the set is tiny.
    const snap = await this.messagesCollection(jobId).where('deliveredAt', '==', null).get();
    const pending = snap.docs
      .map((doc) => doc.data() as CreatorMessage)
      .filter((message) => !isStudioOrigin(message.origin))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, opts?.limit ?? 10);
    if (opts?.stampEmpty) {
      await stampListedInbox(this.db, jobId, pending.length, () => this.listPendingCreatorMessages(jobId));
    }
    return pending;
  }

  async listCreatorMessages(
    jobId: number,
    opts?: { limit?: number; excludeProposals?: boolean },
  ): Promise<CreatorMessage[]> {
    const limit = opts?.limit ?? 20;
    // Newest messages first without a full scan.
    if (!opts?.excludeProposals) {
      const snap = await this.messagesCollection(jobId).orderBy('createdAt', 'desc').limit(limit).get();
      return snap.docs
        .map((doc) => doc.data() as CreatorMessage)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    }

    // Pages until `limit` non-proposal messages are found.

    // Capped at 5 pages -- bounded, never the unbounded scan it replaces.
    const pageSize = Math.max(limit * 2, limit + 20);
    const maxPages = 5;
    const kept: CreatorMessage[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (let page = 0; page < maxPages && kept.length < limit; page += 1) {
      let query = this.messagesCollection(jobId).orderBy('createdAt', 'desc').limit(pageSize);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        const message = doc.data() as CreatorMessage;
        if (!message.proposal) kept.push(message);
      }
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < pageSize) break;
    }
    return kept.slice(0, limit).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async markCreatorMessagesDelivered(jobId: number, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const at = new Date().toISOString();
    const collection = this.messagesCollection(jobId);
    // A merge-set on a missing doc creates a phantom row.
    const refs = ids.map((id) => collection.doc(id));
    const snaps = await this.db.getAll(...refs);
    const batch = this.db.batch();
    snaps.forEach((snap, index) => {
      if (snap.exists) batch.set(refs[index], { deliveredAt: at }, { merge: true });
    });
    await batch.commit();
    const remaining = await this.listPendingCreatorMessages(jobId);
    if (remaining.length > 0) return;
    await clearPendingInboxFlag(this.db, jobId);
    if ((await this.listPendingCreatorMessages(jobId)).length > 0) {
      await writePendingInboxFlag(this.db, jobId, true);
    }
  }
}
