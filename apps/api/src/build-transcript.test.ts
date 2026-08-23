import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSCRIPT_WINDOW_ENTRIES,
  loadBuildTranscript,
  MAX_TRANSCRIPT_LIST_ENTRIES,
  MAX_TRANSCRIPT_ROUNDS,
  MAX_TRANSCRIPT_WINDOW_ENTRIES,
  PLAYTEST_CONTEXT_HEADER,
  stripPlaytestContext,
} from './build-transcript.js';
import { mcpPresenceText } from './mcp-presence.js';
import type { CreatorMessage, Store, SubmissionRecord } from './store.js';
import type { BuildEvent } from './submission-status.js';

type TranscriptStore = Pick<Store, 'listSubmissionsBySlug' | 'listCreatorMessages' | 'listBuildEvents'>;

function job(
  issueNumber: number,
  createdAt: string,
  slug = 'comet-courier',
  spec?: string,
  specIsSystemGenerated?: boolean,
): SubmissionRecord {
  return {
    issueNumber,
    ownerUid: 'g:owner',
    title: 'Comet Courier',
    slug,
    createdAt,
    state: 'building',
    ...(spec !== undefined ? { spec } : {}),
    ...(specIsSystemGenerated ? { specIsSystemGenerated: true } : {}),
  } as SubmissionRecord;
}

function fakeStore(input: {
  submissions?: SubmissionRecord[];
  messages?: Record<number, Array<{ text: string; createdAt: string; origin?: 'studio' | 'agent' }>>;
  events?: Record<number, Array<{ text: string; createdAt: string }>>;
}): TranscriptStore {
  return {
    listSubmissionsBySlug: async (slug) => (input.submissions ?? []).filter((submission) => submission.slug === slug),
    listCreatorMessages: async (issueNumber) =>
      (input.messages?.[issueNumber] ?? []).map((message, index) => ({
        id: `m${issueNumber}-${index}`,
        deliveredAt: null,
        ...message,
      })) as CreatorMessage[],
    listBuildEvents: async (issueNumber) =>
      (input.events?.[issueNumber] ?? []).map((event, index) => ({
        id: `e${issueNumber}-${index}`,
        kind: 'step',
        ...event,
      })) as BuildEvent[],
  };
}

// 25 strictly increasing creator messages, oldest first: message-0 .. message-24.
function manyMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    text: `message-${i}`,
    createdAt: `2026-08-17T12:${String(i).padStart(2, '0')}:00.000Z`,
  }));
}

