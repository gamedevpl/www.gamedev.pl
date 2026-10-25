import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { InMemoryStore, type SubmissionRecord } from '../platform/store.js';
import { savePlayJournal } from '../platform/play-journal.js';
import { createPlayJournalTools } from './mcp-play-journal-tools.js';
import type { CreatorNotesToolsDeps } from './mcp-creator-notes-tools.js';
import type { ToolContext } from './mcp-tool-support.js';
const now = Date.now();
async function fixture() {
  const store = new InMemoryStore();
  await store.createSubmission(12, 'g:creator', 'Test');
  const record = (await store.getSubmission(12)) as SubmissionRecord;
  const saved = await savePlayJournal(store, 12, 'g:creator', {
    recordingId: randomUUID(),
    startedAt: now,
    version: 'build-1',
    droppedEntries: 0,
    entries: Array.from({ length: 100 }, (_, i) => ({
      seq: i,
      frame: i,
      timeMs: i * 16,
      kind: 'state',
      data: { stateStatus: 'unsupported', x: i },
    })),
  });
  const deps: CreatorNotesToolsDeps = {
    store,
    resolveAuth: async () => ({ jobId: 12, record, claims: {} }),
    managedOpener: () => ({ jobId: 12, roundGeneration: 1, exp: Math.floor(now / 1000) + 3600 }),
    now: () => now,
  };
  const call = (args = {}, overrides: Partial<CreatorNotesToolsDeps> = {}) =>
    createPlayJournalTools({ ...deps, ...overrides }).read_play_journal!.handler(
      { attachmentId: saved.id, ...args },
      {} as ToolContext,
    );
  return { call, deps };
}
it('pages and samples a frozen recording consistently without replay or live connection', async () => {
  const { call } = await fixture();
  const args = { everyFrames: 10, fields: ['/x'], limit: 3 };
  const first = (await call(args)).structuredContent as {
    entries: { seq: number; data: unknown }[];
    nextAfter: number;
  };
  expect(first.entries.map((e) => e.seq)).toEqual([0, 10, 20]);
  expect(first.entries[1]!.data).toEqual({ '/x': 10 });
  expect((await call({ ...args, after: first.nextAfter })).structuredContent).toMatchObject({
    entries: [{ seq: 30 }, { seq: 40 }, { seq: 50 }],
  });
  expect((await call(args)).structuredContent).toEqual(first);
  expect((await call({ fromFrame: 200 })).structuredContent).toMatchObject({
    entries: [],
    nextAfter: null,
    instrumentation: { latestSnapshotStatus: 'unsupported' },
  });
});
it('refuses cross-task, public and stale-managed-session reads', async () => {
  const { call, deps } = await fixture();
  expect((await call({}, { managedOpener: () => null })).isError).toBe(true);
  expect(
    (await call({}, { managedOpener: () => ({ jobId: 12, roundGeneration: 9, exp: now / 1000 + 60 }) })).isError,
  ).toBe(true);
  const auth = await deps.resolveAuth({} as ToolContext, {});
  if (!('jobId' in auth)) throw Error('fixture');
  expect(
    (
      await call(
        {},
        {
          resolveAuth: async () => ({ ...auth, jobId: 13 }),
          managedOpener: () => ({ jobId: 13, roundGeneration: 1, exp: now / 1000 + 60 }),
        },
      )
    ).isError,
  ).toBe(true);
});
