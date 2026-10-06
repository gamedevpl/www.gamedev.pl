import { randomUUID } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import type { TelemetryEvent, VisitEvent } from '../records/telemetry.js';
import type { DailyTelemetryAggregate } from '../../platform/telemetry-daily.js';
import type { FirestoreTelemetryStore, TelemetryStore, VisitListOptions } from './telemetry.js';

// Unset: Firestore. dual: both, read Firestore. bigquery: BigQuery only.
export type TelemetryBackend = 'firestore' | 'dual' | 'bigquery';

export function telemetryBackend(env: NodeJS.ProcessEnv = process.env): TelemetryBackend {
  const value = env.TELEMETRY_BACKEND?.trim().toLowerCase();
  return value === 'dual' || value === 'bigquery' ? value : 'firestore';
}

// Provisioned by infra/setup-telemetry-bigquery.sh; the names must match it.
export const TELEMETRY_DATASET = 'telemetry';
export const PLAY_EVENTS_TABLE = 'play_events';
export const VISIT_EVENTS_TABLE = 'visit_events';
// Beside Firestore (europe-central2), so the backfill never leaves the region.
export const TELEMETRY_BQ_LOCATION = 'europe-central2';

export type QueryParam = { name: string; type: 'STRING' | 'DATE' | 'INT64'; value: string | number | string[] };

export interface BigQueryClient {
  insertRows(table: string, rows: { insertId: string; json: Record<string, unknown> }[]): Promise<void>;
  // Queries select one JSON string column; rows are those strings.
  queryStrings(sql: string, params: QueryParam[]): Promise<string[]>;
}

const SCOPE = 'https://www.googleapis.com/auth/bigquery';
const API = 'https://bigquery.googleapis.com/bigquery/v2';

interface QueryResponse {
  jobComplete?: boolean;
  jobReference?: { jobId: string; location?: string };
  pageToken?: string;
  rows?: { f: { v: string | null }[] }[];
}

// Plain REST, so the API image needs no BigQuery SDK.
export class RestBigQueryClient implements BigQueryClient {
  private auth = new GoogleAuth({ scopes: [SCOPE] });

  constructor(
    private project: string,
    private dataset: string = TELEMETRY_DATASET,
    private location: string = TELEMETRY_BQ_LOCATION,
  ) {}

  async insertRows(table: string, rows: { insertId: string; json: Record<string, unknown> }[]): Promise<void> {
    if (rows.length === 0) return;
    const client = await this.auth.getClient();
    const url = `${API}/projects/${this.project}/datasets/${this.dataset}/tables/${table}/insertAll`;
    const res = await client.request<{ insertErrors?: unknown[] }>({
      url,
      method: 'POST',
      data: { rows, ignoreUnknownValues: true },
    });
    const errors = res.data.insertErrors ?? [];
    if (errors.length > 0) {
      throw new Error(`BigQuery rejected ${errors.length} of ${rows.length} rows: ${JSON.stringify(errors[0])}`);
    }
  }

  async queryStrings(sql: string, params: QueryParam[]): Promise<string[]> {
    const client = await this.auth.getClient();
    const first = await client.request<QueryResponse>({
      url: `${API}/projects/${this.project}/queries`,
      method: 'POST',
      data: {
        query: sql,
        useLegacySql: false,
        location: this.location,
        parameterMode: 'NAMED',
        queryParameters: params.map(toQueryParameter),
        defaultDataset: { projectId: this.project, datasetId: this.dataset },
        timeoutMs: 20_000,
      },
    });
    const jobId = first.data.jobReference?.jobId;
    const next = async (pageToken?: string) => {
      const query = new URLSearchParams({ location: this.location, timeoutMs: '20000' });
      if (pageToken) query.set('pageToken', pageToken);
      return (await client.request<QueryResponse>({ url: `${API}/projects/${this.project}/queries/${jobId}?${query}` }))
        .data;
    };
    let page = first.data;
    for (let polls = 0; page.jobComplete === false; polls += 1) {
      if (!jobId || polls >= 15) throw new Error(`BigQuery job ${jobId ?? '?'} did not finish`);
      page = await next();
    }
    const out: string[] = [];
    for (;;) {
      for (const row of page.rows ?? []) if (row.f[0]?.v != null) out.push(row.f[0].v);
      if (!page.pageToken || !jobId) return out;
      page = await next(page.pageToken);
    }
  }
}

