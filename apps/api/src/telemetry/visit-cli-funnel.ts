import { CLI_STEPS, type CliStep } from '@gamedevpl/contract';
import type { VisitEvent } from '../platform/store.js';

export function summarizeCliFunnel(events: readonly VisitEvent[]): Array<{ step: CliStep; visits: number }> {
  const byVisit = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.type !== 'cli_step' || !event.step) continue;
    const steps = byVisit.get(event.visitId) ?? new Set<string>();
    steps.add(event.step);
    byVisit.set(event.visitId, steps);
  }
  const rollups = Array.from(byVisit.values());
  return CLI_STEPS.map((step) => ({
    step,
    visits: rollups.filter((steps) => steps.has(step)).length,
  }));
}
