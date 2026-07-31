// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { GrowthPanel } from './GrowthPanel.js';
import { computeGrowthReading } from './growthReading.js';
import type { CreatorsResponse, HealthResponse, VisitsResponse } from './healthApi.js';

/**
 * k is the number a monthly business decision is made on, so the failures worth covering
 * are the ones that make it lie confidently: a missing term collapsing to 0 instead of —,
 * and a k over three creators reading like a measurement.
 */

function healthWith(sessions: number[]): HealthResponse {
  return {
    days: ['2026-07-29'],
    truncated: false,
    games: sessions.map((count, index) => ({
      slug: `game-${index}`,
      sessions: count,
      bounces: 0,
      closes: 0,
      medianPlaySeconds: 60,
      totalPlaySeconds: 600,
      errors: 0,
      errorSamples: [],
      aliveTicks: 0,
      stalledTicks: 0,
      stallRate: 0,
      medianFps: null,
      resumeTicksIgnored: 0,
      outcomes: { won: 0, lost: 0, quit: 0 },
      sessionsWithEnding: 0,
      finishRate: 0,
      winRate: null,
      medianBestScore: null,
      progressLabels: [],
      gfxBackends: { canvas2d: 0, webgl: 0, webgl3d: 0 },
    })),
  };
}

function visitsWith({ visitsWithPlay, submitted }: { visitsWithPlay: number; submitted: number }): VisitsResponse {
  return {
    days: ['2026-07-29'],
    truncated: false,
    funnel: {
      visits: visitsWithPlay * 2,
      bounces: 0,
      visitsWithPlay,
      plays: visitsWithPlay,
      depth: [],
      medianPlaysPerPlayingVisit: 1,
      timeToFirstPlay: [],
      medianSecondsToFirstPlay: 10,
      entries: [],
      referrers: [],
      campaigns: [],
      creating: [
        { step: 'prompt_started', visits: submitted * 2 },
        { step: 'submission_created', visits: submitted },
      ],
      waitlist: [],
    },
  };
}

function creatorsWith(metrics: Partial<CreatorsResponse['metrics']> = {}): CreatorsResponse {
  return {
    sampled: 30,
    metrics: {
      published: 50,
      eligibleForReturn: 25,
      returnedWithin7Days: 10,
      d7ReturnRate: 0.4,
      medianBuildMinutes: 45,
      p90BuildMinutes: 90,
      creators: 25,
      gamesPerCreator: 2,
      ...metrics,
    },
  };
}

function render(health: HealthResponse, visits: VisitsResponse, creators: CreatorsResponse): string {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => {
    createRoot(host).render(createElement(GrowthPanel, { health, visits, creators }));
  });
  return host.textContent ?? '';
}

describe('computeGrowthReading', () => {
  it('multiplies the four terms', () => {
    // 2 games/creator × (500 sessions / 50 published = 10 plays/game) × (20/100 played→
    // submitted) × 0.4 D7 = 1.6
    const reading = computeGrowthReading(
      healthWith([300, 200]),
      visitsWith({ visitsWithPlay: 100, submitted: 20 }),
      creatorsWith(),
    );
    expect(reading.playsPerPublishedGame).toBe(10);
    expect(reading.playToCreate).toBe(0.2);
    expect(reading.k).toBeCloseTo(1.6);
    expect(reading.amplifier).toBeNull();
  });

  it('reports the amplifier below 1', () => {
    const reading = computeGrowthReading(
      healthWith([50]),
      visitsWith({ visitsWithPlay: 100, submitted: 20 }),
      creatorsWith(),
    );
    // 2 × 1 × 0.2 × 0.4 = 0.16 → 1/(1−0.16)
    expect(reading.k).toBeCloseTo(0.16);
    expect(reading.amplifier).toBeCloseTo(1 / 0.84);
  });

  it('keeps k null when a term has no evidence, rather than treating it as zero', () => {
    const reading = computeGrowthReading(
      healthWith([50]),
      visitsWith({ visitsWithPlay: 100, submitted: 20 }),
      creatorsWith({ d7ReturnRate: null }),
    );
    expect(reading.k).toBeNull();
    expect(reading.missing).toEqual(['D7 return']);
  });

  it('treats a playless window over a published catalog as a measured zero', () => {
    const reading = computeGrowthReading(
      healthWith([]),
      visitsWith({ visitsWithPlay: 100, submitted: 20 }),
      creatorsWith(),
    );
    expect(reading.playsPerPublishedGame).toBe(0);
    expect(reading.k).toBe(0);
  });
});

describe('GrowthPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders k beside its four terms', () => {
    const text = render(healthWith([300, 200]), visitsWith({ visitsWithPlay: 100, submitted: 20 }), creatorsWith());
    expect(text).toContain('1.60');
    expect(text).toContain('retained creators per retained creator');
    expect(text).toContain('sustains itself');
  });

  it('shows a dash and names the missing term instead of a confident 0', () => {
    const text = render(
      healthWith([50]),
      visitsWith({ visitsWithPlay: 100, submitted: 20 }),
      creatorsWith({ d7ReturnRate: null }),
    );
    expect(text).toContain('—k — retained creators');
    expect(text).toContain('no evidence for: D7 return');
  });

  it('flags a small cohort as low confidence rather than presenting a measurement', () => {
    const text = render(
      healthWith([50]),
      visitsWith({ visitsWithPlay: 100, submitted: 20 }),
      creatorsWith({ eligibleForReturn: 3 }),
    );
    expect(text).toContain('Low confidence');
    expect(text).toContain('3 creators past the 7-day mark');
  });
});
