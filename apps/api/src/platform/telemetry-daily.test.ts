import { describe, expect, it, vi } from 'vitest';
import {
  buildDailyAggregate,
  DAILY_AGGREGATE_VERSION,
  downsample,
  mergeDailyAggregates,
  MAX_DOCUMENT_BYTES,
  MAX_GAMES_PER_DAY,
  MAX_SAMPLE_VALUES_PER_DAY,
  readDailyWindow,
  samplesPerMetric,
  sealedBefore,
  weightedMedian,
  type DailyTelemetryAggregate,
} from './telemetry-daily.js';
import { summarizeGameHealth } from './telemetry-health.js';
import type { TelemetryEvent } from './store.js';

function at(day: string, minute: number, second = 0): string {
  const mm = String(minute).padStart(2, '0');
  const ss = String(second).padStart(2, '0');
  return `${day}T10:${mm}:${ss}.000Z`;
}

function session(
  day: string,
  slug: string,
  id: string,
  options: { seconds: number; frames: number[]; score?: number },
) {
  const events: TelemetryEvent[] = [
    { slug, sessionId: id, type: 'game_opened', at: at(day, 0), msSinceOpen: 0 },
    { slug, sessionId: id, type: 'play_time', at: at(day, 0, 5), msSinceOpen: 5_000, seconds: options.seconds },
  ];
  options.frames.forEach((frames, index) => {
    events.push({
      slug,
      sessionId: id,
      type: 'alive',
      at: at(day, 0, 10 + index * 5),
      msSinceOpen: 10_000 + index * 5_000,
      frames,
    });
  });
  if (options.score !== undefined) {
    events.push({
      slug,
      sessionId: id,
      type: 'score',
      at: at(day, 1),
      msSinceOpen: 60_000,
      value: options.score,
    });
  }
  return events;
}

const DAYS = ['2026-09-13', '2026-09-12', '2026-09-11'];

function corpus(): Map<string, TelemetryEvent[]> {
  const byDay = new Map<string, TelemetryEvent[]>();
  DAYS.forEach((day, dayIndex) => {
    const events: TelemetryEvent[] = [];
    for (let index = 0; index < 5; index++) {
      events.push(
        ...session(day, 'sky-dodge', `${day}-s${index}`, {
          seconds: 10 + dayIndex * 7 + index * 3,
          frames: [300, 295, 60 * (index + 1)],
          score: index === 0 ? undefined : 100 * (index + dayIndex),
        }),
      );
    }
    events.push(...session(day, 'cave-run', `${day}-c0`, { seconds: dayIndex, frames: [120] }));
    byDay.set(day, events);
  });
  return byDay;
}

describe('downsample', () => {
  it('keeps everything, sorted, below the cap', () => {
    expect(downsample([3, 1, 2], 10)).toEqual({ count: 3, values: [1, 2, 3] });
  });

  it('keeps both endpoints and the requested width above the cap', () => {
    const set = downsample(
      Array.from({ length: 1000 }, (_, index) => index),
      5,
    );
    expect(set.count).toBe(1000);
    expect(set.values).toHaveLength(5);
    expect(set.values[0]).toBe(0);
    expect(set.values.at(-1)).toBe(999);
  });
});

describe('weightedMedian', () => {
  it('is the plain median when nothing was downsampled', () => {
    const plain = (values: number[]) => weightedMedian(values.map((value) => ({ value, weight: 1 })));
    expect(plain([1, 2, 3])).toBe(2);
    expect(plain([1, 2, 3, 4])).toBe(2.5);
    expect(plain([7])).toBe(7);
  });

  it('is null with no weight at all', () => {
    expect(weightedMedian([])).toBeNull();
  });

  it('stays close after a heavy downsample', () => {
    const values = Array.from({ length: 5_000 }, (_, index) => index);
    const set = downsample(values, 128);
    const estimate = weightedMedian(set.values.map((value) => ({ value, weight: set.count / set.values.length })));
    expect(estimate).toBeGreaterThan(2_400);
    expect(estimate).toBeLessThan(2_600);
  });
});

