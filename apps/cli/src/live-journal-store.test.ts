import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createJournalStore } from './live-journal-store.js';
import { journalArguments, type JournalEntry } from './live-journal-protocol.js';

const stores: ReturnType<typeof createJournalStore>[] = [];
afterEach(() => stores.splice(0).forEach((store) => store.close()));
function fixture(maxBytes?: number) {
  const store = createJournalStore(maxBytes);
  stores.push(store);
  const source = { tabId: randomUUID(), sourceId: 1, revision: 'build-one' };
  const recordingId = randomUUID();
  const entry = (seq: number, kind: JournalEntry['kind'] = 'state'): JournalEntry => ({
    seq,
    timeMs: seq * 10,
    frame: seq,
    kind,
    data: { metadata: { x: seq, life: seq < 3 ? 5 : 4 }, heldKeys: ['ArrowRight'] },
  });
  const batch = (entries: JournalEntry[]) => ({ type: 'live:journal' as const, recordingId, startedAt: 1234, entries });
  const append = (entries: JournalEntry[]) => store.append(source, batch(entries));
  return { store, source, recordingId, entry, batch, append };
}

it('retains immutable state on disk and pages a stable snapshot while recording continues', () => {
  const { store, recordingId, append, entry } = fixture();
  const first = entry(1);
  append([first, entry(2)]);
  (first.data as { metadata: { x: number } }).metadata.x = 999;
  const page = store.read({ recordingId, limit: 1 });
  expect(page.entries[0]?.data).toMatchObject({ metadata: { x: 1 } });
  expect(page.through).toBe(2);
  append([entry(3)]);
  const next = store.read({ recordingId, after: page.nextAfter!, through: page.through });
  expect(next.entries.map((e) => e.seq)).toEqual([2]);
  expect(next.nextAfter).toBeNull();
  expect(store.read({ recordingId }).entries.map((e) => e.seq)).toEqual([1, 2, 3]);
  expect(store.status().bytes).toBeGreaterThan(0);
});

it('searches full values before projection, samples states and reports unavailable fields', () => {
  const { store, recordingId, append, entry } = fixture();
  append([entry(1), entry(2, 'input'), entry(3), entry(4), entry(5)]);
  const query = {
    recordingId,
    fromFrame: 3,
    everyFrames: 2,
    fields: ['/metadata/x', '/missing'],
    where: { path: '/metadata/life', op: 'lt' as const, value: 5 },
  };
  const result = store.read(query);
  expect(result.entries.map((e) => e.seq)).toEqual([3, 5]);
  expect(result.entries[0]).toMatchObject({
    data: { '/metadata/x': 3, '/missing': null },
    missingFields: ['/missing'],
  });
  expect(store.read({ recordingId, kinds: ['input'], fromTimeMs: 15, toTimeMs: 25 }).entries.map((e) => e.seq)).toEqual(
    [2],
  );
  expect(store.read({ recordingId, after: 3, through: 4 }).entries.map((e) => e.seq)).toEqual([4]);
  expect(store.read({ recordingId, where: { path: '/toString', op: 'ne', value: null } }).entries).toEqual([]);
});

it('deduplicates acknowledgements, rejects identity changes and exposes sequence gaps', () => {
  const { store, source, recordingId, append, batch, entry } = fixture();
  append([entry(1), entry(3)]);
  append([entry(1), entry(3)]);
  expect(store.status().recordings[0]).toMatchObject({ entries: 2, missingEntries: 1 });
  expect(store.read({ recordingId, through: 2 }).nextAfter).toBeNull();
  expect(() => store.append({ ...source, revision: 'another-build' }, batch([entry(4)]))).toThrow('another game');
  expect(() => append([entry(5), entry(4)])).toThrow('ordered');
  store.disconnect(source.tabId);
  expect(store.read({ recordingId }).coverage.connected).toBe(false);
  expect(store.read({ recordingId }).entries).toHaveLength(2);
});

it('stores only public source identity, never transport objects or credentials', () => {
  const { store, source, batch, entry } = fixture();
  const transport = { ...source, socket: { authorization: 'private-test-token' }, type: 'live:hello' };
  store.append(transport, batch([entry(1)]));
  expect(store.status().recordings[0]).not.toHaveProperty('socket');
  expect(JSON.stringify(store.status())).not.toContain('private-test-token');
  expect(store.status().recordings[0]).not.toHaveProperty('type');
});

it('stops explicitly at capacity and leaves previous history readable', () => {
  const { store, recordingId, append, entry } = fixture(400);
  append([entry(1)]);
  const huge = entry(2);
  huge.data = { noise: Array.from({ length: 100 }, () => randomUUID()) };
  expect(append([huge]).stopped).toContain('capacity');
  expect(store.read({ recordingId }).entries.map((e) => e.seq)).toEqual([1]);
  expect(store.status().stopped).toContain('capacity');
});

it('seeks frame and time ranges without scanning unrelated batches', () => {
  const { store, recordingId, append, entry } = fixture();
  for (let i = 1; i <= 100; i++) append([entry(i)]);
  const range = store.read({ recordingId, fromFrame: 70, toFrame: 72 });
  expect(range.entries.map((value) => value.frame)).toEqual([70, 71, 72]);
  expect(range.scanned).toBe(3);
  expect(range.nextAfter).toBeNull();
  const time = store.read({ recordingId, fromTimeMs: 750, toTimeMs: 760 });
  expect(time.entries.map((value) => value.frame)).toEqual([75, 76]);
  expect(time.scanned).toBe(2);
});

it('limits response bytes, with repeatable pages and strict read-only query arguments', () => {
  const { store, recordingId, append, entry } = fixture();
  const entries = Array.from({ length: 10 }, (_, i) => ({ ...entry(i + 1), data: 'x'.repeat(100_000) }));
  append(entries);
  const first = store.read({ recordingId });
  expect(first.entries).toHaveLength(5);
  const second = store.read({ recordingId, after: first.nextAfter!, through: first.through });
  expect(second.entries.map((e) => e.seq)).toEqual([6, 7, 8, 9, 10]);
  expect(second.nextAfter).toBeNull();
  expect(store.read({ recordingId })).toEqual(first);
  expect(journalArguments.game_journal_read.safeParse({ recordingId, code: 'process.exit()' }).success).toBe(false);
  expect(journalArguments.game_journal_read.safeParse({ recordingId, limit: 201 }).success).toBe(false);
});
