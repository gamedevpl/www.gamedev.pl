import {
  selectTelemetryCohort,
  type ReviewerCohort,
  FRAME_BOUNDS_MS,
  type FramePerformanceGroup,
} from '@gamedevpl/contract';
import type { TelemetryEvent } from './store.js';

export interface PerformanceReport {
  groups: FramePerformanceGroup[];
  truncated: boolean;
  measuredSessions: number;
  unmeasuredSessions: number;
}

function percentileUpper(bins: number[], fraction: number): number | null {
  const count = bins.reduce((a, b) => a + b, 0);
  if (!count) return null;
  const target = Math.ceil(count * fraction);
  let seen = 0;
  for (let i = 0; i < bins.length; i++) {
    seen += bins[i];
    if (seen >= target) return FRAME_BOUNDS_MS[i] ?? null;
  }
  return null;
}

export function summarizeFramePerformance(
  events: TelemetryEvent[],
  cohort: ReviewerCohort = 'include',
): PerformanceReport {
  const sessionKey = (e: TelemetryEvent) => `${e.slug}/${e.sessionId}`;
  const reviewerSessions = new Set(events.filter((event) => event.reviewer === true).map(sessionKey));
  const opens = new Map<string, TelemetryEvent>();
  for (const event of events) if (event.type === 'game_opened') opens.set(sessionKey(event), event);
  events = selectTelemetryCohort(events, sessionKey, cohort, 'event');
  const allSessions = new Set(events.map(sessionKey));
  const measured = new Set<string>();
  const groups = new Map<
    string,
    { row: FramePerformanceGroup; sessions: Set<string>; frames: number; rendered: number; renderedMs: number }
  >();
  let truncated = false;
  for (const event of events) {
    const p = event.performance;
    if (event.type !== 'alive' || !p?.valid || p.elapsedMs <= 0) continue;
    const id = sessionKey(event);
    measured.add(id);
    const open = opens.get(id);
    const context = {
      reviewer: reviewerSessions.has(id),
      slug: event.slug,
      artifactVersion: open?.artifactVersion ?? null,
      device: open?.device ?? null,
      viewportWidth: p.viewportWidth,
      viewportHeight: p.viewportHeight,
      canvasWidth: p.canvasWidth,
      canvasHeight: p.canvasHeight,
      canvasCssWidth: p.canvasCssWidth,
      canvasCssHeight: p.canvasCssHeight,
      dpr: p.dpr,
      orientation: p.orientation,
      state: p.state,
      gfxBackend: p.gfxBackend ?? null,
    };
    const key = JSON.stringify(context);
    let group = groups.get(key);
    if (!group) {
      if (groups.size >= 2000) {
        truncated = true;
        continue;
      }
      group = {
        row: {
          ...context,
          sessions: 0,
          windows: 0,
          observedMs: 0,
          rafFps: 0,
          renderedFps: null,
          p95GapUpperMs: null,
          p99GapUpperMs: null,
          maxGapMs: 0,
          gapsOver100Ms: 0,
          gapsOver250Ms: 0,
          intervals: Array<number>(8).fill(0),
        },
        sessions: new Set(),
        frames: 0,
        rendered: 0,
        renderedMs: 0,
      };
      groups.set(key, group);
    }
    group.sessions.add(id);
    group.row.windows++;
    group.row.observedMs += p.elapsedMs;
    group.frames += event.frames ?? 0;
    if (p.renderedFrames !== undefined) {
      group.rendered += p.renderedFrames;
      group.renderedMs += p.elapsedMs;
    }
    group.row.maxGapMs = Math.max(group.row.maxGapMs, p.maxGapMs);
    p.intervals.forEach((n, i) => {
      group!.row.intervals[i] += n;
    });
  }
  return {
    truncated,
    measuredSessions: measured.size,
    unmeasuredSessions: allSessions.size - measured.size,
    groups: [...groups.values()].map(({ row, sessions, frames, rendered, renderedMs }) => ({
      ...row,
      sessions: sessions.size,
      rafFps: (frames * 1000) / row.observedMs,
      renderedFps: renderedMs ? (rendered * 1000) / renderedMs : null,
      p95GapUpperMs: percentileUpper(row.intervals, 0.95),
      p99GapUpperMs: percentileUpper(row.intervals, 0.99),
      gapsOver100Ms: row.intervals.slice(5).reduce((a, b) => a + b, 0),
      gapsOver250Ms: row.intervals.slice(6).reduce((a, b) => a + b, 0),
    })),
  };
}
