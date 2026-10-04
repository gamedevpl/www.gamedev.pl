export const FRAME_BOUNDS_MS = [17, 25, 34, 50, 100, 250, 1000] as const;
export type DeviceClass = 'phone' | 'tablet' | 'desktop' | 'unknown';
export type SystemFamily = 'android' | 'ios' | 'macos' | 'windows' | 'linux' | 'unknown';
export type BrowserFamily = 'chrome' | 'safari' | 'firefox' | 'edge' | 'unknown';

export interface PlayDevice {
  deviceClass: DeviceClass;
  system: SystemFamily;
  browser: BrowserFamily;
  browserMajor?: number;
  screenWidth?: number;
  screenHeight?: number;
  displayDpr?: number;
  cpuBucket?: number;
  memoryBucket?: number;
}

export interface FramePerformance {
  version: 1;
  source: 'raf';
  valid: boolean;
  elapsedMs: number;
  intervals: number[];
  maxGapMs: number;
  viewportWidth: number;
  viewportHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  canvasCssWidth: number;
  canvasCssHeight: number;
  dpr: number;
  orientation: 'portrait' | 'landscape';
  state: 'playing' | 'paused' | 'menu' | 'won' | 'lost' | 'unknown';
  gfxBackend?: 'canvas2d' | 'webgl' | 'webgl3d';
  renderedFrames?: number;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function number(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.includes(value as T);
}

export function normalizePlayDevice(value: unknown): PlayDevice | undefined {
  const v = object(value);
  if (
    !v ||
    !choice(v.deviceClass, ['phone', 'tablet', 'desktop', 'unknown']) ||
    !choice(v.system, ['android', 'ios', 'macos', 'windows', 'linux', 'unknown']) ||
    !choice(v.browser, ['chrome', 'safari', 'firefox', 'edge', 'unknown'])
  )
    return;
  return {
    deviceClass: v.deviceClass,
    system: v.system,
    browser: v.browser,
    ...(number(v.screenWidth, 1, 16384) && Number.isInteger(v.screenWidth) ? { screenWidth: v.screenWidth } : {}),
    ...(number(v.screenHeight, 1, 16384) && Number.isInteger(v.screenHeight) ? { screenHeight: v.screenHeight } : {}),
    ...(number(v.displayDpr, 0.25, 8) ? { displayDpr: v.displayDpr } : {}),
    ...(number(v.browserMajor, 1, 999) && Number.isInteger(v.browserMajor) ? { browserMajor: v.browserMajor } : {}),
    ...([1, 2, 4, 8, 16].includes(v.cpuBucket as number) ? { cpuBucket: v.cpuBucket as number } : {}),
    ...([0.25, 0.5, 1, 2, 4, 8].includes(v.memoryBucket as number) ? { memoryBucket: v.memoryBucket as number } : {}),
  };
}

export function normalizeFramePerformance(value: unknown): FramePerformance | undefined {
  const v = object(value);
  if (
    !v ||
    v.version !== 1 ||
    v.source !== 'raf' ||
    typeof v.valid !== 'boolean' ||
    !number(v.elapsedMs, 1, 11000) ||
    !number(v.maxGapMs, 0, 11000) ||
    !number(v.dpr, 0.25, 8) ||
    !choice(v.orientation, ['portrait', 'landscape']) ||
    !choice(v.state, ['playing', 'paused', 'menu', 'won', 'lost', 'unknown'])
  )
    return;
  const dimensions = [
    'viewportWidth',
    'viewportHeight',
    'canvasWidth',
    'canvasHeight',
    'canvasCssWidth',
    'canvasCssHeight',
  ] as const;
  if (dimensions.some((key) => !number(v[key], 0, 16384) || !Number.isInteger(v[key]))) return;
  if (
    !Array.isArray(v.intervals) ||
    v.intervals.length !== 8 ||
    v.intervals.some((n) => !number(n, 0, 100000) || !Number.isInteger(n)) ||
    v.intervals.reduce((a: number, b: number) => a + b, 0) > 100000
  )
    return;
  return {
    version: 1,
    source: 'raf',
    valid: v.valid,
    elapsedMs: v.elapsedMs,
    intervals: [...v.intervals],
    maxGapMs: v.maxGapMs,
    viewportWidth: v.viewportWidth as number,
    viewportHeight: v.viewportHeight as number,
    canvasWidth: v.canvasWidth as number,
    canvasHeight: v.canvasHeight as number,
    canvasCssWidth: v.canvasCssWidth as number,
    canvasCssHeight: v.canvasCssHeight as number,
    dpr: v.dpr,
    orientation: v.orientation,
    state: v.state,
    ...(choice(v.gfxBackend, ['canvas2d', 'webgl', 'webgl3d']) ? { gfxBackend: v.gfxBackend } : {}),
    ...(number(v.renderedFrames, 0, 100000) && Number.isInteger(v.renderedFrames)
      ? { renderedFrames: v.renderedFrames }
      : {}),
  };
}

export function normalizeArtifactVersion(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}

export interface FramePerformanceGroup {
  reviewer: boolean;
  slug: string;
  artifactVersion: string | null;
  device: PlayDevice | null;
  viewportWidth: number;
  viewportHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  canvasCssWidth: number;
  canvasCssHeight: number;
  dpr: number;
  orientation: FramePerformance['orientation'];
  state: FramePerformance['state'];
  gfxBackend: FramePerformance['gfxBackend'] | null;
  sessions: number;
  windows: number;
  observedMs: number;
  rafFps: number;
  renderedFps: number | null;
  p95GapUpperMs: number | null;
  p99GapUpperMs: number | null;
  maxGapMs: number;
  gapsOver100Ms: number;
  gapsOver250Ms: number;
  intervals: number[];
}
