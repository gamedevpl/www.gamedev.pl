import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parsePathRoute } from './core/router.js';


vi.stubGlobal('crypto', webcrypto);
import { recordCliStep, setVisitSessionForTesting, VisitSession, type WireVisitEvent } from './visitTelemetry.js';
import { routeKind } from './visitRouteKind.js';

function capture() {
  const batches: { visitId: string; flushMsSinceStart: number; events: WireVisitEvent[] }[] = [];
  return { batches, send: (body: (typeof batches)[number]) => void batches.push(body) };
}

describe('cli reserved routes', () => {
  it('404s /cli so it cannot become a creator profile', () => {
    expect(parsePathRoute('/cli')).toEqual({ view: 'notFound' });
    expect(routeKind(parsePathRoute('/cli').view)).toBe('notFound');
  });
});

describe('recordCliStep', () => {
  it('records closed dimensions once per key and never a path or prompt', () => {
    const { batches, send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    setVisitSessionForTesting(session);

    recordCliStep({ step: 'installed', channel: 'curl', os: 'linux' });
    recordCliStep({ step: 'installed', channel: 'curl', os: 'linux' });
    recordCliStep({ step: 'delegate_used', adapter: 'claude' });
    recordCliStep({ step: 'delegate_used', adapter: 'codex' });
    recordCliStep({ step: 'verify_failed', stage: 'typecheck' });
    session.flush();
    setVisitSessionForTesting(null);

    const recorded = batches.flatMap((batch) => batch.events);
    expect(recorded).toEqual([
      expect.objectContaining({ type: 'cli_step', step: 'installed', channel: 'curl', os: 'linux' }),
      expect.objectContaining({ type: 'cli_step', step: 'delegate_used', adapter: 'claude' }),
      expect.objectContaining({ type: 'cli_step', step: 'delegate_used', adapter: 'codex' }),
      expect.objectContaining({ type: 'cli_step', step: 'verify_failed', stage: 'typecheck' }),
    ]);
    expect(JSON.stringify(recorded)).not.toMatch(/\/tmp\/|prompt|Ghost Roads/i);
  });

  it('is a silent no-op when tracking was never started', () => {
    setVisitSessionForTesting(null);
    expect(() => recordCliStep({ step: 'authorized' })).not.toThrow();
  });
});
