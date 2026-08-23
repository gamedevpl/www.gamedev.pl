import { describe, expect, it } from 'vitest';
import {
  applyChangelogSummaries,
  hydrateRecentBuildSummaries,
  isChangelogWorthy,
  pickChangelogEvent,
  pickLatestChangelogText,
  resolveBuildSummary,
  resolveChangelogText,
  type ChangelogEvent,
} from './build-changelog.js';
import type { RecentBuild } from '@gamedevpl/contract';

function event(partial: Partial<ChangelogEvent> & Pick<ChangelogEvent, 'kind' | 'text' | 'createdAt'>): ChangelogEvent {
  return partial;
}

function build(partial: Partial<RecentBuild> & Pick<RecentBuild, 'version' | 'createdAt'>): RecentBuild {
  return {
    mode: 'preview',
    verdict: 'green',
    issueNumber: 10,
    ...partial,
  };
}

describe('isChangelogWorthy', () => {
  it('keeps done and step sentences', () => {
    expect(
      isChangelogWorthy(event({ kind: 'done', text: 'Jump feels tighter.', createdAt: '2026-08-23T01:00:00.000Z' })),
    ).toBe(true);
    expect(
      isChangelogWorthy(
        event({ kind: 'step', text: 'Wiring the landing HUD.', createdAt: '2026-08-23T01:00:00.000Z' }),
      ),
    ).toBe(true);
  });

  it('drops blocked, asking, empty, and leftover presence rows', () => {
    expect(
      isChangelogWorthy(event({ kind: 'blocked', text: 'Need a typecheck.', createdAt: '2026-08-23T01:00:00.000Z' })),
    ).toBe(false);
    expect(isChangelogWorthy(event({ kind: 'step', text: '   ', createdAt: '2026-08-23T01:00:00.000Z' }))).toBe(false);
    expect(
      isChangelogWorthy(
        event({ kind: 'step', text: 'Browsing the Creator Kit…', createdAt: '2026-08-01T01:00:00.000Z' }),
      ),
    ).toBe(false);
  });
});

describe('resolveChangelogText', () => {
  it('uses the localized sentence when the reader locale matches', () => {
    expect(
      resolveChangelogText(
        event({
          kind: 'done',
          text: 'Jump feels tighter.',
          textLocalized: 'Skok jest ciaśniejszy.',
          locale: 'pl',
          createdAt: '2026-08-23T01:00:00.000Z',
        }),
        'pl',
      ),
    ).toBe('Skok jest ciaśniejszy.');
  });

  it('falls back to English when the locale does not match', () => {
    expect(
      resolveChangelogText(
        event({
          kind: 'done',
          text: 'Jump feels tighter.',
          textLocalized: 'Skok jest ciaśniejszy.',
          locale: 'pl',
          createdAt: '2026-08-23T01:00:00.000Z',
        }),
        'en',
      ),
    ).toBe('Jump feels tighter.');
  });
});

describe('resolveBuildSummary', () => {
  const done = event({
    kind: 'done',
    text: 'Jump feels tighter.',
    textLocalized: 'Skok jest ciaśniejszy.',
    locale: 'pl',
    createdAt: '2026-08-23T01:00:00.000Z',
  });

  it('prefers a matching localized event over a stored English summary', () => {
    expect(resolveBuildSummary('Added audio.', done, 'pl')).toBe('Skok jest ciaśniejszy.');
  });

  it('keeps a stored summary when no localized event matches', () => {
    expect(resolveBuildSummary('Added audio.', done, 'en')).toBe('Added audio.');
  });

  it('uses the event text when the manifest has no summary', () => {
    expect(resolveBuildSummary(undefined, done, 'en')).toBe('Jump feels tighter.');
  });
});

describe('pickChangelogEvent', () => {
  const events: ChangelogEvent[] = [
    event({ kind: 'done', text: 'Sealed the publish.', createdAt: '2026-08-23T03:00:00.000Z' }),
    event({ kind: 'step', text: 'Fixing collisions.', createdAt: '2026-08-23T02:10:00.000Z' }),
    event({ kind: 'step', text: 'Drafting the first playable.', createdAt: '2026-08-23T01:10:00.000Z' }),
  ];

  it('takes the done event in the version window', () => {
    const picked = pickChangelogEvent('2026-08-23T02:00:00.000Z', undefined, events);
    expect(picked?.text).toBe('Sealed the publish.');
  });

  it('takes the newest step when the next version cuts off done', () => {
    const picked = pickChangelogEvent('2026-08-23T02:00:00.000Z', '2026-08-23T02:30:00.000Z', events);
    expect(picked?.text).toBe('Fixing collisions.');
  });

  it('falls back to the last step before the version when the window is empty', () => {
    const picked = pickChangelogEvent('2026-08-23T01:40:00.000Z', '2026-08-23T02:00:00.000Z', events);
    expect(picked?.text).toBe('Drafting the first playable.');
  });
});

describe('pickLatestChangelogText', () => {
  it('returns the newest worthy sentence', () => {
    expect(
      pickLatestChangelogText([
        event({ kind: 'blocked', text: 'Need TRACE.', createdAt: '2026-08-23T02:00:00.000Z' }),
        event({ kind: 'step', text: 'Tuning the jump.', createdAt: '2026-08-23T01:00:00.000Z' }),
      ]),
    ).toBe('Tuning the jump.');
  });
});

describe('applyChangelogSummaries', () => {
  it('fills empty summaries from the matching round events', () => {
    const builds = [
      build({ version: 'v2', createdAt: '2026-08-23T02:00:00.000Z', issueNumber: 10 }),
      build({ version: 'v1', createdAt: '2026-08-23T01:00:00.000Z', issueNumber: 10 }),
    ];
    const events = new Map<number, ChangelogEvent[]>([
      [
        10,
        [
          event({ kind: 'done', text: 'Sealed the publish.', createdAt: '2026-08-23T02:10:00.000Z' }),
          event({ kind: 'step', text: 'Drafting the first playable.', createdAt: '2026-08-23T01:05:00.000Z' }),
        ],
      ],
    ]);

    expect(applyChangelogSummaries(builds, events).map((item) => item.summary)).toEqual([
      'Sealed the publish.',
      'Drafting the first playable.',
    ]);
  });
});

describe('hydrateRecentBuildSummaries', () => {
  it('loads each issue once and leaves stored summaries in English locales', async () => {
    const seen: number[] = [];
    const hydrated = await hydrateRecentBuildSummaries({
      locale: 'en',
      builds: [
        build({ version: 'v2', createdAt: '2026-08-23T02:00:00.000Z', issueNumber: 10, summary: 'Kept.' }),
        build({ version: 'v1', createdAt: '2026-08-23T01:00:00.000Z', issueNumber: 10 }),
        build({ version: 'v9', createdAt: '2026-08-22T01:00:00.000Z', issueNumber: 9 }),
      ],
      loadEvents: async (issueNumber) => {
        seen.push(issueNumber);
        if (issueNumber === 10) {
          return [event({ kind: 'step', text: 'Filled from progress.', createdAt: '2026-08-23T01:05:00.000Z' })];
        }
        return [event({ kind: 'done', text: 'Earlier round.', createdAt: '2026-08-22T01:10:00.000Z' })];
      },
    });

    expect(seen.sort((a, b) => a - b)).toEqual([9, 10]);
    expect(hydrated.map((item) => item.summary)).toEqual(['Kept.', 'Filled from progress.', 'Earlier round.']);
  });
});