describe('mergeDailyAggregates', () => {
  it('reproduces a whole-window scan when no session crosses midnight', () => {
    const byDay = corpus();
    const all = [...byDay.values()].flat();
    const direct = summarizeGameHealth(all);
    const merged = mergeDailyAggregates(
      DAYS.map((day) =>
        buildDailyAggregate(day, byDay.get(day) ?? [], { computedAt: 'now', sealed: true, truncated: false }),
      ),
    );

    expect(merged).toEqual(direct);
  });

  it('counts a session that crosses UTC midnight once per partition', () => {
    const slug = 'night-owl';
    const before: TelemetryEvent[] = [
      { slug, sessionId: 'n1', type: 'game_opened', at: '2026-09-12T23:59:00.000Z', msSinceOpen: 0 },
      { slug, sessionId: 'n1', type: 'play_time', at: '2026-09-12T23:59:30.000Z', msSinceOpen: 30_000, seconds: 30 },
    ];
    const after: TelemetryEvent[] = [
      { slug, sessionId: 'n1', type: 'play_time', at: '2026-09-13T00:00:30.000Z', msSinceOpen: 90_000, seconds: 30 },
    ];

    const direct = summarizeGameHealth([...before, ...after]);
    const merged = mergeDailyAggregates([
      buildDailyAggregate('2026-09-12', before, { computedAt: 'now', sealed: true, truncated: false }),
      buildDailyAggregate('2026-09-13', after, { computedAt: 'now', sealed: true, truncated: false }),
    ]);

    expect(direct[0]?.sessions).toBe(1);
    expect(merged[0]?.sessions).toBe(2);
    // The seam splits the session, never its seconds.
    expect(merged[0]?.totalPlaySeconds).toBe(direct[0]?.totalPlaySeconds);
  });

  it('reranks errors across the window instead of inheriting each day’s top five', () => {
    const slug = 'sky-dodge';
    const days: DailyTelemetryAggregate[] = [];
    for (let day = 0; day < 6; day++) {
      const events: TelemetryEvent[] = [];
      const date = `2026-09-0${day + 1}`;
      // Five one-off errors outrank the recurring one every single day.
      for (let one = 0; one < 5; one++) {
        for (let repeat = 0; repeat < 3; repeat++) {
          events.push({
            slug,
            sessionId: `d${day}-o${one}-${repeat}`,
            type: 'error',
            at: at(date, one),
            msSinceOpen: 1_000,
            message: `one-off ${day}-${one}`,
          });
        }
      }
      events.push({
        slug,
        sessionId: `d${day}-r`,
        type: 'error',
        at: at(date, 30),
        msSinceOpen: 1_000,
        message: 'the recurring one',
      });
      events.push({
        slug,
        sessionId: `d${day}-r2`,
        type: 'error',
        at: at(date, 31),
        msSinceOpen: 1_000,
        message: 'the recurring one',
      });
      days.push(buildDailyAggregate(date, events, { computedAt: 'now', sealed: true, truncated: false }));
    }

    const merged = mergeDailyAggregates(days);

    expect(merged[0]?.errorSamples[0]).toEqual({ message: 'the recurring one', count: 12 });
  });

  it('is empty for a window with no play at all', () => {
    expect(mergeDailyAggregates([])).toEqual([]);
  });
});

