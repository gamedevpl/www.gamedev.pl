import { expect, it } from 'vitest';
import { TelemetrySession, type TelemetrySend } from './telemetry.js';
it('stamps agent mode at event time rather than flush time', () => {
  const bodies: Parameters<TelemetrySend>[0][] = [];
  let agent = false;
  const s = new TelemetrySession(
    'space-hop',
    'session',
    (body) => bodies.push(body),
    () => 100,
    () => agent,
  );
  s.record({ type: 'game_opened' });
  agent = true;
  s.record({ type: 'alive', frames: 1 });
  agent = false;
  s.record({ type: 'alive', frames: 300 });
  s.flush();
  expect(bodies[0].events.map((e) => e.agentMode ?? false)).toEqual([false, true, false]);
});
