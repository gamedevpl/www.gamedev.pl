import { expect, it } from 'vitest';
import { summarizeLocalCodeMetrics } from './local-code-metrics.js';
import type { VisitEvent } from '../store/records/telemetry.js';

it('counts local editor sessions and ghost outcomes without conflating acceptances with requests or Studio', () => {
  const step = (visitId: string, step: string): VisitEvent => ({
    visitId,
    step,
    type: 'code_step',
    codeSurface: 'local_play',
    at: '2026-10-10T00:00:00Z',
    msSinceStart: 0,
  });
  const completion = (outcome: string, latencyMs = 0): VisitEvent => ({
    ...step('v1', ''),
    type: 'code_completion',
    kind: 'ghost_text',
    outcome,
    latencyMs,
  });
  const events = [
    step('v1', 'opened'),
    step('v1', 'opened'),
    step('v2', 'opened'),
    step('v1', 'conflict_seen'),
    completion('shown', 100),
    completion('shown', 300),
    completion('empty', 200),
    completion('accepted'),
    completion('dismissed'),
    { ...completion('failed'), codeSurface: 'studio' as const },
    { ...completion('shown'), kind: 'language_service' },
    { ...step('v3', 'opened'), codeSurface: undefined },
  ];
  expect(summarizeLocalCodeMetrics(events)).toEqual({
    opened: 2,
    fileOpened: 0,
    edited: 0,
    typechecked: 0,
    conflicts: 1,
    requests: 3,
    shown: 2,
    empty: 1,
    failed: 0,
    accepted: 1,
    dismissed: 1,
    medianLatencyMs: 200,
    p90LatencyMs: 300,
  });
});
