import { randomUUID } from 'node:crypto';
import { RestBigQueryClient, telemetryBackend, type BigQueryClient, type QueryParam } from './telemetry-bigquery.js';

// Per-account landmark journal; opt-in, BigQuery only, never joined to telemetry.

export const DISCOVERY_TABLE = 'player_discoveries';

export type DiscoveryRowKind = 'found' | 'play';

export interface DiscoveryRow {
  // yyyy-mm-dd of `at`; the partition column.
  day: string;
  rowId: string;
  at: string;
  uid: string;
  slug: string;
  // Per-open id minted by the shell for the journal only.
  journalId: string;
  kind: DiscoveryRowKind;
  // Set on found rows.
  label?: string;
  // Set on play rows: focused seconds since the previous flush.
  seconds?: number;
  // Milliseconds after the open.
  msSinceOpen?: number;
}

// Operator switch on the account (null turns it off), plus the rows.
export interface DiscoveryJournalStore extends DiscoveryRowsStore {
  setDiscoveryJournal(uid: string, since: string | null): Promise<void>;
}

export interface DiscoveryRowsStore {
  appendDiscoveryRows(rows: Omit<DiscoveryRow, 'rowId' | 'day'>[]): Promise<void>;
  // One account's rows, optionally one game, oldest first.
  listDiscoveryRows(uid: string, opts?: { slug?: string; limit?: number }): Promise<DiscoveryRow[]>;
  // Erase path; returns how many rows went.
  deleteDiscoveryRows(uid: string): Promise<number>;
}

function withIds(rows: Omit<DiscoveryRow, 'rowId' | 'day'>[]): DiscoveryRow[] {
  return rows.map((row) => ({ ...row, day: row.at.slice(0, 10), rowId: randomUUID() }));
}

const DEFAULT_LIST_LIMIT = 20_000;

export class InMemoryDiscoveryJournalStore implements DiscoveryRowsStore {
  rows: DiscoveryRow[] = [];

  async appendDiscoveryRows(rows: Omit<DiscoveryRow, 'rowId' | 'day'>[]): Promise<void> {
    this.rows.push(...withIds(rows));
  }

  async listDiscoveryRows(uid: string, opts?: { slug?: string; limit?: number }): Promise<DiscoveryRow[]> {
    return this.rows
      .filter((row) => row.uid === uid && (opts?.slug === undefined || row.slug === opts.slug))
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(0, opts?.limit ?? DEFAULT_LIST_LIMIT)
      .map((row) => ({ ...row }));
  }

  async deleteDiscoveryRows(uid: string): Promise<number> {
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => row.uid !== uid);
    return before - this.rows.length;
  }
}

function toBigQueryRow(row: DiscoveryRow): Record<string, unknown> {
  return {
    day: row.day,
    row_id: row.rowId,
    at: row.at,
    uid: row.uid,
    slug: row.slug,
    journal_id: row.journalId,
    kind: row.kind,
    label: row.label ?? null,
    seconds: row.seconds ?? null,
    ms_since_open: row.msSinceOpen ?? null,
  };
}

function fromBigQueryRow(raw: Record<string, unknown>): DiscoveryRow {
  const num = (value: unknown) => (value === null || value === undefined ? undefined : Number(value));
  return {
    day: String(raw.day),
    rowId: String(raw.row_id),
    at: String(raw.at),
    uid: String(raw.uid),
    slug: String(raw.slug),
    journalId: String(raw.journal_id),
    kind: raw.kind === 'play' ? 'play' : 'found',
    ...(typeof raw.label === 'string' ? { label: raw.label } : {}),
    ...(num(raw.seconds) === undefined ? {} : { seconds: num(raw.seconds) }),
    ...(num(raw.ms_since_open) === undefined ? {} : { msSinceOpen: num(raw.ms_since_open) }),
  };
}

const INSERT_CHUNK = 500;

// Table from the ops setup script; buffered rows resist DELETE.
export class BigQueryDiscoveryJournalStore implements DiscoveryRowsStore {
  constructor(private client: BigQueryClient) {}

  async appendDiscoveryRows(rows: Omit<DiscoveryRow, 'rowId' | 'day'>[]): Promise<void> {
    const full = withIds(rows);
    for (let start = 0; start < full.length; start += INSERT_CHUNK) {
      await this.client.insertRows(
        DISCOVERY_TABLE,
        full.slice(start, start + INSERT_CHUNK).map((row) => ({ insertId: row.rowId, json: toBigQueryRow(row) })),
      );
    }
  }

  async listDiscoveryRows(uid: string, opts?: { slug?: string; limit?: number }): Promise<DiscoveryRow[]> {
    const params: QueryParam[] = [
      { name: 'uid', type: 'STRING', value: uid },
      { name: 'limit', type: 'INT64', value: opts?.limit ?? DEFAULT_LIST_LIMIT },
    ];
    let where = 'uid = @uid';
    if (opts?.slug !== undefined) {
      where += ' AND slug = @slug';
      params.push({ name: 'slug', type: 'STRING', value: opts.slug });
    }
    const sql =
      'SELECT TO_JSON_STRING(STRUCT(CAST(day AS STRING) AS day, row_id, ' +
      'FORMAT_TIMESTAMP("%Y-%m-%dT%H:%M:%E3SZ", at) AS at, uid, slug, journal_id, kind, label, seconds, ms_since_open)) ' +
      `FROM ${DISCOVERY_TABLE} WHERE ${where} ORDER BY at LIMIT @limit`;
    const raw = await this.client.queryStrings(sql, params);
    return raw.map((line) => fromBigQueryRow(JSON.parse(line) as Record<string, unknown>));
  }

  async deleteDiscoveryRows(uid: string): Promise<number> {
    const before = await this.client.queryStrings(
      `SELECT CAST(COUNT(*) AS STRING) FROM ${DISCOVERY_TABLE} WHERE uid = @uid`,
      [{ name: 'uid', type: 'STRING', value: uid }],
    );
    const count = Number(before[0] ?? 0);
    if (count === 0) return 0;
    await this.client.queryStrings(`DELETE FROM ${DISCOVERY_TABLE} WHERE uid = @uid`, [
      { name: 'uid', type: 'STRING', value: uid },
    ]);
    return count;
  }
}

// Without the BigQuery telemetry dataset nothing is kept, and nothing is erased.
export class UnavailableDiscoveryJournalStore implements DiscoveryRowsStore {
  async appendDiscoveryRows(): Promise<void> {}
  async listDiscoveryRows(): Promise<DiscoveryRow[]> {
    return [];
  }
  async deleteDiscoveryRows(): Promise<number> {
    return 0;
  }
}

// BigQuery once the telemetry dataset exists (dual or bigquery); never Firestore.
export function discoveryJournalStoreFor(
  env: NodeJS.ProcessEnv = process.env,
  client?: BigQueryClient,
): DiscoveryRowsStore {
  if (telemetryBackend(env) === 'firestore') return new UnavailableDiscoveryJournalStore();
  const project = env.TELEMETRY_BQ_PROJECT?.trim() || env.GOOGLE_CLOUD_PROJECT?.trim() || 'gamedevpl';
  return new BigQueryDiscoveryJournalStore(client ?? new RestBigQueryClient(project));
}

// Erase path: counts on a dry run, deletes otherwise.
export async function eraseDiscoveryRows(store: DiscoveryRowsStore, uid: string, dryRun: boolean): Promise<number> {
  return dryRun ? (await store.listDiscoveryRows(uid)).length : store.deleteDiscoveryRows(uid);
}
