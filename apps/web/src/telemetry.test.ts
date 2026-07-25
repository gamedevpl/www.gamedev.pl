import { describe, expect, it, vi } from 'vitest';
import { isPlayTimeAccruing, TelemetrySession, type TelemetryEvent } from './telemetry';

function collector() {
  const batches: { slug: string; sessionId: string; events: TelemetryEvent[] }[] = [];
  return { batches, send: (body: { slug: string; sessionId: string; events: TelemetryEvent[] }) => batches.push(body) };
}

function newSession(send: ReturnType<typeof collector>['send']) {
  return new TelemetrySession('space-hop', '00000000-0000-4000-8000-000000000000', send);
}

describe('TelemetrySession batching', () => {
  it('holds events back until the flush threshold, then sends one batch', () => {
    const { batches, send } = collector();
    const session = newSession(send);

    for (let i = 0; i < 9; i++) session.record({ type: 'play_time', seconds: 15 });
    expect(batches).toHaveLength(0);

    session.record({ type: 'play_time', seconds: 15 });
    expect(batches).toHaveLength(1);
    expect(batches[0].events).toHaveLength(10);
    expect(batches[0].slug).toBe('space-hop');
  });

  it('flushes what is queued on close and ignores anything after', () => {
    const { batches, send } = collector();
    const session = newSession(send);

    session.record({ type: 'game_opened' });
    session.close();
    expect(batches).toHaveLength(1);
    expect(batches[0].events).toEqual([{ type: 'game_opened' }]);

    expect(session.record({ type: 'error', message: 'too late' })).toBe(false);
    expect(batches).toHaveLength(1);
  });

  it('does not send an empty batch', () => {
    const { batches, send } = collector();
    newSession(send).flush();
    expect(batches).toHaveLength(0);
  });
});

describe('TelemetrySession caps', () => {
  it('stops accepting events past the session ceiling', () => {
    const { send } = collector();
    const session = newSession(send);

    let accepted = 0;
    for (let i = 0; i < 500; i++) if (session.record({ type: 'alive', frames: 60 })) accepted++;

    expect(accepted).toBe(400);
    expect(session.count).toBe(400);
  });

  it('accepts repeats of a known progress label but caps distinct ones', () => {
    const { send } = collector();
    const session = newSession(send);

    for (let i = 0; i < 20; i++) expect(session.record({ type: 'progress', label: `level-${i}` })).toBe(true);
    // 21st distinct label is refused — a label flood is the DoS this guards.
    expect(session.record({ type: 'progress', label: 'level-99' })).toBe(false);
    // A repeat of an accepted label is still welcome: drop-off curves are made of them.
    expect(session.record({ type: 'progress', label: 'level-0' })).toBe(true);
  });

  it('truncates an error message and drops an empty one', () => {
    const { batches, send } = collector();
    const session = newSession(send);

    session.record({ type: 'error', message: 'x'.repeat(5000) });
    expect(session.record({ type: 'error', message: '   ' })).toBe(false);
    session.close();

    const [event] = batches[0].events;
    expect(event).toEqual({ type: 'error', message: 'x'.repeat(200) });
  });

  it('clamps out-of-range numbers instead of trusting the game', () => {
    const { batches, send } = collector();
    const session = newSession(send);

    session.record({ type: 'play_time', seconds: 999_999 });
    session.record({ type: 'game_opened', slots: 99 });
    session.close();

    expect(batches[0].events).toEqual([
      { type: 'play_time', seconds: 3600 },
      { type: 'game_opened', slots: 8 },
    ]);
  });

  it('rejects malformed events a hostile game could send', () => {
    const { send } = collector();
    const session = newSession(send);

    expect(session.record({ type: 'score', value: Number.NaN })).toBe(false);
    expect(session.record({ type: 'end', outcome: 'transcended' as 'won' })).toBe(false);
    expect(session.record({ type: 'play_time', seconds: 'lots' as unknown as number })).toBe(false);
    expect(session.record({ type: 'wat' as 'error', message: 'hi' } as TelemetryEvent)).toBe(false);
    expect(session.count).toBe(0);
  });
});

describe('isPlayTimeAccruing', () => {
  it('accrues only when the page is visible and holds focus', () => {
    expect(isPlayTimeAccruing({ visibilityState: 'visible', hasFocus: () => true })).toBe(true);
    // Focus inside the game's iframe still reports true on the top document, which is
    // exactly why hasFocus is the right gate for an opaque-origin frame.
    expect(isPlayTimeAccruing({ visibilityState: 'visible', hasFocus: () => false })).toBe(false);
    expect(isPlayTimeAccruing({ visibilityState: 'hidden', hasFocus: () => true })).toBe(false);
  });
});

describe('sendTelemetry', () => {
  it('posts with keepalive so the final flush survives the page closing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    const { sendTelemetry } = await import('./telemetry');

    sendTelemetry({ slug: 'space-hop', sessionId: 'sid', events: [{ type: 'game_closed' }] });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/telemetry'),
      expect.objectContaining({ method: 'POST', keepalive: true, credentials: 'include' }),
    );
    fetchSpy.mockRestore();
  });

  it('swallows a rejected request — telemetry never surfaces to the player', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { sendTelemetry } = await import('./telemetry');

    expect(() =>
      sendTelemetry({ slug: 'space-hop', sessionId: 'sid', events: [{ type: 'game_closed' }] }),
    ).not.toThrow();
    await Promise.resolve();
    fetchSpy.mockRestore();
  });
});
