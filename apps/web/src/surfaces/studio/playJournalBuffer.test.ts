import { expect, it } from 'vitest';
import { PlayJournalBuffer } from './playJournalBuffer.js';
const id = '00000000-0000-4000-8000-000000000001';
const entry = (seq: number, timeMs = seq) => ({ seq, timeMs, frame: seq, kind: 'input', data: { key: 'ArrowRight' } });
it('freezes explicit snapshots, deduplicates retries and bounds retained time honestly', () => {
  const buffer = new PlayJournalBuffer();
  const append = (entries: unknown[]) =>
    buffer.append({ recordingId: id, startedAt: 100, json: JSON.stringify(entries) }, 'v1');
  append([entry(1), entry(2)]);
  const attached = buffer.snapshot();
  append([entry(1), entry(2), entry(3)]);
  expect(attached?.entries).toHaveLength(2);
  expect(buffer.snapshot()?.entries).toHaveLength(3);
  append([entry(4, 130000)]);
  expect(buffer.snapshot()).toMatchObject({ version: 'v1', droppedEntries: 3, entries: [{ seq: 4 }] });
  buffer.reset();
  expect(buffer.snapshot()).toBeNull();
  expect(attached?.entries).toHaveLength(2);
});
it('rejects malformed batches without accepting foreign values', () => {
  const buffer = new PlayJournalBuffer();
  expect(buffer.append({ recordingId: id, startedAt: 1, json: JSON.stringify([entry(-1)]) }, 'v')).toBeNull();
  expect(buffer.snapshot()).toBeNull();
});

it('counts JSON separators in the upload byte budget', () => {
  const buffer = new PlayJournalBuffer();
  for (let seq = 0; seq < 10000; seq += 100) {
    const entries = Array.from({ length: 100 }, (_, n) => ({ ...entry(seq + n), data: 'x'.repeat(140) }));
    buffer.append({ recordingId: id, startedAt: 1, json: JSON.stringify(entries) }, 'v1');
  }
  const saved = buffer.snapshot()!;
  expect(saved.droppedEntries).toBeGreaterThan(0);
  expect(new TextEncoder().encode(JSON.stringify(saved)).length).toBeLessThanOrEqual(2_000_000);
});
