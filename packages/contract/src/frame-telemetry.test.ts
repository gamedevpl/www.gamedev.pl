import { describe, expect, it } from 'vitest';
import { normalizePlayDevice, normalizeFramePerformance } from './frame-telemetry.js';

export const sample = {
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

describe('frame telemetry normalization', () => {
  it('keeps bounded measurements and drops identifying extra fields', () => {
    expect(normalizeFramePerformance({ ...sample, userAgent: 'secret', uid: 'person' })).toEqual(sample);
    expect(
      normalizePlayDevice({
        deviceClass: 'phone',
        system: 'ios',
        browser: 'safari',
        browserMajor: 26,
        cpuBucket: 6,
        userAgent: 'secret',
      }),
    ).toEqual({
      deviceClass: 'phone',
      system: 'ios',
      browser: 'safari',
      browserMajor: 26,
    });
  });
  it('rejects malformed histograms, dimensions and non-finite values', () => {
    for (const change of [
      { intervals: [1] },
      { intervals: Array(8).fill(100000) },
      { intervals: [0, 0, 0, 0, 0, 0, 0, -1] },
      { canvasWidth: 20000 },
      { elapsedMs: Infinity },
      { dpr: NaN },
      { valid: 'yes' },
    ]) {
      expect(normalizeFramePerformance({ ...sample, ...change })).toBeUndefined();
    }
  });
});
