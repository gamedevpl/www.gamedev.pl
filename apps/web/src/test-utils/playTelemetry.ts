import type { FramePerformance } from '@gamedevpl/contract';
import type { MockInstance } from 'vitest';

export const performanceWindow: FramePerformance = {
  version: 1,
  source: 'raf',
  valid: true,
  elapsedMs: 5000,
  intervals: [300, 0, 0, 0, 0, 0, 0, 0],
  maxGapMs: 17,
  viewportWidth: 800,
  viewportHeight: 600,
  canvasWidth: 1600,
  canvasHeight: 1200,
  canvasCssWidth: 800,
  canvasCssHeight: 600,
  dpr: 2,
  orientation: 'landscape',
  state: 'playing',
  gfxBackend: 'webgl',
  renderedFrames: 300,
};

type PlayBatch = {
  slug: string;
  sessionId: string;
  events: { type: string; artifactVersion?: string; performance?: FramePerformance }[];
};

export function playBatches(fetchSpy: MockInstance<typeof globalThis.fetch>): PlayBatch[] {
  return fetchSpy.mock.calls
    .filter(([url]) => String(url) === '/api/telemetry')
    .map(([, init]) => JSON.parse(String(init?.body)) as PlayBatch);
}
