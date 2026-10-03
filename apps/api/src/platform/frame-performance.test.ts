import { describe, expect, it } from 'vitest';
import { summarizeFramePerformance } from './frame-performance.js';
import type { TelemetryEvent } from './store.js';
import type { FramePerformance } from '@gamedevpl/contract';

const performance: FramePerformance = {
  version: 1,
  source: 'raf',
  valid: true,
  elapsedMs: 5000,
  intervals: [290, 0, 0, 0, 0, 2, 1, 0],
  maxGapMs: 400,
  viewportWidth: 390,
  viewportHeight: 844,
  canvasWidth: 1170,
  canvasHeight: 2532,
  canvasCssWidth: 390,
  canvasCssHeight: 844,
  dpr: 3,
  orientation: 'portrait',
  state: 'playing',
};
const event = (sessionId: string, fields: Partial<TelemetryEvent>): TelemetryEvent => ({
  slug: 'space-hop',
  sessionId,
  at: '2026-10-03T12:00:00Z',
  type: 'alive',
  frames: 300,
  ...fields,
});

describe('frame performance report', () => {
  it('separates device and buffer groups, counts stutters and retains unknown coverage', () => {
    const report = summarizeFramePerformance([
      event('phone', { type: 'game_opened', device: { deviceClass: 'phone', system: 'ios', browser: 'safari' } }),
      event('phone', { performance: { ...performance, renderedFrames: 150 } }),
      event('phone', { performance }),
      event('desktop', { performance: { ...performance, canvasWidth: 640, dpr: 1 } }),
      event('legacy', {}),
      event('paused', { performance: { ...performance, valid: false } }),
    ]);
    expect(report.measuredSessions).toBe(2);
    expect(report.unmeasuredSessions).toBe(2);
    expect(report.groups).toHaveLength(2);
    expect(report.groups[0]).toMatchObject({
      sessions: 1,
      windows: 2,
      rafFps: 60,
      renderedFps: 30,
      observedMs: 10000,
      gapsOver100Ms: 6,
      gapsOver250Ms: 2,
      p95GapUpperMs: 17,
    });
    expect(JSON.stringify(report)).not.toContain('sessionId');
  });
  it('keeps different artifacts separate and reports overflow percentiles without false precision', () => {
    const report = summarizeFramePerformance([
      event('a', { type: 'game_opened', artifactVersion: 'a'.repeat(64) }),
      event('b', { type: 'game_opened', artifactVersion: 'b'.repeat(64) }),
      event('a', { performance: { ...performance, intervals: [0, 0, 0, 0, 0, 0, 0, 3], maxGapMs: 2000 } }),
      event('b', { performance }),
    ]);
    expect(report.groups).toHaveLength(2);
    expect(report.groups[0].p95GapUpperMs).toBeNull();
    expect(report.groups[0].maxGapMs).toBe(2000);
  });
});
