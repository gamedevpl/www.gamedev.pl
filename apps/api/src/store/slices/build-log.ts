import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { randomUUID } from 'node:crypto';
import type { BuildEvent } from '../../platform/submission-status.js';
import type { CreatorMessage, CreatorMessageOrigin } from '../records/build-log.js';
import { isStudioOrigin } from '../records/build-log.js';
import type { AgentEndedBy } from '../records/rounds.js';
import type { SubmissionRecord } from '../records/submission.js';

// Newest first, id as a tie-break for same-millisecond events.
export function byNewestFirst(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

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
    opts?: { origin?: CreatorMessageOrigin; delivered?: boolean; textLocalized?: string; locale?: string },
  ): Promise<CreatorMessage>;

  // Undelivered messages, oldest first -- the agent's inbox. Never a 'studio' row.
  listPendingCreatorMessages(jobId: number, opts?: { limit?: number }): Promise<CreatorMessage[]>;

  // Every creator message on a build, delivered or not, oldest first.
  listCreatorMessages(jobId: number, opts?: { limit?: number }): Promise<CreatorMessage[]>;

  // Marks messages collected, so the agent isn't handed them twice.
  markCreatorMessagesDelivered(jobId: number, ids: string[]): Promise<void>;
}

export class InMemoryBuildLogStore implements BuildLogStore {
  private buildEvents = new Map<number, BuildEvent[]>();
  private creatorMessages = new Map<number, CreatorMessage[]>();

  constructor(private submissions: Map<number, SubmissionRecord>) {}

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
    opts?: { origin?: CreatorMessageOrigin; delivered?: boolean; textLocalized?: string; locale?: string },
  ): Promise<CreatorMessage> {
    const now = new Date().toISOString();
    const record: CreatorMessage = {
      id: randomUUID(),
      text,
      createdAt: now,
      deliveredAt: opts?.delivered ? now : null,
      ...(opts?.origin === 'agent' || isStudioOrigin(opts?.origin) ? { origin: opts?.origin } : {}),
      ...(opts?.textLocalized && opts?.locale ? { textLocalized: opts.textLocalized, locale: opts.locale } : {}),
    };
    const existing = this.creatorMessages.get(jobId) ?? [];
    existing.push(record);
    this.creatorMessages.set(jobId, existing);
    return { ...record };
  }

  async listPendingCreatorMessages(jobId: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    return (this.creatorMessages.get(jobId) ?? [])
      .filter((message) => !message.deliveredAt && !isStudioOrigin(message.origin))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, opts?.limit ?? 10)
      .map((message) => ({ ...message }));
  }

  async listCreatorMessages(jobId: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    // No id tie-break -- a stable sort keeps same-millisecond append order.
    return [...(this.creatorMessages.get(jobId) ?? [])]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-(opts?.limit ?? 20))
      .map((message) => ({ ...message }));
  }

  async markCreatorMessagesDelivered(jobId: number, ids: string[]): Promise<void> {
    const existing = this.creatorMessages.get(jobId);
    if (!existing || ids.length === 0) return;
    const at = new Date().toISOString();
    const targets = new Set(ids);
    this.creatorMessages.set(
      jobId,
      existing.map((message) =>
        targets.has(message.id) && !message.deliveredAt ? { ...message, deliveredAt: at } : message,
      ),
    );
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
    opts?: { origin?: CreatorMessageOrigin; delivered?: boolean; textLocalized?: string; locale?: string },
  ): Promise<CreatorMessage> {
    // Spread in only for agent/studio — Firestore rejects an explicit undefined.
    const now = new Date().toISOString();
    const record: CreatorMessage = {
      id: randomUUID(),
      text,
      createdAt: now,
      deliveredAt: opts?.delivered ? now : null,
      ...(opts?.origin === 'agent' || isStudioOrigin(opts?.origin) ? { origin: opts?.origin } : {}),
      ...(opts?.textLocalized && opts?.locale ? { textLocalized: opts.textLocalized, locale: opts.locale } : {}),
    };
    await this.messagesCollection(jobId).doc(record.id).set(record);
    return record;
  }

  async listPendingCreatorMessages(jobId: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    // Filtered/sorted here, not by index -- the set is tiny.
    const snap = await this.messagesCollection(jobId).where('deliveredAt', '==', null).get();
    return snap.docs
      .map((doc) => doc.data() as CreatorMessage)
      .filter((message) => !isStudioOrigin(message.origin))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, opts?.limit ?? 10);
  }

  async listCreatorMessages(jobId: number, opts?: { limit?: number }): Promise<CreatorMessage[]> {
    // Slices the newest `limit` off an oldest-first sort, matching InMemory.
    const snap = await this.messagesCollection(jobId).get();
    return snap.docs
      .map((doc) => doc.data() as CreatorMessage)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(-(opts?.limit ?? 20));
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
  }
}
