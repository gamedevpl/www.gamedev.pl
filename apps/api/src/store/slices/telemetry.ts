import { randomUUID } from 'node:crypto';
import type { DocumentData, Firestore, Query } from '@google-cloud/firestore';
import {
  TELEMETRY_COLLECTION,
  TELEMETRY_TTL_FIELD,
  telemetryExpiresAt,
  VISIT_COLLECTION,
  type TelemetryEvent,
  type VisitEvent,
} from '../records/telemetry.js';

export interface TelemetryStore {
  /**
   * Appends validated play-session events. Date-partitioned so a TTL policy can
   * expire a whole day at once and the aggregation job reads one partition rather
   * than fanning out across every submission.
   */
  appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void>;

  /** One day's events for a game — the read the aggregation job (IL-2) will use. */
  listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]>;

  /** Appends visit-level events to one day's partition. */
  appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void>;

  /** One day's visit events — funnel, depth, and acquisition reads. */
  listVisitEvents(
    dateStr: string,
    opts?: { visitId?: string; limit?: number; type?: VisitEvent['type']; excludeType?: VisitEvent['type'] },
  ): Promise<VisitEvent[]>;
}

export class InMemoryTelemetryStore implements TelemetryStore {
  // yyyymmdd -> events recorded that day
  private telemetry = new Map<string, TelemetryEvent[]>();
  // yyyymmdd -> visit events recorded that day
  private visits = new Map<string, VisitEvent[]>();

  async appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void> {
    const existing = this.telemetry.get(dateStr) ?? [];
    existing.push(...events.map((event) => ({ ...event })));
    this.telemetry.set(dateStr, existing);
  }

  async listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]> {
    return (this.telemetry.get(dateStr) ?? [])
      .filter((event) => opts?.slug === undefined || event.slug === opts.slug)
      .slice(0, opts?.limit ?? 1000)
      .map((event) => ({ ...event }));
  }

  async appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void> {
    const existing = this.visits.get(dateStr) ?? [];
    existing.push(...events.map((event) => ({ ...event })));
    this.visits.set(dateStr, existing);
  }

  async listVisitEvents(
    dateStr: string,
    opts?: { visitId?: string; limit?: number; type?: VisitEvent['type']; excludeType?: VisitEvent['type'] },
  ): Promise<VisitEvent[]> {
    return (this.visits.get(dateStr) ?? [])
      .filter((event) => opts?.visitId === undefined || event.visitId === opts.visitId)
      .filter((event) => opts?.type === undefined || event.type === opts.type)
      .filter((event) => opts?.excludeType === undefined || event.type !== opts.excludeType)
      .slice(0, opts?.limit ?? 1000)
      .map((event) => ({ ...event }));
  }
}

export class FirestoreTelemetryStore implements TelemetryStore {
  constructor(private db: Firestore) {}

  private telemetryCollection(dateStr: string) {
    return this.db.collection('telemetry').doc(dateStr).collection(TELEMETRY_COLLECTION);
  }

  private visitCollection(dateStr: string) {
    return this.db.collection('telemetry').doc(dateStr).collection(VISIT_COLLECTION);
  }

  async appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void> {
    if (events.length === 0) return;
    const collection = this.visitCollection(dateStr);
    const batch = this.db.batch();
    events.forEach((event) =>
      batch.set(collection.doc(randomUUID()), { ...event, [TELEMETRY_TTL_FIELD]: telemetryExpiresAt(event.at) }),
    );
    await batch.commit();
  }

  async listVisitEvents(
    dateStr: string,
    opts?: { visitId?: string; limit?: number; type?: VisitEvent['type']; excludeType?: VisitEvent['type'] },
  ): Promise<VisitEvent[]> {
    const base = this.visitCollection(dateStr);
    let query: Query<DocumentData> = base;
    if (opts?.visitId !== undefined) query = query.where('visitId', '==', opts.visitId);
    if (opts?.type !== undefined) query = query.where('type', '==', opts.type);
    if (opts?.excludeType !== undefined) query = query.where('type', '!=', opts.excludeType);
    const snap = await query.limit(opts?.limit ?? 1000).get();
    return snap.docs.map((doc) => {
      const event = doc.data();
      delete event[TELEMETRY_TTL_FIELD];
      return event as VisitEvent;
    });
  }

  async appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;
    // One batch per flush: a play session sends a handful of events at a time, well
    // inside Firestore's 500-write batch limit (the route caps a request long before).
    const collection = this.telemetryCollection(dateStr);
    const batch = this.db.batch();
    events.forEach((event) =>
      // `expiresAt` is written as a Date so the driver stores a real Timestamp: a TTL
      // policy ignores a field of any other type, which would leave the row forever.
      batch.set(collection.doc(randomUUID()), { ...event, [TELEMETRY_TTL_FIELD]: telemetryExpiresAt(event.at) }),
    );
    await batch.commit();
  }

  async listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]> {
    // Equality-only filter plus a limit, so no composite index is needed.
    const base = this.telemetryCollection(dateStr);
    const query = opts?.slug === undefined ? base : base.where('slug', '==', opts.slug);
    const snap = await query.limit(opts?.limit ?? 1000).get();
    return snap.docs.map((doc) => {
      // Retention plumbing stays out of the domain object, so a reader cannot mistake
      // it for signal and the privacy field-allowlist stays exactly the event's fields.
      // `data()` hands back a fresh object per call, so dropping the field is local.
      const event = doc.data();
      delete event[TELEMETRY_TTL_FIELD];
      return event as TelemetryEvent;
    });
  }
}
