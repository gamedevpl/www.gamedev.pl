import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fakeFirestore } from '../fake-firestore.js';
import { FirestoreTelemetryStore } from './telemetry.js';
import {
  BigQueryTelemetryEvents,
  telemetryBackend,
  telemetryStoreFor,
  TieredTelemetryStore,
  type BigQueryClient,
  type QueryParam,
} from './telemetry-bigquery.js';
import type { TelemetryEvent, VisitEvent } from '../records/telemetry.js';
import type { Store } from '../../platform/store.js';
import { scanOwnedSlugs } from '../../creation/studio-health-scan.js';

class FakeBigQuery implements BigQueryClient {
  inserts: { table: string; rows: { insertId: string; json: Record<string, unknown> }[] }[] = [];
  queries: { sql: string; params: QueryParam[] }[] = [];
  results: string[] = [];
  failInsert = false;

  async insertRows(table: string, rows: { insertId: string; json: Record<string, unknown> }[]) {
    if (this.failInsert) throw new Error('bq down');
    this.inserts.push({ table, rows });
  }

  async queryStrings(sql: string, params: QueryParam[]) {
    this.queries.push({ sql, params });
    return this.results;
  }
}

const play: TelemetryEvent = {
  slug: 'space-hop',
  sessionId: 's1',
  type: 'game_opened',
  at: '2026-10-06T10:00:00.000Z',
};
const visit: VisitEvent = { visitId: 'v1', type: 'visit_started', at: '2026-10-06T10:00:00.000Z', msSinceStart: 0 };

describe('telemetryBackend', () => {
  it('defaults to firestore and accepts only the two known modes', () => {
    expect(telemetryBackend({})).toBe('firestore');
    expect(telemetryBackend({ TELEMETRY_BACKEND: 'DUAL' })).toBe('dual');
    expect(telemetryBackend({ TELEMETRY_BACKEND: 'bigquery' })).toBe('bigquery');
    expect(telemetryBackend({ TELEMETRY_BACKEND: 'bq' })).toBe('firestore');
  });

  it('leaves the plain Firestore store in place when unset', () => {
    const firestore = new FirestoreTelemetryStore(fakeFirestore().db);
    expect(telemetryStoreFor(firestore, {})).toBe(firestore);
  });
});

describe('TieredTelemetryStore', () => {
  it('dual-writes both copies under one id and keeps reading Firestore', async () => {
    const db = fakeFirestore().db;
    const bq = new FakeBigQuery();
    const store = new TieredTelemetryStore(new FirestoreTelemetryStore(db), new BigQueryTelemetryEvents(bq), 'dual');

    await store.appendTelemetryEvents('2026-10-06', [play]);
    await store.appendVisitEvents('2026-10-06', [visit]);

    const [playInsert, visitInsert] = bq.inserts;
    expect(playInsert!.table).toBe('play_events');
    expect(visitInsert!.table).toBe('visit_events');
    const row = playInsert!.rows[0]!;
    expect(row.json).toMatchObject({ day: '2026-10-06', slug: 'space-hop', type: 'game_opened', reviewer: false });
    expect(JSON.parse(row.json.event as string)).toEqual(play);

    const docs = await db.collection('telemetry').doc('2026-10-06').collection('playEvents').get();
    expect(docs.docs.map((doc) => doc.id)).toEqual([row.insertId]);

    expect(await store.listTelemetryEvents('2026-10-06')).toEqual([play]);
    expect(bq.queries).toHaveLength(0);
    expect(store.listTelemetryEventsAcross).toBeUndefined();
  });

  it('swallows a BigQuery failure while Firestore is still the record', async () => {
    const bq = new FakeBigQuery();
    bq.failInsert = true;
    const log = vi.fn();
    const firestore = new FirestoreTelemetryStore(fakeFirestore().db);
    const store = new TieredTelemetryStore(firestore, new BigQueryTelemetryEvents(bq), 'dual', log);

    await store.appendTelemetryEvents('2026-10-06', [play]);

    expect(log).toHaveBeenCalledOnce();
    expect(await firestore.listTelemetryEvents('2026-10-06')).toHaveLength(1);
  });

  it('writes and reads only BigQuery in bigquery mode', async () => {
    const db = fakeFirestore().db;
    const bq = new FakeBigQuery();
    const store = new TieredTelemetryStore(
      new FirestoreTelemetryStore(db),
      new BigQueryTelemetryEvents(bq),
      'bigquery',
    );

    await store.appendTelemetryEvents('2026-10-06', [play]);
    const docs = await db.collection('telemetry').doc('2026-10-06').collection('playEvents').get();
    expect(docs.docs).toHaveLength(0);

    bq.results = [JSON.stringify(play)];
    expect(await store.listTelemetryEvents('2026-10-06', { slug: 'space-hop', limit: 5 })).toEqual([play]);
    expect(bq.queries[0]!.sql).toContain('slug = @slug');
    expect(bq.queries[0]!.params).toContainEqual({ name: 'limit', type: 'INT64', value: 5 });
  });

  it('answers a many-day, many-slug window in one query', async () => {
    const bq = new FakeBigQuery();
    bq.results = [JSON.stringify(JSON.stringify(play))];
    const store = new TieredTelemetryStore(
      new FirestoreTelemetryStore(fakeFirestore().db),
      new BigQueryTelemetryEvents(bq),
      'bigquery',
    );

    const events = await store.listTelemetryEventsAcross!(['2026-10-06', '2026-10-05'], {
      slugs: ['space-hop', 'arena-tag'],
      limit: 5000,
    });

    expect(events).toEqual([play]);
    expect(bq.queries).toHaveLength(1);
    expect(bq.queries[0]!.params).toContainEqual({ name: 'slugs', type: 'STRING', value: ['space-hop', 'arena-tag'] });
  });

  it('filters visit reads the way the Firestore query did', async () => {
    const bq = new FakeBigQuery();
    const events = new BigQueryTelemetryEvents(bq);
    await events.listVisit('2026-10-06', { excludeType: 'code_completion', limit: 1000 });
    expect(bq.queries[0]!.sql).toContain('type != @excludeType');
  });
});

describe('the TELEMETRY_BACKEND lever', () => {
  const workflow = readFileSync(new URL('../../../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../../../../../infra/deploy-api.sh', import.meta.url), 'utf8');

  it('is threaded by both deploy paths, so neither drops what the other set', () => {
    expect(workflow).toContain('TELEMETRY_BACKEND: ${{ vars.TELEMETRY_BACKEND }}');
    expect(workflow).toContain('ENV_VARS="${ENV_VARS}|TELEMETRY_BACKEND=${TELEMETRY_BACKEND_VAL}"');
    expect(script).toMatch(/for FLAG_VAR in [^;]*\bTELEMETRY_BACKEND\b/);
  });
});

describe('Studio health on BigQuery', () => {
  it('reads the whole window in one call instead of a query per day and slug', async () => {
    const across = vi.fn(async () => [play]);
    const perDay = vi.fn();
    const store = { listTelemetryEventsAcross: across, listTelemetryEvents: perDay } as unknown as Store;

    const result = await scanOwnedSlugs(store, ['space-hop', 'arena-tag'], ['2026-10-06', '2026-10-05']);

    expect(result).toEqual({ events: [play], scanned: ['2026-10-06', '2026-10-05'], truncated: false });
    expect(across).toHaveBeenCalledWith(['2026-10-06', '2026-10-05'], {
      slugs: ['space-hop', 'arena-tag'],
      limit: 5000,
    });
    expect(perDay).not.toHaveBeenCalled();
  });
});