describe('loadBuildTranscript', () => {
  it('defaults to the tail — the most recent window — when no cursor is given', async () => {
    const current = job(1, '2026-08-16T00:00:00.000Z');
    const store = fakeStore({ messages: { 1: manyMessages(25) } });

    const page = await loadBuildTranscript(store, current);

    expect(page.entries).toHaveLength(DEFAULT_TRANSCRIPT_WINDOW_ENTRIES);
    expect(page.entries[0]!.text).toBe('message-5');
    expect(page.entries.at(-1)!.text).toBe('message-24');
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('5');
  });

  it('never returns the whole conversation in one call, and paging with nextCursor covers it without gaps or dupes', async () => {
    const current = job(1, '2026-08-16T00:00:00.000Z');
    const store = fakeStore({ messages: { 1: manyMessages(47) } });

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await loadBuildTranscript(store, current, cursor !== undefined ? { cursor } : undefined);
      pages += 1;
      expect(page.entries.length).toBeLessThanOrEqual(DEFAULT_TRANSCRIPT_WINDOW_ENTRIES);
      seen.unshift(...page.entries.map((e) => e.text));
      if (!page.hasMore) break;
      cursor = page.nextCursor;
      expect(pages).toBeLessThan(10); // guard against an infinite loop on a bug
    }

    expect(pages).toBeGreaterThan(1); // proves no single call served everything
    expect(seen).toEqual(manyMessages(47).map((m) => m.text));
  });

  it('degrades a malformed or out-of-range cursor to something sane rather than erroring', async () => {
    const current = job(1, '2026-08-16T00:00:00.000Z');
    const store = fakeStore({ messages: { 1: manyMessages(25) } });

    // Garbage cursor: falls back to the tail.
    const garbage = await loadBuildTranscript(store, current, { cursor: 'not-a-number' });
    expect(garbage.entries.at(-1)!.text).toBe('message-24');

    // Cursor past the end: clamps to the tail.
    const tooFar = await loadBuildTranscript(store, current, { cursor: '9999' });
    expect(tooFar.entries.at(-1)!.text).toBe('message-24');

    // Cursor before the start: clamps to nothing.
    const beforeStart = await loadBuildTranscript(store, current, { cursor: '-5' });
    expect(beforeStart.entries).toEqual([]);
    expect(beforeStart.hasMore).toBe(false);
    expect(beforeStart.nextCursor).toBeUndefined();
  });

  it('honours limit, clamped to the window ceiling', async () => {
    const current = job(1, '2026-08-16T00:00:00.000Z');
    const store = fakeStore({ messages: { 1: manyMessages(80) } });

    const small = await loadBuildTranscript(store, current, { limit: 3 });
    expect(small.entries).toHaveLength(3);
    expect(small.entries.at(-1)!.text).toBe('message-79');

    const oversized = await loadBuildTranscript(store, current, { limit: 1000 });
    expect(oversized.entries).toHaveLength(MAX_TRANSCRIPT_WINDOW_ENTRIES);
  });

  it('shrinks the window to stay under the per-window byte ceiling, without dropping an entry out of order', async () => {
    const current = job(1, '2026-08-16T00:00:00.000Z');
    // 10 entries of 3000 bytes each exceeds the 20 KB window cap.
    const messages = Array.from({ length: 10 }, (_, i) => ({
      text: 'x'.repeat(3000),
      createdAt: `2026-08-17T12:${String(i).padStart(2, '0')}:00.000Z`,
    }));
    const store = fakeStore({ messages: { 1: messages } });

    const page = await loadBuildTranscript(store, current);

    expect(page.entries.length).toBeLessThan(10);
    expect(page.entries.length).toBeGreaterThan(0);
    const totalBytes = page.entries.reduce((sum, e) => sum + Buffer.byteLength(e.text, 'utf8'), 0);
    expect(totalBytes).toBeLessThanOrEqual(20_000);
    // Still the newest entries, still contiguous — no entry skipped mid-window.
    expect(page.hasMore).toBe(true);
  });

  it('merges creator messages and build events across sibling rounds, oldest first within the window', async () => {
    const current = job(2, '2026-08-17T12:00:00.000Z');
    const store = fakeStore({
      submissions: [current, job(1, '2026-08-16T12:00:00.000Z'), job(3, '2026-08-18T12:00:00.000Z')],
      messages: {
        1: [{ text: 'A very long spec about hatching Norns.', createdAt: '2026-08-16T13:00:00.000Z' }],
        2: [
          { text: 'build my game plz', createdAt: '2026-08-17T13:00:00.000Z' },
          { text: 'Relayed for you.', createdAt: '2026-08-17T13:30:00.000Z', origin: 'studio' },
        ],
      },
      events: {
        1: [{ text: 'Delivered the first draft.', createdAt: '2026-08-16T14:00:00.000Z' }],
      },
    });

    const page = await loadBuildTranscript(store, current);

    expect(page.hasMore).toBe(false);
    expect(page.entries).toEqual([
      {
        kind: 'creator_request',
        text: 'A very long spec about hatching Norns.',
        createdAt: '2026-08-16T13:00:00.000Z',
        round: 'earlier',
      },
      {
        kind: 'build_progress',
        text: 'Delivered the first draft.',
        createdAt: '2026-08-16T14:00:00.000Z',
        round: 'earlier',
      },
      {
        kind: 'creator_request',
        text: 'build my game plz',
        createdAt: '2026-08-17T13:00:00.000Z',
        round: 'current',
      },
      {
        kind: 'agent_note',
        text: 'Relayed for you.',
        createdAt: '2026-08-17T13:30:00.000Z',
        round: 'current',
      },
    ]);
    // Job 3 is newer — its own transcript, not this one.
    expect(page.entries.some((entry) => entry.createdAt.startsWith('2026-08-18'))).toBe(false);
  });

  it('strips playtest instrumentation and hides pre-cutover presence leftovers', async () => {
    const current = job(1, '2026-08-17T12:00:00.000Z');
    const presence = mcpPresenceText('read_kit_file');
    expect(presence).toBeTruthy();
    const store = fakeStore({
      messages: {
        1: [
          {
            text: `Make it faster.\n\n${PLAYTEST_CONTEXT_HEADER}\n\`\`\`text\nplaySeconds: 12\n\`\`\``,
            createdAt: '2026-08-17T13:00:00.000Z',
          },
        ],
      },
      events: {
        1: [
          // Leftover chat row from before presence stopped writing durable events.
          { text: presence!, createdAt: '2026-08-01T00:00:00.000Z' },
          // The same words after the cutover are a genuine report_progress and stay.
          { text: presence!, createdAt: '2026-08-17T14:00:00.000Z' },
        ],
      },
    });

    const page = await loadBuildTranscript(store, current);

    expect(page.entries.map((entry) => entry.text)).toEqual(['Make it faster.', presence]);
  });

  it('stripPlaytestContext removes the stapled block and nothing else', () => {
    expect(stripPlaytestContext(`hello\n\n${PLAYTEST_CONTEXT_HEADER}\nstuff`)).toBe('hello');
    expect(stripPlaytestContext('hello')).toBe('hello');
  });

  it('stripPlaytestContext tolerates a phantom message with no text', () => {
    expect(stripPlaytestContext(undefined as unknown as string)).toBe('');
  });

  it('surfaces the founding spec as a synthetic entry — creation never appends it as a message', async () => {
    // Creation writes the concept to `spec`, never as a message.
    const current = job(1, '2026-08-16T00:00:00.000Z', 'comet-courier', 'A game about delivering parcels.');
    const store = fakeStore({
      messages: { 1: [{ text: 'Make the parcels bigger.', createdAt: '2026-08-16T01:00:00.000Z' }] },
    });

    const page = await loadBuildTranscript(store, current);

    expect(page.entries).toEqual([
      {
        kind: 'creator_request',
        text: 'A game about delivering parcels.',
        createdAt: '2026-08-16T00:00:00.000Z',
        round: 'current',
      },
      {
        kind: 'creator_request',
        text: 'Make the parcels bigger.',
        createdAt: '2026-08-16T01:00:00.000Z',
        round: 'current',
      },
    ]);
  });

  it('does not duplicate the founding spec when an improvement round already echoed it as a message', async () => {
    // Both `spec` and a message carry the same text here.
    const current = job(1, '2026-08-16T00:00:00.000Z', 'comet-courier', 'Add a boss fight.');
    const store = fakeStore({
      messages: { 1: [{ text: 'Add a boss fight.', createdAt: '2026-08-16T00:00:00.500Z' }] },
    });

    const page = await loadBuildTranscript(store, current);

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({ text: 'Add a boss fight.', createdAt: '2026-08-16T00:00:00.500Z' });
  });

  it('flags truncatedAtSource when a round exceeds the per-round read ceiling, without lying about hasMore', async () => {
    const current = job(1, '2026-08-16T00:00:00.000Z');
    const events = Array.from({ length: MAX_TRANSCRIPT_LIST_ENTRIES }, (_, i) => ({
      text: `event-${i}`,
      createdAt: `2026-08-16T01:${String(i % 60).padStart(2, '0')}:${String(Math.floor(i / 60)).padStart(2, '0')}.000Z`,
    }));
    const store = fakeStore({ events: { 1: events } });

    const page = await loadBuildTranscript(store, current);

    expect(page.truncatedAtSource).toBe(true);
  });

  it('omits truncatedAtSource entirely when nothing was capped', async () => {
    const current = job(1, '2026-08-16T00:00:00.000Z');
    const store = fakeStore({ messages: { 1: manyMessages(5) } });

    const page = await loadBuildTranscript(store, current);

    expect(page).not.toHaveProperty('truncatedAtSource');
  });

  it('flags truncatedAtSource when a game has more sibling rounds than the cap keeps', async () => {
    // One sibling past the cap pushes the founding round out entirely.
    const current = job(MAX_TRANSCRIPT_ROUNDS + 1, '2026-08-23T00:00:00.000Z');
    const siblings = Array.from({ length: MAX_TRANSCRIPT_ROUNDS }, (_, i) =>
      job(i + 1, `2026-08-${String(i + 10).padStart(2, '0')}T00:00:00.000Z`),
    );
    const store = fakeStore({ submissions: [current, ...siblings] });

    const page = await loadBuildTranscript(store, current);

    expect(page.truncatedAtSource).toBe(true);
  });

  it('does not flag truncatedAtSource when sibling rounds fit within the cap', async () => {
    const current = job(MAX_TRANSCRIPT_ROUNDS, '2026-08-23T00:00:00.000Z');
    const siblings = Array.from({ length: MAX_TRANSCRIPT_ROUNDS - 1 }, (_, i) =>
      job(i + 1, `2026-08-${String(i + 10).padStart(2, '0')}T00:00:00.000Z`),
    );
    const store = fakeStore({ submissions: [current, ...siblings] });

    const page = await loadBuildTranscript(store, current);

    expect(page).not.toHaveProperty('truncatedAtSource');
  });

  it('labels a system-generated sweep brief as agent_note, not creator_request', async () => {
    const current = job(
      1,
      '2026-08-16T00:00:00.000Z',
      'comet-courier',
      'Evidence brief: players stall at level 2.',
      true,
    );
    const store = fakeStore({});

    const page = await loadBuildTranscript(store, current);

    expect(page.entries).toEqual([
      expect.objectContaining({ kind: 'agent_note', text: 'Evidence brief: players stall at level 2.' }),
    ]);
  });
});
