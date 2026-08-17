import { describe, expect, it } from 'vitest';
import { loadBuildTranscript, stripPlaytestContext, PLAYTEST_CONTEXT_HEADER } from './build-transcript.js';
import { mcpPresenceText } from './mcp-presence.js';
import type { CreatorMessage, Store, SubmissionRecord } from './store.js';
import type { BuildEvent } from './submission-status.js';

type TranscriptStore = Pick<Store, 'listSubmissionsBySlug' | 'listCreatorMessages' | 'listBuildEvents'>;

function job(issueNumber: number, createdAt: string, slug = 'comet-courier'): SubmissionRecord {
  return {
    issueNumber,
    ownerUid: 'g:owner',
    title: 'Comet Courier',
    slug,
    createdAt,
    state: 'building',
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

describe('loadBuildTranscript', () => {
  it('merges creator messages and build events across rounds, oldest first', async () => {
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

    const { entries, omitted } = await loadBuildTranscript(store, current);

    expect(omitted).toBe(0);
    expect(entries).toEqual([
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
    // Job 3 is newer than the current round and belongs to its own transcript.
    expect(entries.some((entry) => entry.createdAt.startsWith('2026-08-18'))).toBe(false);
  });

  it('drops progress noise before it ever drops a creator word when the budget is tight', async () => {
    const current = job(1, '2026-08-17T12:00:00.000Z');
    const store = fakeStore({
      messages: {
        1: [{ text: 'c'.repeat(30), createdAt: '2026-08-17T13:00:00.000Z' }],
      },
      events: {
        1: [
          { text: 'p'.repeat(30), createdAt: '2026-08-17T12:30:00.000Z' },
          { text: 'q'.repeat(30), createdAt: '2026-08-17T12:45:00.000Z' },
        ],
      },
    });

    const { entries, omitted } = await loadBuildTranscript(store, current, { maxBytes: 65 });

    // The creator message survives even though it is chronologically last; the newest
    // progress entry fills what budget remains, and the rest is counted, not hidden.
    expect(entries.map((entry) => entry.kind)).toEqual(['build_progress', 'creator_request']);
    expect(entries[0]!.text).toBe('q'.repeat(30));
    expect(omitted).toBe(1);
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

    const { entries } = await loadBuildTranscript(store, current);

    expect(entries.map((entry) => entry.text)).toEqual(['Make it faster.', presence]);
  });

  it('stripPlaytestContext removes the stapled block and nothing else', () => {
    expect(stripPlaytestContext(`hello\n\n${PLAYTEST_CONTEXT_HEADER}\nstuff`)).toBe('hello');
    expect(stripPlaytestContext('hello')).toBe('hello');
  });
});
