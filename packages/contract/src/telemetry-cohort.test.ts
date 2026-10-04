import { expect, it } from 'vitest';
import { selectTelemetryCohort } from './telemetry-cohort.js';
it('recognizes late role flags while retaining legacy sessions and separating game keys', () => {
  const events = [
    { key: 'a/1' },
    { key: 'a/1', reviewer: true },
    { key: 'b/1' },
    { key: 'c/2', agentMode: true },
    { key: 'c/2' },
  ];
  expect(selectTelemetryCohort(events, (e) => e.key)).toEqual([events[2]]);
  expect(selectTelemetryCohort(events, (e) => e.key, 'only')).toEqual(events.slice(0, 2));
  expect(selectTelemetryCohort(events, (e) => e.key, 'include', 'event')).toEqual([
    events[0],
    events[1],
    events[2],
    events[4],
  ]);
});