describe('buildDailyAggregate', () => {
  function manyGames(count: number): TelemetryEvent[] {
    const events: TelemetryEvent[] = [];
    for (let index = 0; index < count; index++) {
      const plays = index < 5 ? 3 : 1;
      for (let play = 0; play < plays; play++) {
        events.push(...session('2026-09-13', `game-${index}`, `g${index}-${play}`, { seconds: 5, frames: [60] }));
      }
    }
    return events;
  }

  const meta = { computedAt: 'now', sealed: true, truncated: false };

  it('keeps a day far wider than the catalog rather than dropping games', () => {
    const aggregate = buildDailyAggregate('2026-09-13', manyGames(150), meta);

    expect(aggregate.games).toHaveLength(150);
    expect(aggregate.gamesTruncated).toBe(false);
  });

  it('spends its sample budget on more games, not deeper samples', () => {
    const aggregate = buildDailyAggregate('2026-09-13', manyGames(150), meta);
    const values = aggregate.games.reduce(
      (sum, game) => sum + game.playSeconds.values.length + game.fps.values.length + game.bestScores.values.length,
      0,
    );

    expect(values).toBeLessThanOrEqual(MAX_SAMPLE_VALUES_PER_DAY);
  });

  it('says so, past the hard ceiling on games', () => {
    const aggregate = buildDailyAggregate('2026-09-13', manyGames(MAX_GAMES_PER_DAY + 5), meta);

    expect(aggregate.games).toHaveLength(MAX_GAMES_PER_DAY);
    expect(aggregate.gamesTruncated).toBe(true);
    expect(aggregate.games[0]?.sessions).toBe(3);
  });

  it('stays inside the document ceiling when every game errors at full length', () => {
    // 200 chars is the write path's own cap on a message.

    // Unbudgeted, this shape serializes to 1.23 MB.
    const events: TelemetryEvent[] = [];
    for (let game = 0; game < 140; game++) {
      for (let distinct = 0; distinct < 32; distinct++) {
        events.push({
          slug: `game-${game}`,
          sessionId: `g${game}-e${distinct}`,
          type: 'error',
          at: at('2026-09-13', distinct),
          msSinceOpen: 1_000,
          message: `${game}-${distinct}-`.padEnd(200, 'x'),
        });
      }
      events.push(...session('2026-09-13', `game-${game}`, `g${game}-p`, { seconds: 5, frames: [60] }));
    }
    const aggregate = buildDailyAggregate('2026-09-13', events, meta);

    expect(Buffer.byteLength(JSON.stringify(aggregate))).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
    // Shrinking depth came before dropping a game.
    expect(aggregate.games).toHaveLength(140);
    expect(aggregate.gamesTruncated).toBe(false);
  });

  it('keeps errors and labels deeper than the window reports them', () => {
    const events: TelemetryEvent[] = [];
    for (let index = 0; index < 12; index++) {
      events.push({
        slug: 'sky-dodge',
        sessionId: `e${index}`,
        type: 'error',
        at: at('2026-09-13', index),
        msSinceOpen: 1_000,
        message: `boom ${index}`,
      });
    }
    const aggregate = buildDailyAggregate('2026-09-13', events, meta);

    expect(aggregate.games[0]?.errorTally.length).toBeGreaterThan(5);
  });
});

describe('samplesPerMetric', () => {
  it('is the full depth for a handful of games', () => {
    expect(samplesPerMetric(10)).toBe(128);
  });

  it('shrinks rather than dropping a game on a catalog-wide day', () => {
    expect(samplesPerMetric(400)).toBeLessThan(128);
    expect(samplesPerMetric(400)).toBeGreaterThanOrEqual(16);
  });

  it('never drops below the floor', () => {
    expect(samplesPerMetric(100_000)).toBe(16);
  });
});

describe('sealedBefore', () => {
  it('leaves today and yesterday open', () => {
    expect(sealedBefore(Date.parse('2026-09-15T03:20:00.000Z'))).toBe('2026-09-14');
  });
});

function reader(stored: Map<string, DailyTelemetryAggregate>, byDay: Map<string, TelemetryEvent[]>) {
  return {
    read: vi.fn(async (dateStr: string, limit: number) => (byDay.get(dateStr) ?? []).slice(0, limit)),
    get: vi.fn(async (dateStr: string) => stored.get(dateStr)),
    put: vi.fn(async (dateStr: string, aggregate: DailyTelemetryAggregate) => {
      stored.set(dateStr, aggregate);
    }),
  };
}

