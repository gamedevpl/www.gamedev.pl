import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';
import type { PublishedSlugGate } from '../catalog/published-slugs.js';
import { erasePlayerSignals } from '../platform/erase-player-signals.js';

const sessionSecret = 'dev-session-secret-change-me';
const JOURNAL = '6f1c1e0e-8a39-4b47-9f43-2f7e6f2a9a11';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function slugGate(published: string[]): PublishedSlugGate {
  const slugs = new Set(published);
  return { isPublished: async (slug: string) => slugs.has(slug) };
}

async function appWith(store: InMemoryStore) {
  return buildApp({ store, sessionSecret, discoveryRoutes: { publishedSlugs: slugGate(['cozycraft']) } });
}

function flush(found: string[], extra: Record<string, unknown> = {}) {
  return {
    slug: 'cozycraft',
    journalId: JOURNAL,
    flushMsSinceOpen: 60_000,
    found: found.map((label, index) => ({ label, msSinceOpen: 10_000 + index })),
    ...extra,
  };
}

describe('discovery journal route', () => {
  let store: InMemoryStore;
  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:kid' });
    await store.upsertUser({ uid: 'g:other' });
    await store.upsertUser({ uid: 'bot:e2e' });
    await store.setDiscoveryJournal('g:kid', '2026-11-10T10:00:00.000Z');
    await store.setDiscoveryJournal('bot:e2e', '2026-11-10T10:00:00.000Z');
  });

  it('records first sightings and play seconds for an account that has it on', async () => {
    const app = await appWith(store);
    const response = await app.inject({
      method: 'POST',
      url: '/api/discovery-journal',
      headers: authHeaders('g:kid'),
      payload: flush(['first-combo', 'secret-owl'], { playSeconds: 45 }),
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 3 });

    const rows = await store.listDiscoveryRows('g:kid', { slug: 'cozycraft' });
    expect(rows.filter((row) => row.kind === 'found').map((row) => row.label)).toEqual(['first-combo', 'secret-owl']);
    expect(rows.find((row) => row.kind === 'play')?.seconds).toBe(45);
    // Back-dated within the flush, never ahead of it.
    for (const row of rows) expect(row.day).toBe(row.at.slice(0, 10));
    await app.close();
  });

  it('keeps nothing for signed-out play, accounts without the switch, or bots', async () => {
    const app = await appWith(store);
    for (const headers of [{}, authHeaders('g:other'), authHeaders('bot:e2e')]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/discovery-journal',
        headers,
        payload: flush(['first-combo']),
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ accepted: 0 });
    }
    expect(await store.listDiscoveryRows('g:other')).toEqual([]);
    expect(await store.listDiscoveryRows('bot:e2e')).toEqual([]);
    await app.close();
  });

  it('refuses unpublished games and does not record a label twice in one open', async () => {
    const app = await appWith(store);
    const draft = await app.inject({
      method: 'POST',
      url: '/api/discovery-journal',
      headers: authHeaders('g:kid'),
      payload: { ...flush(['first-combo']), slug: 'some-draft' },
    });
    expect(draft.json()).toEqual({ accepted: 0 });

    for (let i = 0; i < 2; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/discovery-journal',
        headers: authHeaders('g:kid'),
        payload: flush(['first-combo', 'first-combo']),
      });
    }
    expect(await store.listDiscoveryRows('g:kid')).toHaveLength(1);
    await app.close();
  });

  it('clamps game-authored labels', async () => {
    const app = await appWith(store);
    await app.inject({
      method: 'POST',
      url: '/api/discovery-journal',
      headers: authHeaders('g:kid'),
      payload: flush(['x'.repeat(120)]),
    });
    const rows = await store.listDiscoveryRows('g:kid');
    expect(rows[0]?.label).toHaveLength(40);
    await app.close();
  });

  it('lists the accounts that have the switch on', async () => {
    const uids = async () => (await store.listDiscoveryJournalAccounts()).map((user) => user.uid).sort();
    expect(await uids()).toEqual(['bot:e2e', 'g:kid']);
    await store.setDiscoveryJournal('g:kid', null);
    expect(await uids()).toEqual(['bot:e2e']);
  });

  it('turns off when the operator clears the switch', async () => {
    await store.setDiscoveryJournal('g:kid', null);
    const app = await appWith(store);
    const response = await app.inject({
      method: 'POST',
      url: '/api/discovery-journal',
      headers: authHeaders('g:kid'),
      payload: flush(['first-combo']),
    });
    expect(response.json()).toEqual({ accepted: 0 });
    await app.close();
  });

  it('is erased with the rest of a player signals', async () => {
    await store.appendDiscoveryRows([
      {
        at: '2026-11-10T10:00:00.000Z',
        uid: 'g:kid',
        slug: 'cozycraft',
        journalId: JOURNAL,
        kind: 'found',
        label: 'a',
      },
    ]);
    const dry = await erasePlayerSignals({ store, uid: 'g:kid', dryRun: true });
    expect(dry.discovery).toEqual({ deleted: 1, pending: 0 });
    expect(await store.listDiscoveryRows('g:kid')).toHaveLength(1);
    const real = await erasePlayerSignals({ store, uid: 'g:kid' });
    expect(real.discovery).toEqual({ deleted: 1, pending: 0 });
    expect((await store.getUser('g:kid'))?.discoveryJournalSince).toBeNull();
    expect(await store.listDiscoveryRows('g:kid')).toEqual([]);
  });

  it('defers rows BigQuery still holds in its streaming buffer instead of aborting the erase', async () => {
    await store.appendDiscoveryRows([
      {
        at: '2026-11-10T10:00:00.000Z',
        uid: 'g:kid',
        slug: 'cozycraft',
        journalId: JOURNAL,
        kind: 'found',
        label: 'a',
      },
    ]);
    store.deleteDiscoveryRows = async () => {
      throw new Error('UPDATE or DELETE statement over table would affect rows in the streaming buffer');
    };
    const result = await erasePlayerSignals({ store, uid: 'g:kid' });
    expect(result.discovery).toEqual({ deleted: 0, pending: 1 });
    expect((await store.getUser('g:kid'))?.discoveryJournalSince).toBeNull();
  });
});
