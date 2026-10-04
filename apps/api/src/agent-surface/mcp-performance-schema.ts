import type { FramePerformanceGroup, GamePerformanceResponse } from '@gamedevpl/contract';

const count = { type: 'integer', minimum: 0 };
const number = { type: 'number', minimum: 0 };
const nullableNumber = { type: ['number', 'null'], minimum: 0 };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const string = { type: 'string' };
const boolean = { type: 'boolean' };
const groupProperties = {
  slug: string,
  reviewer: boolean,
  artifactVersion: { ...hash, type: ['string', 'null'] },
  device: {
    type: ['object', 'null'],
    properties: {
      deviceClass: { type: 'string', enum: ['phone', 'tablet', 'desktop', 'unknown'] },
      system: { type: 'string', enum: ['android', 'ios', 'macos', 'windows', 'linux', 'unknown'] },
      browser: { type: 'string', enum: ['chrome', 'safari', 'firefox', 'edge', 'unknown'] },
      browserMajor: count,
      screenWidth: count,
      screenHeight: count,
      displayDpr: number,
      cpuBucket: number,
      memoryBucket: number,
    },
    required: ['deviceClass', 'system', 'browser'],
  },
  viewportWidth: count,
  viewportHeight: count,
  canvasWidth: count,
  canvasHeight: count,
  canvasCssWidth: count,
  canvasCssHeight: count,
  dpr: number,
  orientation: { type: 'string', enum: ['portrait', 'landscape'] },
  state: { type: 'string', enum: ['playing', 'paused', 'menu', 'won', 'lost', 'unknown'] },
  gfxBackend: { type: ['string', 'null'], enum: ['canvas2d', 'webgl', 'webgl3d', null] },
  sessions: count,
  windows: count,
  observedMs: number,
  rafFps: number,
  renderedFps: { ...nullableNumber, description: 'Null when the optional presented-frame counter was absent.' },
  p95GapUpperMs: { ...nullableNumber, description: 'Histogram upper bound; null for empty or >1000ms bin.' },
  p99GapUpperMs: { ...nullableNumber, description: 'Histogram upper bound; null for empty or >1000ms bin.' },
  maxGapMs: number,
  gapsOver100Ms: count,
  gapsOver250Ms: count,
  intervals: {
    type: 'array',
    items: count,
    minItems: 8,
    maxItems: 8,
    description: 'Bins end at 17,25,34,50,100,250,1000ms,infinity.',
  },
} satisfies Record<keyof FramePerformanceGroup, unknown>;

const properties = {
  slug: string,
  requestedDays: { type: 'integer', minimum: 1, maximum: 30 },
  days: {
    type: 'array',
    items: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    description: 'Actually scanned UTC partitions, newest first.',
  },
  performanceReviewers: { type: 'string', enum: ['include', 'exclude', 'only'] },
  artifactVersion: { ...hash, type: ['string', 'null'] },
  availableVersions: { type: 'array', items: hash, maxItems: 100 },
  versionsTruncated: boolean,
  measuredAt: { type: 'string', format: 'date-time' },
  freshUntil: { type: 'string', format: 'date-time' },
  status: { type: 'string', enum: ['no_traffic', 'no_valid_windows', 'measured'] },
  scanTruncated: boolean,
  groupsTruncated: boolean,
  totalGroups: count,
  measuredSessions: count,
  unmeasuredSessions: count,
  invalidWindows: count,
  agentEventsExcluded: count,
  aliveWithoutPerformance: count,
  groups: {
    type: 'array',
    maxItems: 100,
    items: { type: 'object', properties: groupProperties, required: Object.keys(groupProperties) },
  },
} satisfies Record<keyof GamePerformanceResponse, unknown>;

export const GAME_PERFORMANCE_OUTPUT_SCHEMA = { type: 'object', properties, required: Object.keys(properties) };
