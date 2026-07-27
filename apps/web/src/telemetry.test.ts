import { describe, expect, it, vi } from 'vitest';
import {
  isPlayTimeAccruing,
  TelemetrySession,
  type TelemetryEvent,
  type TelemetrySend,
  type WireEvent,
} from './telemetry.js';

type Batch = { slug: string; sessionId: string; flushMsSinceOpen: number; events: WireEvent[] };

function collector() {
  const batches: Batch[] = [];
  const send: TelemetrySend = (body) => batches.push(body as Batch);
  return { batches, send };
}

function newSession(send: TelemetrySend, clock?: () => number) {
  return new TelemetrySession('space-hop', '00000000-0000-4000-8000-000000000000', send, clock);
}

/** Drops the wire-only offset so assertions can stay about the event itself. */
function payloads(events: WireEvent[]) {
  return events.map(({ msSinceOpen: _ignored, ...event }) => event);
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
    expect(payloads(batches[0].events)).toEqual([{ type: 'game_opened' }]);

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

    const [event] = payloads(batches[0].events);
    expect(event).toEqual({ type: 'error', message: 'x'.repeat(200) });
  });

  it('clamps out-of-range numbers instead of trusting the game', () => {
    const { batches, send } = collector();
    const session = newSession(send);

    session.record({ type: 'play_time', seconds: 999_999 });
    session.record({ type: 'game_opened', slots: 99 });
    session.close();

    expect(payloads(batches[0].events)).toEqual([
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

describe('TelemetrySession timing', () => {
  /** A controllable monotonic clock, standing in for performance.now(). */
  function fakeClock(start = 5_000) {
    const state = { ms: start };
    return { state, clock: () => state.ms };
  }

  it('stamps each event with its own age, not the flush time', () => {
    const { batches, send } = collector();
    const { state, clock } = fakeClock();
    const session = newSession(send, clock);

    session.record({ type: 'game_opened' });
    state.ms += 5_000;
    session.record({ type: 'alive', frames: 300 });
    state.ms += 10_000;
    session.record({ type: 'play_time', seconds: 15 });
    state.ms += 330_000; // the player tabs away five and a half minutes later
    session.close();

    expect(batches[0].events.map((event) => event.msSinceOpen)).toEqual([0, 5_000, 15_000]);
    // The flush is far later than anything in it — the gap the offsets exist to record.
    expect(batches[0].flushMsSinceOpen).toBe(345_000);
  });

  it('reports offsets from session open, so a late-starting session is not backdated', () => {
    const { batches, send } = collector();
    // A clock that is already far from zero: offsets are relative to construction.
    const { state, clock } = fakeClock(1_234_567);
    const session = newSession(send, clock);

    state.ms += 250;
    session.record({ type: 'game_opened' });
    session.flush();

    expect(batches[0].events[0].msSinceOpen).toBe(250);
  });

  it('never reports a negative offset if the clock misbehaves', () => {
    const { batches, send } = collector();
    const { state, clock } = fakeClock();
    const session = newSession(send, clock);

    state.ms -= 10_000;
    session.record({ type: 'game_opened' });
    session.flush();

    expect(batches[0].events[0].msSinceOpen).toBe(0);
    expect(batches[0].flushMsSinceOpen).toBe(0);
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
    const { sendTelemetry } = await import('./telemetry.js');

    sendTelemetry({
      slug: 'space-hop',
      sessionId: 'sid',
      flushMsSinceOpen: 0,
      events: [{ type: 'game_closed', msSinceOpen: 0 }],
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/telemetry'),
      expect.objectContaining({ method: 'POST', keepalive: true, credentials: 'include' }),
    );
    fetchSpy.mockRestore();
  });

  it('swallows a rejected request — telemetry never surfaces to the player', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { sendTelemetry } = await import('./telemetry.js');

    expect(() =>
      sendTelemetry({
        slug: 'space-hop',
        sessionId: 'sid',
        flushMsSinceOpen: 0,
        events: [{ type: 'game_closed', msSinceOpen: 0 }],
      }),
    ).not.toThrow();
    await Promise.resolve();
    fetchSpy.mockRestore();
  });
});