describe('readDailyWindow', () => {
  const budget = { perDay: 5_000, total: 50_000 };
  const meta = { computedAt: 'now', sealedBefore: '2026-09-13' };

  it('scans every day the first time and stores what it scanned', async () => {
    const stored = new Map<string, DailyTelemetryAggregate>();
    const source = reader(stored, corpus());

    const window = await readDailyWindow(DAYS, budget, source, meta);

    expect(window.rescanned).toBe(3);
    expect(window.reused).toBe(0);
    expect(window.scanned).toEqual(DAYS);
    expect(stored.size).toBe(3);
    expect(stored.get('2026-09-13')?.sealed).toBe(false);
    expect(stored.get('2026-09-12')?.sealed).toBe(true);
  });

  it('reads a sealed day back instead of scanning it', async () => {
    const byDay = corpus();
    const stored = new Map<string, DailyTelemetryAggregate>();
    await readDailyWindow(DAYS, budget, reader(stored, byDay), meta);

    const second = reader(stored, byDay);
    const window = await readDailyWindow(DAYS, budget, second, meta);

    expect(window.reused).toBe(2);
    expect(window.rescanned).toBe(1);
    expect(second.read).toHaveBeenCalledTimes(1);
    expect(second.read).toHaveBeenCalledWith('2026-09-13', expect.any(Number));
  });

  it('gives the same merged rows whether the days were scanned or reused', async () => {
    const byDay = corpus();
    const stored = new Map<string, DailyTelemetryAggregate>();
    const first = await readDailyWindow(DAYS, budget, reader(stored, byDay), meta);
    const second = await readDailyWindow(DAYS, budget, reader(stored, byDay), meta);

    expect(mergeDailyAggregates(second.days)).toEqual(mergeDailyAggregates(first.days));
  });

  it('ignores a rollup written by an older version', async () => {
    const byDay = corpus();
    const stored = new Map<string, DailyTelemetryAggregate>();
    await readDailyWindow(DAYS, budget, reader(stored, byDay), meta);
    stored.set('2026-09-12', { ...stored.get('2026-09-12')!, version: DAILY_AGGREGATE_VERSION - 1 });

    const source = reader(stored, byDay);
    const window = await readDailyWindow(DAYS, budget, source, meta);

    expect(window.rescanned).toBe(2);
    expect(stored.get('2026-09-12')?.version).toBe(DAILY_AGGREGATE_VERSION);
  });

  it('marks the window truncated when a day dropped games for size', async () => {
    const day = '2026-09-13';
    const stored = new Map<string, DailyTelemetryAggregate>();
    const byDay = new Map<string, TelemetryEvent[]>();
    const window = await readDailyWindow([day], budget, reader(stored, byDay), meta);
    stored.set(day, { ...window.days[0], sealed: true, gamesTruncated: true });

    const second = await readDailyWindow([day], budget, reader(stored, byDay), meta);

    expect(second.reused).toBe(1);
    expect(second.truncated).toBe(true);
  });

  it('narrows the window rather than overrunning the budget', async () => {
    const byDay = corpus();
    const stored = new Map<string, DailyTelemetryAggregate>();
    const window = await readDailyWindow(DAYS, { perDay: 5, total: 5 }, reader(stored, byDay), meta);

    expect(window.scanned).toEqual(['2026-09-13']);
    expect(window.truncated).toBe(true);
  });

  it('carries a truncated day forward as a floor', async () => {
    const byDay = corpus();
    const stored = new Map<string, DailyTelemetryAggregate>();
    await readDailyWindow(DAYS, { perDay: 4, total: 50_000 }, reader(stored, byDay), meta);

    const window = await readDailyWindow(DAYS, budget, reader(stored, byDay), meta);

    expect(window.truncated).toBe(true);
  });

  it('keeps the window when a rollup cannot be stored', async () => {
    const byDay = corpus();
    const source = reader(new Map(), byDay);
    source.put.mockRejectedValue(new Error('firestore down'));
    const onError = vi.fn();

    const window = await readDailyWindow(DAYS, budget, source, meta, onError);

    expect(window.scanned).toEqual(DAYS);
    expect(onError).toHaveBeenCalledTimes(3);
  });
});
