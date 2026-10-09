import { randomUUID } from 'node:crypto';
import type { CollectionReference, DocumentData, Firestore, Query } from '@google-cloud/firestore';
import {
  TELEMETRY_COLLECTION,
  TELEMETRY_TTL_FIELD,
  telemetryExpiresAt,
  VISIT_COLLECTION,
  type TelemetryEvent,
  type VisitEvent,
} from '../records/telemetry.js';
import type { DailyTelemetryAggregate } from '../../platform/telemetry-daily.js';

type VisitType = VisitEvent['type'];
export type VisitListOptions = { visitId?: string; limit?: number; type?: VisitType; excludeType?: VisitType };

export interface TelemetryStore {
  // Date-partitioned so a TTL policy expires a whole day at once.
  appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void>;

  // One day's events for a game -- IL-2's aggregation read.
  listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]>;

  // Appends visit-level events to one day's partition.
  appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void>;

  // One day's play rolled up, or undefined when unswept.
  getTelemetryDaily(dateStr: string): Promise<DailyTelemetryAggregate | undefined>;

  // Overwrites the day's rollup. Sealed days are written once.
  putTelemetryDaily(dateStr: string, aggregate: DailyTelemetryAggregate): Promise<void>;

  // Many days in one query; only BigQuery-backed stores offer it.
  listTelemetryEventsAcross?(days: string[], opts: { slugs?: string[]; limit: number }): Promise<TelemetryEvent[]>;

  // One day's visit events -- funnel, depth, and acquisition reads.
  listVisitEvents(dateStr: string, opts?: VisitListOptions): Promise<VisitEvent[]>;
}

// One document per day, holding every game played.
const DAILY_COLLECTION = 'telemetryDaily';

export class InMemoryTelemetryStore implements TelemetryStore {
  // yyyymmdd -> events recorded that day
  private telemetry = new Map<string, TelemetryEvent[]>();
  // yyyymmdd -> visit events recorded that day
  private visits = new Map<string, VisitEvent[]>();
  // yyyymmdd -> that day's rollup
  private daily = new Map<string, DailyTelemetryAggregate>();

  async getTelemetryDaily(dateStr: string): Promise<DailyTelemetryAggregate | undefined> {
    const stored = this.daily.get(dateStr);
    return stored ? structuredClone(stored) : undefined;
  }

  async putTelemetryDaily(dateStr: string, aggregate: DailyTelemetryAggregate): Promise<void> {
    this.daily.set(dateStr, structuredClone(aggregate));
  }

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

  async listVisitEvents(dateStr: string, opts?: VisitListOptions): Promise<VisitEvent[]> {
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

  // Its own collection, so a day's TTL sweep spares it.
  private dailyDoc(dateStr: string) {
    return this.db.collection(DAILY_COLLECTION).doc(dateStr);
  }

  async getTelemetryDaily(dateStr: string): Promise<DailyTelemetryAggregate | undefined> {
    const snap = await this.dailyDoc(dateStr).get();
    return snap.exists ? (snap.data() as DailyTelemetryAggregate) : undefined;
  }

  async putTelemetryDaily(dateStr: string, aggregate: DailyTelemetryAggregate): Promise<void> {
    await this.dailyDoc(dateStr).set(aggregate);
  }

  // `ids` lets a BigQuery copy share the document's id.
  async appendVisitEvents(dateStr: string, events: VisitEvent[], ids?: string[]): Promise<void> {
    await this.append(this.visitCollection(dateStr), events, ids);
  }

  // One batch per flush; well inside Firestore's 500-write batch limit.
  private async append(collection: CollectionReference, events: (VisitEvent | TelemetryEvent)[], ids?: string[]) {
    if (events.length === 0) return;
    const batch = this.db.batch();
    events.forEach((event, index) =>
      // A Date, not a string -- TTL only expires a real Timestamp.
      batch.set(collection.doc(ids?.[index] ?? randomUUID()), {
        ...event,
        [TELEMETRY_TTL_FIELD]: telemetryExpiresAt(event.at),
      }),
    );
    await batch.commit();
  }

  async listVisitEvents(dateStr: string, opts?: VisitListOptions): Promise<VisitEvent[]> {
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

  async appendTelemetryEvents(dateStr: string, events: TelemetryEvent[], ids?: string[]): Promise<void> {
    await this.append(this.telemetryCollection(dateStr), events, ids);
  }

  async listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]> {
    // Equality-only filter plus a limit, so no composite index is needed.
    const base = this.telemetryCollection(dateStr);
    const query = opts?.slug === undefined ? base : base.where('slug', '==', opts.slug);
    const snap = await query.limit(opts?.limit ?? 1000).get();
    return snap.docs.map((doc) => {
      // Retention plumbing stays out of the domain object handed to callers.
      const event = doc.data();
      delete event[TELEMETRY_TTL_FIELD];
      return event as TelemetryEvent;
    });
  }
}
