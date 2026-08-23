import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryStore, type Scorecard, type SuggestionRecord } from '../platform/store.js';
import {
  advanceSuggestionOutcomes,
  judge,
  MEASUREMENT_WINDOW_DAYS,
  MIN_SESSIONS_TO_MEASURE,
} from './suggestion-outcomes.js';

/**
 * These decide whether an agent's work is recorded as having helped. The property worth
 * defending is not the arithmetic but the refusal: "we could not tell" must never be
 * written down as "no effect", because those look identical in a table and mean opposite
 * things — and the second one is what IL-4 would tune the router against.
 */

const AT = Date.parse('2026-08-20T03:30:00.000Z');
const PUBLISHED_AT = '2026-08-01T00:00:00.000Z';
const JOB = 1_000_500;

let store: InMemoryStore;

function suggestion(partial: Partial<SuggestionRecord> = {}): SuggestionRecord {
  return {
    id: 'sug-1',
    slug: 'crashy',
    ownerUid: 'g:owner',
    class: 'defect',
    priority: 40,
    evidence: [],
    status: 'dispatched',
    jobId: JOB,
    computedFrom: '2026-07-30T03:20:00.000Z',
    createdAt: '2026-07-30T03:30:00.000Z',
    updatedAt: '2026-07-30T03:30:00.000Z',
    ...partial,
  };
}

function card(errors: number, sessions = 100): Scorecard {
  return {
    slug: 'crashy',
    computedAt: '2026-08-20T03:20:00.000Z',
    window: { days: ['2026-08-19'], truncated: false },
    sessions: { count: sessions, bounces: 0, closes: 0, medianPlaySeconds: 30, totalPlaySeconds: 300 },
    health: { errors, aliveTicks: 100, stalledTicks: 0, stallRate: 0, medianFps: 60, resumeTicksIgnored: 0 },
    depth: {
      outcomes: { won: 0, lost: 0, quit: 0 },
      sessionsWithEnding: 0,
      finishRate: null,
      winRate: null,
      medianBestScore: null,
    },
    votes: { up: 0, down: 0 },
    feedback: { count: 0 },
    untrusted: { errorSamples: [], progressLabels: [], feedbackThemes: [] },
  } as Scorecard;
}

const run = () => advanceSuggestionOutcomes({ store, now: () => AT });

beforeEach(() => {
  store = new InMemoryStore();
});

describe('following a dispatched improvement', () => {
  it('records it as published once the job it went into actually ships', async () => {
    await store.createSubmission(JOB, 'g:owner', 'Crashy');
    await store.setSubmissionSlug(JOB, 'crashy');
    await store.setSubmissionPublishedAt(JOB, PUBLISHED_AT);
    await store.putSuggestion(suggestion());

    const result = await run();

    expect(result.shipped).toBe(1);
    const [after] = await store.listSuggestions();
    expect(after).toMatchObject({ status: 'published', publishedAt: PUBLISHED_AT });
  });

  it('reports a stalled job against the suggestion that commissioned it', async () => {
    // The operator queue already ranks stuck jobs. What is missing without this is the
    // link back: a creator's approved improvement going quiet reads as an anonymous
    // stuck job rather than as that.
    await store.createSubmission(JOB, 'g:owner', 'Crashy');
    await store.recordJobTransition(JOB, {
      to: 'queued',
      at: '2026-08-19T00:00:00.000Z',
      by: 'creator',
      reason: 'improvement_requested',
    });
    await store.putSuggestion(suggestion());

    const stalls: string[] = [];
    const result = await advanceSuggestionOutcomes({
      store,
      now: () => AT,
      onStall: (record, stall) => stalls.push(`${record.id}:${stall}`),
    });

    expect(result.stalled).toBe(1);
    expect(stalls).toEqual(['sug-1:not_dispatched']);
    // Reported, not acted on: the suggestion is left exactly where it was.
    expect((await store.listSuggestions())[0].status).toBe('dispatched');
  });
});

describe('measuring a published improvement', () => {
  async function published(partial: Partial<SuggestionRecord> = {}) {
    await store.putSuggestion(
      suggestion({
        status: 'published',
        publishedAt: PUBLISHED_AT,
        baseline: { at: '2026-07-30T00:00:00.000Z', metrics: { errorsPerSession: 0.4 } },
        ...partial,
      }),
    );
  }

  it('calls a real drop an improvement', async () => {
    await published();
    await store.putScorecard('crashy', card(5)); // 0.05/session, down from 0.4

    const result = await run();

    expect(result.measured).toBe(1);
    expect(result.improved).toBe(1);
    expect((await store.listSuggestions())[0].outcome).toMatchObject({
      verdict: 'improved',
      metric: 'errorsPerSession',
      before: 0.4,
      after: 0.05,
    });
  });

  it('calls a real rise a regression', async () => {
    await published();
    await store.putScorecard('crashy', card(90));

    expect((await run()).regressed).toBe(1);
  });

  it('waits out the measurement window rather than judging early', async () => {
    await published({ publishedAt: new Date(AT - 3 * 86_400_000).toISOString() });
    await store.putScorecard('crashy', card(5));

    const result = await run();

    expect(result.measured).toBe(0);
    expect(result.notYetMeasurable).toBe(0);
    expect((await store.listSuggestions())[0].status).toBe('published');
  });

  it('says "cannot tell yet" rather than "no effect" when the game went quiet', async () => {
    // The one that matters. A game with three sessions since the change has not been
    // measured, and recording that as `neutral` would put "the fix did nothing" into the
    // signal IL-4 tunes the router against.
    await published();
    await store.putScorecard('crashy', card(1, MIN_SESSIONS_TO_MEASURE - 1));

    const result = await run();

    expect(result.notYetMeasurable).toBe(1);
    expect(result.measured).toBe(0);
    expect(result.neutral).toBe(0);
    expect((await store.listSuggestions())[0].status).toBe('published');
  });

  it('will not judge without a baseline to judge against', async () => {
    await published({ baseline: undefined });
    await store.putScorecard('crashy', card(5));

    const result = await run();

    expect(result.notYetMeasurable).toBe(1);
    expect(result.measured).toBe(0);
  });

  it('leaves a game with no scorecard alone rather than scoring it', async () => {
    await published();

    expect((await run()).notYetMeasurable).toBe(1);
  });
});

describe('judge', () => {
  it('treats a small move as noise', () => {
    expect(judge(0.4, 0.38, true)).toBe('neutral');
  });

  it('refuses a verdict when either side is missing', () => {
    expect(judge(null, 0.1, true)).toBeNull();
    expect(judge(0.4, null, true)).toBeNull();
  });

  it('calls a rise from zero a regression rather than neutral', () => {
    // "It was perfect and now it crashes" is not no-change, and a relative comparison
    // against a zero baseline has no meaning to fall back on.
    expect(judge(0, 0.5, true)).toBe('regressed');
    expect(judge(0, 0, true)).toBe('neutral');
  });

  it('measures the window in days, as the plan states', () => {
    expect(MEASUREMENT_WINDOW_DAYS).toBe(14);
  });
});