function toQueryParameter(param: QueryParam) {
  if (Array.isArray(param.value)) {
    return {
      name: param.name,
      parameterType: { type: 'ARRAY', arrayType: { type: param.type } },
      parameterValue: { arrayValues: param.value.map((value) => ({ value })) },
    };
  }
  return { name: param.name, parameterType: { type: param.type }, parameterValue: { value: String(param.value) } };
}

// Whole event in `event`: new fields need no schema change.
export function playRow(dateStr: string, eventId: string, event: TelemetryEvent): Record<string, unknown> {
  return {
    day: dateStr,
    event_id: eventId,
    at: event.at,
    slug: event.slug,
    type: event.type,
    session_id: event.sessionId,
    reviewer: event.reviewer === true,
    agent_mode: event.agentMode === true,
    event: JSON.stringify(event),
  };
}

export function visitRow(dateStr: string, eventId: string, event: VisitEvent): Record<string, unknown> {
  return {
    day: dateStr,
    event_id: eventId,
    at: event.at,
    visit_id: event.visitId,
    type: event.type,
    reviewer: event.reviewer === true,
    event: JSON.stringify(event),
  };
}

// insertAll caps rows per call; flushes stay far below it.
const INSERT_CHUNK = 500;

export class BigQueryTelemetryEvents {
  constructor(private client: BigQueryClient) {}

  async appendPlay(dateStr: string, events: TelemetryEvent[], ids: string[]): Promise<void> {
    await this.insert(
      PLAY_EVENTS_TABLE,
      events.map((event, index) => ({ insertId: ids[index]!, json: playRow(dateStr, ids[index]!, event) })),
    );
  }

  async appendVisit(dateStr: string, events: VisitEvent[], ids: string[]): Promise<void> {
    await this.insert(
      VISIT_EVENTS_TABLE,
      events.map((event, index) => ({ insertId: ids[index]!, json: visitRow(dateStr, ids[index]!, event) })),
    );
  }

  private async insert(table: string, rows: { insertId: string; json: Record<string, unknown> }[]): Promise<void> {
    for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
      await this.client.insertRows(table, rows.slice(start, start + INSERT_CHUNK));
    }
  }

  async listPlay(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]> {
    const params: QueryParam[] = [
      { name: 'day', type: 'DATE', value: dateStr },
      { name: 'limit', type: 'INT64', value: opts?.limit ?? 1000 },
    ];
    let where = 'day = @day';
    if (opts?.slug !== undefined) {
      where += ' AND slug = @slug';
      params.push({ name: 'slug', type: 'STRING', value: opts.slug });
    }
    const sql = `SELECT TO_JSON_STRING(event) FROM ${PLAY_EVENTS_TABLE} WHERE ${where} LIMIT @limit`;
    return parseEvents<TelemetryEvent>(await this.client.queryStrings(sql, params));
  }

  // Many days and slugs in one query, not one per pair.
  async listPlayAcross(days: string[], opts: { slugs?: string[]; limit: number }): Promise<TelemetryEvent[]> {
    if (days.length === 0) return [];
    const params: QueryParam[] = [
      { name: 'days', type: 'DATE', value: days },
      ...dayBounds(days),
      { name: 'limit', type: 'INT64', value: opts.limit },
    ];
    let where = WINDOW;
    if (opts.slugs !== undefined) {
      if (opts.slugs.length === 0) return [];
      where += ' AND slug IN UNNEST(@slugs)';
      params.push({ name: 'slugs', type: 'STRING', value: opts.slugs });
    }
    const sql = `SELECT TO_JSON_STRING(event) FROM ${PLAY_EVENTS_TABLE} WHERE ${where} ORDER BY day DESC LIMIT @limit`;
    return parseEvents<TelemetryEvent>(await this.client.queryStrings(sql, params));
  }

  listVisit(dateStr: string, opts?: VisitListOptions): Promise<VisitEvent[]> {
    return this.listVisitAcross([dateStr], { ...opts, limit: opts?.limit ?? 1000 });
  }

  // The whole window at once, newest day first; the console reads this.
  async listVisitAcross(days: string[], opts: VisitListOptions & { limit: number }): Promise<VisitEvent[]> {
    if (days.length === 0) return [];
    const params: QueryParam[] = [
      { name: 'days', type: 'DATE', value: days },
      ...dayBounds(days),
      { name: 'limit', type: 'INT64', value: opts.limit },
    ];
    let where = WINDOW;
    if (opts.visitId !== undefined) {
      where += ' AND visit_id = @visitId';
      params.push({ name: 'visitId', type: 'STRING', value: opts.visitId });
    }
    if (opts.type !== undefined) {
      where += ' AND type = @type';
      params.push({ name: 'type', type: 'STRING', value: opts.type });
    }
    if (opts.excludeType !== undefined) {
      where += ' AND type != @excludeType';
      params.push({ name: 'excludeType', type: 'STRING', value: opts.excludeType });
    }
    const order = days.length > 1 ? ' ORDER BY day DESC' : '';
    const sql = `SELECT TO_JSON_STRING(event) FROM ${VISIT_EVENTS_TABLE} WHERE ${where}${order} LIMIT @limit`;
    return parseEvents<VisitEvent>(await this.client.queryStrings(sql, params));
  }
}

