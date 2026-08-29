import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parsePathRoute } from './core/router.js';

// vitest's node environment does not expose the webcrypto global that a real browser
// (and plain Node) provides, and `readVisitIdentity` relies on `crypto.randomUUID()`
// exactly as the browser does. Polyfilling it here — not in the shipped module — keeps
// production code assuming the real, always-present browser global.
vi.stubGlobal('crypto', webcrypto);
import {
  isPlayVia,
  readVisitIdentity,
  recordBetaInviteStep,
  recordBetaWelcomeStep,
  recordCodeCompletion,
  recordCreateStep,
  recordStudioStep,
  recordVisitEvent,
  recordWaitlistStep,
  referrerDomain,
  routeKind,
  sanitizeUtm,
  setVisitSessionForTesting,
  utmFields,
  VisitSession,
  type WireVisitEvent,
} from './visitTelemetry.js';

function capture() {
  const batches: { visitId: string; flushMsSinceStart: number; events: WireVisitEvent[] }[] = [];
  return { batches, send: (body: (typeof batches)[number]) => void batches.push(body) };
}

describe('referrerDomain', () => {
  it('reduces an external referrer to a bare hostname', () => {
    expect(referrerDomain('https://news.ycombinator.com/item?id=123', 'www.gamedev.pl')).toBe('news.ycombinator.com');
  });

  it('strips www so one site groups as one row', () => {
    expect(referrerDomain('https://www.reddit.com/r/webgames/', 'www.gamedev.pl')).toBe('reddit.com');
  });

  it('drops same-host referrers — internal navigation is not acquisition', () => {
    expect(referrerDomain('https://www.gamedev.pl/#/play/arena-tag', 'www.gamedev.pl')).toBeUndefined();
    expect(referrerDomain('https://gamedev.pl/', 'www.gamedev.pl')).toBeUndefined();
  });

  it('drops empty and unparseable referrers', () => {
    expect(referrerDomain('', 'www.gamedev.pl')).toBeUndefined();
    expect(referrerDomain('not a url', 'www.gamedev.pl')).toBeUndefined();
  });

  it('never carries the path or query of the referring page', () => {
    const domain = referrerDomain('https://x.com/someone/status/1?token=secret', 'www.gamedev.pl');
    expect(domain).toBe('x.com');
    expect(domain).not.toContain('secret');
  });
});

describe('sanitizeUtm', () => {
  it('accepts and normalizes plain campaign values', () => {
    expect(sanitizeUtm('  LinkedIn  ')).toBe('linkedin');
    expect(sanitizeUtm('summer_jam-2026')).toBe('summer_jam-2026');
  });

  it('rejects values that could smuggle an address or markup into an aggregate', () => {
    expect(sanitizeUtm('user@example.com')).toBeUndefined();
    expect(sanitizeUtm('<script>')).toBeUndefined();
    expect(sanitizeUtm('https://evil.example/path')).toBeUndefined();
  });

  it('returns nothing for absent or empty input', () => {
    expect(sanitizeUtm(null)).toBeUndefined();
    expect(sanitizeUtm('   ')).toBeUndefined();
  });

  it('caps length', () => {
    expect(sanitizeUtm('a'.repeat(200))).toHaveLength(40);
  });
});

describe('utmFields', () => {
  it('reads the three grouping fields and omits the rest', () => {
    expect(utmFields('?utm_source=linkedin&utm_medium=social&utm_campaign=beta&utm_term=ignored')).toEqual({
      utmSource: 'linkedin',
      utmMedium: 'social',
      utmCampaign: 'beta',
    });
  });

  it('omits fields entirely rather than sending empties', () => {
    expect(utmFields('?utm_source=x')).toEqual({ utmSource: 'x' });
    expect(utmFields('')).toEqual({});
  });
});

describe('isPlayVia', () => {
  it('accepts only the closed set of known values', () => {
    expect(isPlayVia('rail_party')).toBe(true);
    expect(isPlayVia('featured')).toBe(true);
  });

  it('rejects anything else, including URL-shaped noise', () => {
    expect(isPlayVia('unknown')).toBe(false);
    expect(isPlayVia('rail_party; DROP TABLE')).toBe(false);
    expect(isPlayVia(undefined)).toBe(false);
    expect(isPlayVia(42)).toBe(false);
  });
});

