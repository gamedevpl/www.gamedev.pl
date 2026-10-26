import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore } from './store.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import { decodePlayJournal, PlayJournalSchema, savePlayJournal } from './play-journal.js';

export const journalFixture = () => ({
  recordingId: randomUUID(),
  startedAt: Date.now(),
  version: 'build-before-fix',
  droppedEntries: 9,
  entries: Array.from({ length: 12 }, (_, i) => ({
    seq: i + 10,
    timeMs: i * 16,
    frame: i,
    kind: 'state' as const,
    data: { stateStatus: 'unsupported', metadata: { x: i } },
  })),
});
for (const kind of ['memory', 'firestore'])
  describe(kind + ' journal attachments', () => {
    const make = () => (kind === 'memory' ? new InMemoryStore() : new FirestoreStore(fakeFirestore().db));
    it('stores immutable attachments per job, expires reads and erases the creator data', async () => {
      const store = make();
      await store.upsertUser({ uid: 'g:creator' });
      const value = journalFixture();
      const saved = await savePlayJournal(store, 12, 'g:creator', value);
      value.entries[0]!.data.metadata.x = 999;
      expect(decodePlayJournal((await store.getPlayJournal(12, saved.id))!).entries[0]!.data).toMatchObject({
        metadata: { x: 0 },
      });
      expect(await store.getPlayJournal(13, saved.id)).toBeNull();
      await expect(store.putPlayJournal(saved)).rejects.toThrow();
      const expired = { ...saved, id: randomUUID(), expiresAt: new Date(0) };
      await store.putPlayJournal(expired);
      expect(await store.getPlayJournal(12, expired.id)).toBeNull();
      await store.beginAccountErasure('g:creator', new Date().toISOString());
      await store.deletePlayJournalsByOwner('g:creator');
      expect(await store.getPlayJournal(12, saved.id)).toBeNull();
      await expect(savePlayJournal(store, 12, 'g:creator', journalFixture())).rejects.toThrow('erased');
    });
  });
it('rejects unordered and individually oversized entries', () => {
  const input = journalFixture();
  input.entries.reverse();
  expect(PlayJournalSchema.safeParse(input).success).toBe(false);
  expect(
    PlayJournalSchema.safeParse({
      ...journalFixture(),
      entries: [{ seq: 0, timeMs: 0, frame: 0, kind: 'state', data: 'x'.repeat(130_000) }],
    }).success,
  ).toBe(false);
});
