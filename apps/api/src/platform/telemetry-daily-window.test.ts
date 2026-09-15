import { describe, expect, it, vi } from 'vitest';
import {
  DAILY_AGGREGATE_VERSION,
  mergeDailyAggregates,
  readDailyWindow,
  sealedBefore,
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
    events.push({ slug, sessionId: id, type: 'score', at: at(day, 1), msSinceOpen: 60_000, value: options.score });
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

  it('hands each day the next day’s events, so the seam is joined end to end', async () => {
    const slug = 'night-owl';
    const byDay = new Map<string, TelemetryEvent[]>([
      [
        '2026-09-13',
        [
          {
            slug,
            sessionId: 'n1',
            type: 'play_time',
            at: '2026-09-13T00:00:30.000Z',
            msSinceOpen: 90_000,
            seconds: 30,
          },
        ],
      ],
      [
        '2026-09-12',
        [
          { slug, sessionId: 'n1', type: 'game_opened', at: '2026-09-12T23:59:00.000Z', msSinceOpen: 0 },
          {
            slug,
            sessionId: 'n1',
            type: 'play_time',
            at: '2026-09-12T23:59:30.000Z',
            msSinceOpen: 30_000,
            seconds: 30,
          },
        ],
      ],
    ]);

    const window = await readDailyWindow(['2026-09-13', '2026-09-12'], budget, reader(new Map(), byDay), meta);
    const merged = mergeDailyAggregates(window.days)[0];
    const direct = summarizeGameHealth([...(byDay.get('2026-09-12') ?? []), ...(byDay.get('2026-09-13') ?? [])])[0];

    expect(merged).toEqual(direct);
  });

  it('reads a sealed successor back rather than sealing a bounce forever', async () => {
    const slug = 'night-owl';
    const before: TelemetryEvent[] = [
      { slug, sessionId: 'n1', type: 'game_opened', at: '2026-09-12T23:59:00.000Z', msSinceOpen: 0 },
      { slug, sessionId: 'n1', type: 'play_time', at: '2026-09-12T23:59:30.000Z', msSinceOpen: 30_000, seconds: 30 },
    ];
    const after: TelemetryEvent[] = [
      { slug, sessionId: 'n1', type: 'play_time', at: '2026-09-13T00:00:30.000Z', msSinceOpen: 90_000, seconds: 30 },
    ];
    const byDay = new Map<string, TelemetryEvent[]>([
      ['2026-09-13', after],
      ['2026-09-12', before],
    ]);
    const days = ['2026-09-13', '2026-09-12'];

    // The newer day sealed; the older day's own write never landed.
    const stored = new Map<string, DailyTelemetryAggregate>();
    const first = reader(stored, byDay);
    first.put.mockImplementation(async (dateStr: string, aggregate: DailyTelemetryAggregate) => {
      if (dateStr === '2026-09-13') stored.set(dateStr, { ...aggregate, sealed: true });
    });
    await readDailyWindow(days, budget, first, meta);
    expect(stored.has('2026-09-12')).toBe(false);

    const second = reader(stored, byDay);
    const window = await readDailyWindow(days, budget, second, meta);
    const merged = mergeDailyAggregates(window.days)[0];
    const direct = summarizeGameHealth([...before, ...after])[0];

    expect(second.read).toHaveBeenCalledWith('2026-09-13', expect.any(Number));
    expect(merged?.medianPlaySeconds).toBe(direct?.medianPlaySeconds);
    expect(merged?.bounces).toBe(0);
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

  it('marks the window truncated when a day shortened its tallies', async () => {
    const day = '2026-09-13';
    const stored = new Map<string, DailyTelemetryAggregate>();
    const byDay = new Map<string, TelemetryEvent[]>();
    const first = await readDailyWindow([day], budget, reader(stored, byDay), meta);
    stored.set(day, { ...first.days[0], sealed: true, tallyTruncated: true });

    const second = await readDailyWindow([day], budget, reader(stored, byDay), meta);

    expect(second.reused).toBe(1);
    expect(second.truncated).toBe(true);
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