describe('routeKind', () => {
  it('maps known views to themselves', () => {
    expect(routeKind('play')).toBe('play');
    expect(routeKind('legal')).toBe('legal');
  });

  it('treats anything unrecognized as home', () => {
    expect(routeKind('')).toBe('home');
    expect(routeKind('nonsense')).toBe('home');
  });
});

describe('route kinds follow the real router', () => {
  // Routing moved from hash fragments to real paths (#230). An analytics module with
  // its own copy of the URL grammar would have gone on reporting `home` for every
  // visit after that change — including for shared game links, the one arrival this
  // whole stream exists to count. These assert the delegation, not the grammar.
  it.each([
    ['/', 'home'],
    ['/play/arena-tag', 'play'],
    ['/draft/space-hop', 'play'],
    ['/privacy', 'legal'],
    ['/terms', 'legal'],
    ['/contact', 'legal'],
    ['/status/some-token', 'studio'],
    ['/health', 'health'],
    ['/studio', 'studio'],
    ['/studio/some-token', 'studio'],
    ['/gtanczyk', 'legal'],
    ['/create', 'create'],
    // The public game page is its own acquisition bucket (funnel question 2). A
    // handle-shaped pair parses as one whether or not the game exists — same as a
    // profile URL for a handle nobody claimed reporting `legal`.
    ['/nightshift/neon-courier', 'game'],
    ['/nightshift/neon-courier/releases', 'game'],
    ['/nope/more', 'game'],
    // Reserved first segments never become game pages.
    ['/health/brick-storm', 'notFound'],
    ['/nope/more/than/three', 'notFound'],
  ])('reads %s as %s', (pathname, expected) => {
    expect(routeKind(parsePathRoute(pathname, '').view)).toBe(expected);
  });

  it('reduces a parameterized route to its kind, never its parameters', () => {
    const route = parsePathRoute('/status/secret-capability-token', '');
    const kind = routeKind(route.view);
    expect(kind).toBe('studio');
    expect(JSON.stringify(kind)).not.toContain('secret');
  });
});

