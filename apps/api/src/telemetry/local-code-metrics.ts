import type { VisitEvent } from '../store/records/telemetry.js';
import type { LocalCodeMetrics } from '@gamedevpl/contract';
export type { LocalCodeMetrics } from '@gamedevpl/contract';

export function summarizeLocalCodeMetrics(events: VisitEvent[]): LocalCodeMetrics {
  const steps = new Map<string, Set<string>>();
  const outcomes = { shown: 0, empty: 0, failed: 0, accepted: 0, dismissed: 0 };
  const latencies: number[] = [];
  for (const event of events) {
    if (event.codeSurface !== 'local_play') continue;
    if (event.type === 'code_step' && event.step) {
      const sessions = steps.get(event.step) ?? new Set<string>();
      sessions.add(event.visitId);
      steps.set(event.step, sessions);
    } else if (event.type === 'code_completion' && event.kind === 'ghost_text') {
      const outcome = event.outcome as keyof typeof outcomes;
      if (!(outcome in outcomes)) continue;
      outcomes[outcome]++;
      if (
        (outcome === 'shown' || outcome === 'empty' || outcome === 'failed') &&
        typeof event.latencyMs === 'number' &&
        Number.isFinite(event.latencyMs)
      )
        latencies.push(event.latencyMs);
    }
  }
  latencies.sort((a, b) => a - b);
  return {
    opened: steps.get('opened')?.size ?? 0,
    fileOpened: steps.get('file_opened')?.size ?? 0,
    edited: steps.get('edited')?.size ?? 0,
    typechecked: steps.get('typechecked')?.size ?? 0,
    conflicts: steps.get('conflict_seen')?.size ?? 0,
    ...outcomes,
    requests: outcomes.shown + outcomes.empty + outcomes.failed,
    medianLatencyMs: latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null,
    p90LatencyMs: latencies.length ? latencies[Math.ceil(latencies.length * 0.9) - 1] : null,
  };
}
