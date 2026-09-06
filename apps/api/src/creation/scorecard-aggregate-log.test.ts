import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryStore, type TelemetryEvent } from '../platform/store.js';
import { runScorecardSweep } from './scorecard.js';
import { SCORECARD_AGGREGATE_EVENT, type ScorecardAggregateLog } from './scorecard-aggregate-log.js';
import { MIN_FEEDBACK_FOR_THEMES, type ThemeExtractor } from '../community/feedback-themes.js';

const today = () => new Date().toISOString().slice(0, 10);

function event(partial: Partial<TelemetryEvent> & { type: TelemetryEvent['type'] }): TelemetryEvent {
  return {
    slug: 'brick-storm',
    sessionId: 's1',
    at: new Date().toISOString(),
    ...partial,
  } as TelemetryEvent;
}

async function seed(store: InMemoryStore, events: TelemetryEvent[]) {
  await store.appendTelemetryEvents(today(), events);
}

describe('scorecard aggregate log', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:alice' });
    await seed(store, [event({ type: 'game_opened', slug: 'brick-storm' })]);
  });

  it('emits one line per scorecard written, carrying the numbers a reader acts on', async () => {
    const lines: ScorecardAggregateLog[] = [];

    await runScorecardSweep({ store, onAggregate: (line) => lines.push(line) });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: SCORECARD_AGGREGATE_EVENT,
      slug: 'brick-storm',
      sessions: 1,
      feedbackCount: 0,
    });
  });

  it('carries no player words — not the notes, and not the themes distilled from them', async () => {
    const secret = 'the boss on level three killed my cat';
    for (let index = 0; index < MIN_FEEDBACK_FOR_THEMES; index += 1) {
      await store.addPlayerFeedback('brick-storm', 'g:alice', `${secret} ${index}`);
    }
    const themeExtractor: ThemeExtractor = { extract: async () => [{ theme: secret, count: 3 }] };
    const lines: ScorecardAggregateLog[] = [];

    await runScorecardSweep({ store, themeExtractor, onAggregate: (line) => lines.push(line) });

    // Logs outlive rows; erase-player-signals.ts cannot reach them.
    const serialized = JSON.stringify(lines);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('boss');
    expect(lines[0]?.feedbackCount).toBe(MIN_FEEDBACK_FOR_THEMES);
    expect(lines[0]?.feedbackThemeCount).toBe(1);
    expect((await store.getScorecard('brick-storm'))?.untrusted.feedbackThemes).toHaveLength(1);
  });

  it('carries no game-supplied strings either', async () => {
    await seed(store, [event({ type: 'error', slug: 'brick-storm', message: 'ReferenceError: boom' })]);
    const lines: ScorecardAggregateLog[] = [];

    await runScorecardSweep({ store, onAggregate: (line) => lines.push(line) });

    // Assert the sample reached the scorecard, or the omission below proves nothing.
    const card = await store.getScorecard('brick-storm');
    expect(card?.untrusted.errorSamples).toContainEqual({ message: 'ReferenceError: boom', count: 1 });

    // `untrusted` contains these; a log would un-contain them.
    expect(JSON.stringify(lines)).not.toContain('boom');
    expect(lines[0]?.errors).toBe(1);
  });

  it('stays silent for a game whose scorecard failed to persist', async () => {
    const lines: ScorecardAggregateLog[] = [];
    const failing = Object.create(store) as InMemoryStore;
    failing.putScorecard = async () => {
      throw new Error('firestore rejected the write');
    };

    const result = await runScorecardSweep({
      store: failing,
      onAggregate: (line) => lines.push(line),
      onError: () => {},
    });

    // A line for an absent scorecard contradicts the database.
    expect(result.failed).toBe(1);
    expect(lines).toEqual([]);
  });
});