// A plain range up front, so the required partition filter prunes.
const WINDOW = 'day BETWEEN @first AND @last AND day IN UNNEST(@days)';

function dayBounds(days: string[]): QueryParam[] {
  const sorted = [...days].sort();
  return [
    { name: 'first', type: 'DATE', value: sorted[0]! },
    { name: 'last', type: 'DATE', value: sorted[sorted.length - 1]! },
  ];
}

// TO_JSON_STRING of a JSON column is the stored object, quoted once more.
function parseEvents<T>(rows: string[]): T[] {
  return rows.map((raw) => {
    const parsed: unknown = JSON.parse(raw);
    return (typeof parsed === 'string' ? JSON.parse(parsed) : parsed) as T;
  });
}

type Log = (message: string, error: unknown) => void;

// One id per event names both copies, so backfill can skip duplicates.
export class TieredTelemetryStore implements TelemetryStore {
  constructor(
    private firestore: FirestoreTelemetryStore,
    private bigquery: BigQueryTelemetryEvents,
    private backend: 'dual' | 'bigquery',
    private log: Log = (message, error) => console.error(message, error),
  ) {
    if (backend === 'bigquery') {
      this.listTelemetryEventsAcross = (days, opts) => this.bigquery.listPlayAcross(days, opts);
    }
  }

  listTelemetryEventsAcross?: (days: string[], opts: { slugs?: string[]; limit: number }) => Promise<TelemetryEvent[]>;

  async appendTelemetryEvents(dateStr: string, events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;
    const ids = events.map(() => randomUUID());
    if (this.backend === 'bigquery') return this.bigquery.appendPlay(dateStr, events, ids);
    await Promise.all([
      this.firestore.appendTelemetryEvents(dateStr, events, ids),
      // Firestore is the record during dual-write; backfill fills misses.
      this.bigquery.appendPlay(dateStr, events, ids).catch((error) => this.log('bigquery play append failed', error)),
    ]);
  }

  async appendVisitEvents(dateStr: string, events: VisitEvent[]): Promise<void> {
    if (events.length === 0) return;
    const ids = events.map(() => randomUUID());
    if (this.backend === 'bigquery') return this.bigquery.appendVisit(dateStr, events, ids);
    await Promise.all([
      this.firestore.appendVisitEvents(dateStr, events, ids),
      this.bigquery.appendVisit(dateStr, events, ids).catch((error) => this.log('bigquery visit append failed', error)),
    ]);
  }

  listTelemetryEvents(dateStr: string, opts?: { slug?: string; limit?: number }): Promise<TelemetryEvent[]> {
    return this.backend === 'bigquery'
      ? this.bigquery.listPlay(dateStr, opts)
      : this.firestore.listTelemetryEvents(dateStr, opts);
  }

  listVisitEvents(dateStr: string, opts?: VisitListOptions): Promise<VisitEvent[]> {
    return this.backend === 'bigquery'
      ? this.bigquery.listVisit(dateStr, opts)
      : this.firestore.listVisitEvents(dateStr, opts);
  }

  getTelemetryDaily(dateStr: string): Promise<DailyTelemetryAggregate | undefined> {
    return this.firestore.getTelemetryDaily(dateStr);
  }

  putTelemetryDaily(dateStr: string, aggregate: DailyTelemetryAggregate): Promise<void> {
    return this.firestore.putTelemetryDaily(dateStr, aggregate);
  }
}

export function telemetryStoreFor(
  firestore: FirestoreTelemetryStore,
  env: NodeJS.ProcessEnv = process.env,
  client?: BigQueryClient,
): TelemetryStore {
  const backend = telemetryBackend(env);
  if (backend === 'firestore') return firestore;
  const project = env.TELEMETRY_BQ_PROJECT?.trim() || env.GOOGLE_CLOUD_PROJECT?.trim() || 'gamedevpl';
  return new TieredTelemetryStore(
    firestore,
    new BigQueryTelemetryEvents(client ?? new RestBigQueryClient(project)),
    backend,
  );
}
