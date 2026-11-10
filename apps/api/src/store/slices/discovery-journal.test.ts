import { describe, expect, it } from 'vitest';
import { BigQueryDiscoveryJournalStore, DISCOVERY_TABLE, discoveryJournalStoreFor } from './discovery-journal.js';
import type { BigQueryClient, QueryParam } from './telemetry-bigquery.js';

function fakeClient(answers: string[][] = []) {
  const inserts: { table: string; rows: { insertId: string; json: Record<string, unknown> }[] }[] = [];
  const queries: { sql: string; params: QueryParam[] }[] = [];
  const client: BigQueryClient = {
    insertRows: async (table, rows) => void inserts.push({ table, rows }),
    queryStrings: async (sql, params) => {
      queries.push({ sql, params });
      return answers.shift() ?? [];
    },
  };
  return { client, inserts, queries };
}

describe('BigQueryDiscoveryJournalStore', () => {
  it('appends flat rows keyed by their own id, partitioned by the day of `at`', async () => {
    const { client, inserts } = fakeClient();
    await new BigQueryDiscoveryJournalStore(client).appendDiscoveryRows([
      { at: '2026-11-10T23:59:00.000Z', uid: 'g:kid', slug: 'cozycraft', journalId: 'j', kind: 'found', label: 'a' },
    ]);
    expect(inserts[0]?.table).toBe(DISCOVERY_TABLE);
    const row = inserts[0]!.rows[0]!;
    expect(row.json).toMatchObject({ day: '2026-11-10', uid: 'g:kid', kind: 'found', label: 'a', seconds: null });
    expect(row.json.row_id).toBe(row.insertId);
  });

  it('reads one account back through parameters only', async () => {
    const line = JSON.stringify({
      day: '2026-11-10',
      row_id: 'r',
      at: '2026-11-10T10:00:00.000Z',
      uid: 'g:kid',
      slug: 'cozycraft',
      journal_id: 'j',
      kind: 'play',
      label: null,
      seconds: '15',
      ms_since_open: '1000',
    });
    const { client, queries } = fakeClient([[line]]);
    const rows = await new BigQueryDiscoveryJournalStore(client).listDiscoveryRows('g:kid', { slug: 'cozycraft' });
    expect(rows).toEqual([
      {
        day: '2026-11-10',
        rowId: 'r',
        at: '2026-11-10T10:00:00.000Z',
        uid: 'g:kid',
        slug: 'cozycraft',
        journalId: 'j',
        kind: 'play',
        seconds: 15,
        msSinceOpen: 1000,
      },
    ]);
    expect(queries[0]?.sql).not.toContain('g:kid');
    expect(queries[0]?.params.map((param) => param.name)).toEqual(['uid', 'limit', 'slug']);
  });

  it('deletes only when there is something to delete', async () => {
    const empty = fakeClient([['0']]);
    expect(await new BigQueryDiscoveryJournalStore(empty.client).deleteDiscoveryRows('g:kid')).toBe(0);
    expect(empty.queries).toHaveLength(1);
    const some = fakeClient([['3'], []]);
    expect(await new BigQueryDiscoveryJournalStore(some.client).deleteDiscoveryRows('g:kid')).toBe(3);
    expect(some.queries[1]?.sql).toMatch(/^DELETE FROM player_discoveries WHERE uid = @uid$/);
  });
});

describe('discoveryJournalStoreFor', () => {
  it('keeps nothing until the BigQuery telemetry dataset is in use', async () => {
    const { client, inserts } = fakeClient();
    const off = discoveryJournalStoreFor({}, client);
    await off.appendDiscoveryRows([
      { at: '2026-11-10T10:00:00.000Z', uid: 'g:kid', slug: 'cozycraft', journalId: 'j', kind: 'found', label: 'a' },
    ]);
    expect(inserts).toHaveLength(0);
    expect(discoveryJournalStoreFor({ TELEMETRY_BACKEND: 'dual' }, client)).toBeInstanceOf(
      BigQueryDiscoveryJournalStore,
    );
    expect(discoveryJournalStoreFor({ TELEMETRY_BACKEND: 'bigquery' }, client)).toBeInstanceOf(
      BigQueryDiscoveryJournalStore,
    );
  });
});