describe('readVisitIdentity', () => {
  it('mints and persists an identity on a first visit', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const identity = readVisitIdentity(storage, 1000);
    expect(identity.isNew).toBe(true);
    expect(identity.startedAt).toBe(1000);
    expect(store.size).toBe(2);
  });

  it('reuses the stored identity and start time across a reload', () => {
    const store = new Map<string, string>([
      ['gdpl.visit.id', '11111111-1111-4111-8111-111111111111'],
      ['gdpl.visit.startedAt', '500'],
    ]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const identity = readVisitIdentity(storage, 9000);
    expect(identity.isNew).toBe(false);
    expect(identity.visitId).toBe('11111111-1111-4111-8111-111111111111');
    // The clock keeps running across the reload rather than restarting at zero.
    expect(identity.startedAt).toBe(500);
  });

  it('falls back to an in-memory identity when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
    };
    const identity = readVisitIdentity(storage, 42);
    expect(identity.isNew).toBe(true);
    expect(identity.visitId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('works with no storage at all', () => {
    expect(readVisitIdentity(null, 7).isNew).toBe(true);
  });
});

describe('VisitSession', () => {
  it('stamps each event with its own elapsed time, not the flush time', () => {
    const { batches, send } = capture();
    let now = 1000;
    const session = new VisitSession('v1', 1000, send, () => now);

    session.record({ type: 'visit_started', entry: 'home' });
    now = 4000;
    session.record({ type: 'play_started' });
    now = 5000;
    session.flush();

    expect(batches).toHaveLength(1);
    expect(batches[0].events.map((e) => e.msSinceStart)).toEqual([0, 3000]);
    expect(batches[0].flushMsSinceStart).toBe(4000);
  });

  it('flushes automatically once enough events are queued', () => {
    const { batches, send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    for (let i = 0; i < 5; i += 1) session.record({ type: 'route_viewed', route: 'home' });
    expect(batches).toHaveLength(1);
    expect(batches[0].events).toHaveLength(5);
  });

  it('stops accepting events past the per-visit ceiling', () => {
    const { send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    for (let i = 0; i < 250; i += 1) session.record({ type: 'play_started' });
    expect(session.count).toBe(200);
    expect(session.record({ type: 'play_started' })).toBe(false);
  });

  it('keeps completion diagnostics in a separate lane from core visit events', () => {
    const { send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    for (let i = 0; i < 50; i += 1) {
      session.record({
        type: 'code_completion',
        kind: 'language_service',
        outcome: 'empty',
        latencyMs: 1,
      });
    }

    expect(
      session.record({
        type: 'code_completion',
        kind: 'language_service',
        outcome: 'empty',
        latencyMs: 1,
      }),
    ).toBe(false);
    expect(session.record({ type: 'play_started' })).toBe(true);
    expect(session.count).toBe(51);
  });

  it('ignores events after close', () => {
    const { batches, send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    session.record({ type: 'play_started' });
    session.close();
    expect(session.record({ type: 'play_started' })).toBe(false);
    expect(batches).toHaveLength(1);
  });

  it('does not send an empty batch', () => {
    const { batches, send } = capture();
    new VisitSession('v1', 0, send, () => 0).flush();
    expect(batches).toHaveLength(0);
  });

  it('never carries a game identity on a play event', () => {
    const { batches, send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    session.record({ type: 'play_started' });
    session.flush();
    expect(Object.keys(batches[0].events[0])).toEqual(['type', 'msSinceStart']);
  });
});

describe('recordVisitEvent', () => {
  it('is a silent no-op when tracking was never started', () => {
    setVisitSessionForTesting(null);
    expect(() => recordVisitEvent({ type: 'play_started' })).not.toThrow();
  });

  it('reaches the installed session', () => {
    const { batches, send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    setVisitSessionForTesting(session);
    recordVisitEvent({ type: 'play_started' });
    session.flush();
    setVisitSessionForTesting(null);
    expect(batches[0].events[0].type).toBe('play_started');
  });
});

describe('recordCreateStep', () => {
  it('records each funnel step once per visit', () => {
    const { batches, send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    setVisitSessionForTesting(session);

    recordCreateStep('prompt_started');
    // Every keystroke calls this; only the first may count, or the top of the funnel
    // becomes a keystroke counter.
    recordCreateStep('prompt_started');
    recordCreateStep('spec_submitted');
    session.flush();
    setVisitSessionForTesting(null);

    expect(batches[0].events).toEqual([
      expect.objectContaining({ type: 'create_step', step: 'prompt_started' }),
      expect.objectContaining({ type: 'create_step', step: 'spec_submitted' }),
    ]);
  });

  it('is a silent no-op when tracking was never started', () => {
    setVisitSessionForTesting(null);
    expect(() => recordCreateStep('prompt_started')).not.toThrow();
  });

  it('starts a fresh set of steps for a new session', () => {
    const first = capture();
    const firstSession = new VisitSession('v1', 0, first.send, () => 0);
    setVisitSessionForTesting(firstSession);
    recordCreateStep('prompt_started');
    firstSession.flush();

    const second = capture();
    const secondSession = new VisitSession('v2', 0, second.send, () => 0);
    setVisitSessionForTesting(secondSession);
    recordCreateStep('prompt_started');
    secondSession.flush();
    setVisitSessionForTesting(null);

    // The second visit must record its own start; dedupe is per visit, not global.
    expect(second.batches[0].events).toHaveLength(1);
  });
});

describe('recordCodeCompletion', () => {
  it('clamps timing and optional counts before sending', () => {
    const { batches, send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    setVisitSessionForTesting(session);

    recordCodeCompletion({
      kind: 'language_service',
      outcome: 'shown',
      latencyMs: 30_001.4,
      candidateCount: 5_001.4,
      completionChars: -4,
    });
    session.flush();
    setVisitSessionForTesting(null);

    expect(batches[0].events).toEqual([
      {
        type: 'code_completion',
        kind: 'language_service',
        outcome: 'shown',
        latencyMs: 30_000,
        candidateCount: 5_000,
        completionChars: 0,
        msSinceStart: 0,
      },
    ]);
  });
});

describe('recordWaitlistStep', () => {
  it('records each waitlist step once per visit', () => {
    const { batches, send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    setVisitSessionForTesting(session);

    recordWaitlistStep('cta_clicked');
    recordWaitlistStep('cta_clicked');
    recordWaitlistStep('joined');
    session.flush();
    setVisitSessionForTesting(null);

    expect(batches[0].events).toEqual([
      expect.objectContaining({ type: 'waitlist_step', step: 'cta_clicked' }),
      expect.objectContaining({ type: 'waitlist_step', step: 'joined' }),
    ]);
  });

  it('is a silent no-op when tracking was never started', () => {
    setVisitSessionForTesting(null);
    expect(() => recordWaitlistStep('cta_clicked')).not.toThrow();
  });
});

describe('recordBetaInviteStep', () => {
  it('records invite outcomes once per visit', () => {
    const { batches, send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    setVisitSessionForTesting(session);

    recordBetaInviteStep('opened');
    recordBetaInviteStep('opened');
    recordBetaInviteStep('accepted');
    session.flush();
    setVisitSessionForTesting(null);

    expect(batches[0].events).toEqual([
      expect.objectContaining({ type: 'invite_step', step: 'opened' }),
      expect.objectContaining({ type: 'invite_step', step: 'accepted' }),
    ]);
  });
});

describe('recordBetaWelcomeStep', () => {
  it('records first-login welcome steps once per visit', () => {
    const { batches, send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    setVisitSessionForTesting(session);

    recordBetaWelcomeStep('shown');
    recordBetaWelcomeStep('shown');
    recordBetaWelcomeStep('continued');
    session.flush();
    setVisitSessionForTesting(null);

    expect(batches[0].events).toEqual([
      expect.objectContaining({ type: 'beta_welcome_step', step: 'shown' }),
      expect.objectContaining({ type: 'beta_welcome_step', step: 'continued' }),
    ]);
  });
});

describe('recordCreateStep builder dimension', () => {
  it('attaches an optional builder on create_step', () => {
    const { batches, send } = capture();
    const session = new VisitSession('v1', 0, send, () => 0);
    setVisitSessionForTesting(session);

    recordCreateStep('submission_created', 'self');
    session.flush();
    setVisitSessionForTesting(null);

    expect(batches[0].events).toEqual([
      expect.objectContaining({ type: 'create_step', step: 'submission_created', builder: 'self' }),
    ]);
  });
});

describe('recordStudioStep', () => {
  it('records studio funnel steps with a builder dimension, once per key', () => {
    const { batches, send } = capture();
    // Clock advances so agent_signaled's msSinceStart is time-to-first-signal.
    let now = 0;
    const session = new VisitSession('v1', 0, send, () => now);
    setVisitSessionForTesting(session);

    recordStudioStep('builder_chosen', 'self');
    recordStudioStep('builder_chosen', 'self');
    recordStudioStep('builder_chosen', 'platform');
    recordStudioStep('connect_copied', 'self', 'install');
    recordStudioStep('connect_copied', 'self', 'kickoff');
    recordStudioStep('connect_deeplink', 'self', 'cursor');
    recordStudioStep('connect_deeplink', 'self', 'vscode');
    now = 12_000;
    recordStudioStep('agent_signaled', 'self');
    recordStudioStep('agent_signaled', 'self');
    recordStudioStep('gate_verdict', 'self', 'red');
    session.flush();
    setVisitSessionForTesting(null);

    // Auto-flush at 5 may split the batch; gather every recorded event.
    const recorded = batches.flatMap((batch) => batch.events);
    expect(recorded).toEqual([
      expect.objectContaining({ type: 'studio_step', step: 'builder_chosen', builder: 'self' }),
      expect.objectContaining({ type: 'studio_step', step: 'builder_chosen', builder: 'platform' }),
      expect.objectContaining({
        type: 'studio_step',
        step: 'connect_copied',
        builder: 'self',
        detail: 'install',
      }),
      expect.objectContaining({
        type: 'studio_step',
        step: 'connect_copied',
        builder: 'self',
        detail: 'kickoff',
      }),
      expect.objectContaining({
        type: 'studio_step',
        step: 'connect_deeplink',
        builder: 'self',
        detail: 'cursor',
      }),
      expect.objectContaining({
        type: 'studio_step',
        step: 'connect_deeplink',
        builder: 'self',
        detail: 'vscode',
      }),
      expect.objectContaining({
        type: 'studio_step',
        step: 'agent_signaled',
        builder: 'self',
        msSinceStart: 12_000,
      }),
      expect.objectContaining({
        type: 'studio_step',
        step: 'gate_verdict',
        builder: 'self',
        detail: 'red',
      }),
    ]);
  });

  it('is a silent no-op when tracking was never started', () => {
    setVisitSessionForTesting(null);
    expect(() => recordStudioStep('builder_chosen', 'self')).not.toThrow();
  });
});

describe('sendVisitTelemetry', () => {
  it('swallows a rejected request so telemetry never surfaces as a failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const { sendVisitTelemetry } = await import('./visitTelemetry.js');
    expect(() => sendVisitTelemetry({ visitId: 'v1', flushMsSinceStart: 0, events: [] })).not.toThrow();
    vi.unstubAllGlobals();
  });
});
