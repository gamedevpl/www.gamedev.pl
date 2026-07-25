// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { startVisitTracking, type WireVisitEvent } from './visitTelemetry';

/**
 * The wiring half of visit tracking, which the pure-function tests cannot reach.
 *
 * Worth its own DOM file because the failure mode here is silent: a tracker that
 * listens for the wrong navigation signal still starts, still sends its first event,
 * and still looks healthy — it simply never records a second step, so every funnel
 * reads as "everyone bounced". Only driving real navigation catches that.
 */

let teardown: (() => void) | null = null;

afterEach(() => {
  teardown?.();
  teardown = null;
  window.sessionStorage.clear();
});

/** Narrows to the route events, so `route` can be read without a cast. */
function routeViews(events: WireVisitEvent[]) {
  return events.filter((event): event is Extract<WireVisitEvent, { type: 'route_viewed' }> => {
    return event.type === 'route_viewed';
  });
}

function trackerOver(startPath: string) {
  window.history.replaceState(null, '', startPath);
  const batches: { events: WireVisitEvent[] }[] = [];
  teardown = startVisitTracking({ send: (body) => void batches.push(body) });
  const events = () => batches.flatMap((batch) => batch.events);
  return { batches, events };
}

describe('startVisitTracking', () => {
  it('records the landing route a shared game link arrives on', () => {
    const { events } = trackerOver('/play/arena-tag');
    expect(events()).toEqual([expect.objectContaining({ type: 'visit_started', entry: 'play' })]);
  });

  it('records in-app navigation, which is pushState and fires no event of its own', () => {
    const { events } = trackerOver('/');

    window.history.pushState(null, '', '/play/arena-tag');
    window.history.pushState(null, '', '/privacy');
    teardown?.();
    teardown = null;

    expect(events().map((event) => event.type)).toEqual(['visit_started', 'route_viewed', 'route_viewed']);
    expect(routeViews(events()).map((event) => event.route)).toEqual(['play', 'legal']);
  });

  it('does not count movement within one kind as a funnel step', () => {
    const { events } = trackerOver('/');

    window.history.pushState(null, '', '/play/arena-tag');
    window.history.pushState(null, '', '/play/tactics-duel');
    teardown?.();
    teardown = null;

    expect(events().filter((event) => event.type === 'route_viewed')).toHaveLength(1);
  });

  it('restores the original pushState on teardown', () => {
    const before = window.history.pushState;
    trackerOver('/');
    expect(window.history.pushState).not.toBe(before);
    teardown?.();
    teardown = null;
    expect(window.history.pushState).toBe(before);
  });

  it('starts one visit per tab, not one per page load', () => {
    const first = trackerOver('/');
    teardown?.();
    teardown = null;
    expect(first.events().some((event) => event.type === 'visit_started')).toBe(true);

    // A reload: same tab, same sessionStorage, so the visit continues rather than
    // restarting — otherwise a refresh would invent a second visit and halve depth.
    const second = trackerOver('/');
    expect(second.events().some((event) => event.type === 'visit_started')).toBe(false);
  });

  it('never puts a capability token on the wire', () => {
    const { events } = trackerOver('/status/secret-capability-token');
    expect(JSON.stringify(events())).not.toContain('secret-capability-token');
  });
});
