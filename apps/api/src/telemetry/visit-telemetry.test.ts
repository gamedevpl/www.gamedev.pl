import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';

const sessionSecret = 'dev-session-secret-change-me';
const visitId = '00000000-0000-4000-8000-000000000000';

function authHeaders(uid = 'g:me') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

function post(app: Awaited<ReturnType<typeof buildApp>>, payload: unknown, headers = authHeaders()) {
  return app.inject({ method: 'POST', url: '/api/telemetry/visit', payload: payload as object, headers });
}

const today = () => new Date().toISOString().slice(0, 10);

describe('POST /api/telemetry/visit', () => {
  let store: InMemoryStore;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me' });
    app = await buildApp({ store, sessionSecret });
  });

  it('records a landing with its acquisition context', async () => {
    const response = await post(app, {
      visitId,
      flushMsSinceStart: 10,
      events: [
        {
          type: 'visit_started',
          entry: 'play',
          referrer: 'news.ycombinator.com',
          utmSource: 'hn',
          msSinceStart: 0,
        },
      ],
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 1 });

    const events = await store.listVisitEvents(today());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      visitId,
      type: 'visit_started',
      entry: 'play',
      referrer: 'news.ycombinator.com',
      utmSource: 'hn',
    });
  });

  it('answers session depth: several plays under one visit id', async () => {
    await post(app, {
      visitId,
      flushMsSinceStart: 300,
      events: [
        { type: 'visit_started', entry: 'home', msSinceStart: 0 },
        { type: 'play_started', msSinceStart: 100 },
        { type: 'route_viewed', route: 'home', msSinceStart: 200 },
        { type: 'play_started', msSinceStart: 300 },
      ],
    });

    const events = await store.listVisitEvents(today(), { visitId });
    expect(events.filter((event) => event.type === 'play_started')).toHaveLength(2);
  });

  it('records how_to_play_opened as itself, with via, and without a game identity', async () => {
    // Proves how_to_play_opened survives rather than collapsing into play_started.
    await post(app, {
      visitId,
      flushMsSinceStart: 400,
      events: [
        { type: 'play_started', msSinceStart: 100 },
        { type: 'how_to_play_opened', via: 'bar', slug: 'space-hop', msSinceStart: 400 },
      ],
    });

    const events = await store.listVisitEvents(today(), { visitId });
    const opened = events.filter((event) => event.type === 'how_to_play_opened');
    expect(opened).toHaveLength(1);
    expect(opened[0]?.via).toBe('bar');
    expect(events.filter((event) => event.type === 'play_started')).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('space-hop');
  });

  it('accepts a how_to_play_opened without via from a previous client', async () => {
    await post(app, {
      visitId,
      flushMsSinceStart: 200,
      events: [{ type: 'how_to_play_opened', msSinceStart: 200 }],
    });

    const events = await store.listVisitEvents(today(), { visitId });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('how_to_play_opened');
    expect(events[0]).not.toHaveProperty('via');
  });

  it('stores reopen: true on a same-card how_to_play_opened', async () => {
    await post(app, {
      visitId,
      flushMsSinceStart: 500,
      events: [
        { type: 'how_to_play_opened', via: 'bar', msSinceStart: 100 },
        { type: 'how_to_play_opened', via: 'bar', reopen: true, msSinceStart: 500 },
      ],
    });

    const events = await store.listVisitEvents(today(), { visitId });
    expect(events).toHaveLength(2);
    expect(events[0]).not.toHaveProperty('reopen');
    expect(events[1]?.reopen).toBe(true);
  });

  it('never stores a game identity, even if a client sends one', async () => {
    await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', slug: 'space-hop', msSinceStart: 0 }],
    });

    const events = await store.listVisitEvents(today());
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty('slug');
  });

  it('records which home-page surface produced a play, and rejects one outside the enum', async () => {
    const ok = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', via: 'rail_continue', msSinceStart: 0 }],
    });
    expect(ok.statusCode).toBe(202);
    expect((await store.listVisitEvents(today()))[0]).toMatchObject({
      type: 'play_started',
      via: 'rail_continue',
    });

    const bad = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', via: 'not_a_real_surface', msSinceStart: 0 }],
    });
    expect(bad.statusCode).toBe(400);
  });

  it('accepts a play_started without via — every play entry point this dimension does not cover yet', async () => {
    const ok = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', msSinceStart: 0 }],
    });
    expect(ok.statusCode).toBe(202);

    const events = await store.listVisitEvents(today());
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty('via');
  });

  it('dates events from their own offsets rather than collapsing onto the flush', async () => {
    await post(app, {
      visitId,
      flushMsSinceStart: 60_000,
      events: [
        { type: 'visit_started', entry: 'home', msSinceStart: 0 },
        { type: 'play_started', msSinceStart: 60_000 },
      ],
    });

    // 60s backdate can put event 0 on yesterday near UTC midnight.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const events = [
      ...(await store.listVisitEvents(today(), { visitId })),
      ...(await store.listVisitEvents(yesterday, { visitId })),
    ];
    expect(events).toHaveLength(2);
    const [first, second] = events.sort((a, b) => a.msSinceStart - b.msSinceStart);
    expect(Date.parse(second!.at) - Date.parse(first!.at)).toBe(60_000);
  });

  it('rejects a malformed visit id', async () => {
    const response = await post(app, {
      visitId: 'not-a-uuid',
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', msSinceStart: 0 }],
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an unknown event type', async () => {
    const response = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'signed_in', msSinceStart: 0 }],
    });
    expect(response.statusCode).toBe(400);
  });

  it('accepts the SPA notFound route kind', async () => {
    const response = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [
        { type: 'visit_started', entry: 'notFound', msSinceStart: 0 },
        { type: 'route_viewed', route: 'notFound', msSinceStart: 10 },
      ],
    });
    expect(response.statusCode).toBe(202);
    const events = await store.listVisitEvents(today(), { visitId });
    expect(events.map((event) => event.type)).toEqual(['visit_started', 'route_viewed']);
    expect(events[0]).toMatchObject({ type: 'visit_started', entry: 'notFound' });
    expect(events[1]).toMatchObject({ type: 'route_viewed', route: 'notFound' });
  });

  it('rejects acquisition values that could carry personal data', async () => {
    const response = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'visit_started', entry: 'home', referrer: 'https://x.com/u?token=secret', msSinceStart: 0 }],
    });
    expect(response.statusCode).toBe(400);

    const utm = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'visit_started', entry: 'home', utmSource: 'me@example.com', msSinceStart: 0 }],
    });
    expect(utm.statusCode).toBe(400);
  });

  it('records a creation step and rejects one outside the enum', async () => {
    const ok = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'create_step', step: 'signin_required', msSinceStart: 0 }],
    });
    expect(ok.statusCode).toBe(202);
    expect((await store.listVisitEvents(today()))[0]).toMatchObject({
      type: 'create_step',
      step: 'signin_required',
    });

    // A closed enum, like every other field that reaches a grouping key.
    const bad = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'create_step', step: 'gave_us_money', msSinceStart: 0 }],
    });
    expect(bad.statusCode).toBe(400);
  });

  it('records bounded completion health without source identity', async () => {
    const response = await post(app, {
      visitId,
      flushMsSinceStart: 900,
      events: [
        {
          type: 'code_completion',
          kind: 'language_service',
          outcome: 'shown',
          latencyMs: 123,
          candidateCount: 8,
          msSinceStart: 800,
        },
        {
          type: 'code_completion',
          kind: 'ghost_text',
          outcome: 'empty',
          latencyMs: 456,
          completionChars: 0,
          msSinceStart: 900,
        },
      ],
    });

    expect(response.statusCode).toBe(202);
    const events = await store.listVisitEvents(today(), { visitId });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'code_completion',
        kind: 'language_service',
        outcome: 'shown',
        latencyMs: 123,
        candidateCount: 8,
      }),
      expect.objectContaining({
        type: 'code_completion',
        kind: 'ghost_text',
        outcome: 'empty',
        latencyMs: 456,
        completionChars: 0,
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain('path');
    expect(JSON.stringify(events)).not.toContain('slug');
  });

  it('records a waitlist step and rejects one outside the enum', async () => {
    const ok = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'waitlist_step', step: 'cta_clicked', msSinceStart: 0 }],
    });
    expect(ok.statusCode).toBe(202);
    expect((await store.listVisitEvents(today()))[0]).toMatchObject({
      type: 'waitlist_step',
      step: 'cta_clicked',
    });

    const bad = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'waitlist_step', step: 'emailed_us', msSinceStart: 0 }],
    });
    expect(bad.statusCode).toBe(400);
  });

  it('records invite steps and rejects an unknown invite outcome', async () => {
    const ok = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'invite_step', step: 'opened', msSinceStart: 0 }],
    });
    expect(ok.statusCode).toBe(202);
    expect((await store.listVisitEvents(today()))[0]).toMatchObject({
      type: 'invite_step',
      step: 'opened',
    });

    const bad = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'invite_step', step: 'claimed_twice', msSinceStart: 0 }],
    });
    expect(bad.statusCode).toBe(400);
  });

  it('records beta welcome steps and rejects an unknown outcome', async () => {
    const ok = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'beta_welcome_step', step: 'shown', msSinceStart: 0 }],
    });
    expect(ok.statusCode).toBe(202);
    expect((await store.listVisitEvents(today()))[0]).toMatchObject({
      type: 'beta_welcome_step',
      step: 'shown',
    });

    const bad = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'beta_welcome_step', step: 'opened', msSinceStart: 0 }],
    });
    expect(bad.statusCode).toBe(400);
  });

  it('carries which control opened a remix, and refuses a control it does not know', async () => {
    const ok = await post(app, {
      visitId,
      flushMsSinceStart: 30_000,
      events: [
        { type: 'remix_step', step: 'offered', msSinceStart: 0 },
        { type: 'remix_step', step: 'opened', control: 'page', msSinceStart: 28_000 },
      ],
    });
    expect(ok.statusCode).toBe(202);
    const stored = await store.listVisitEvents(today());
    expect(stored[0]).toMatchObject({ type: 'remix_step', step: 'offered' });
    expect(stored[1]).toMatchObject({ type: 'remix_step', step: 'opened', control: 'page', msSinceStart: 28_000 });

    // Closed enum, like every other value that reaches a grouping key on an
    // endpoint anyone can reach.
    const bad = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'remix_step', step: 'opened', control: 'floating_pill', msSinceStart: 0 }],
    });
    expect(bad.statusCode).toBe(400);
  });

  it('records a studio step with builder (and optional detail) and rejects bad enums', async () => {
    const ok = await post(app, {
      visitId,
      flushMsSinceStart: 12_000,
      events: [
        { type: 'studio_step', step: 'builder_chosen', builder: 'self', msSinceStart: 100 },
        {
          type: 'studio_step',
          step: 'connect_copied',
          builder: 'self',
          detail: 'kickoff',
          msSinceStart: 200,
        },
        {
          type: 'studio_step',
          step: 'connect_deeplink',
          builder: 'self',
          detail: 'cursor',
          msSinceStart: 250,
        },
        {
          type: 'studio_step',
          step: 'connect_copied',
          builder: 'self',
          detail: 'header',
          msSinceStart: 260,
        },
        { type: 'studio_step', step: 'connect_dismissed', builder: 'self', msSinceStart: 270 },
        { type: 'studio_step', step: 'connect_restored', builder: 'self', msSinceStart: 280 },
        { type: 'studio_step', step: 'agent_signaled', builder: 'self', msSinceStart: 12_000 },
        {
          type: 'studio_step',
          step: 'gate_verdict',
          builder: 'platform',
          detail: 'green',
          msSinceStart: 20_000,
        },
        {
          type: 'create_step',
          step: 'submission_created',
          builder: 'self',
          msSinceStart: 50,
        },
      ],
    });
    expect(ok.statusCode).toBe(202);
    const events = await store.listVisitEvents(today(), { visitId });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'studio_step', step: 'builder_chosen', builder: 'self' }),
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
          step: 'connect_copied',
          builder: 'self',
          detail: 'header',
        }),
        expect.objectContaining({
          type: 'studio_step',
          step: 'connect_dismissed',
          builder: 'self',
        }),
        expect.objectContaining({
          type: 'studio_step',
          step: 'connect_restored',
          builder: 'self',
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
          builder: 'platform',
          detail: 'green',
        }),
        expect.objectContaining({
          type: 'create_step',
          step: 'submission_created',
          builder: 'self',
        }),
      ]),
    );

    const badStep = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'studio_step', step: 'hacked', builder: 'self', msSinceStart: 0 }],
    });
    expect(badStep.statusCode).toBe(400);

    const missingBuilder = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'studio_step', step: 'builder_chosen', msSinceStart: 0 }],
    });
    expect(missingBuilder.statusCode).toBe(400);
  });

  it('rejects an oversized batch', async () => {
    const response = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: Array.from({ length: 26 }, () => ({ type: 'play_started', msSinceStart: 0 })),
    });
    expect(response.statusCode).toBe(400);
  });

  it('stops recording once a visit exhausts its ceiling', async () => {
    for (let batch = 0; batch < 9; batch += 1) {
      await post(app, {
        visitId,
        flushMsSinceStart: 0,
        events: Array.from({ length: 25 }, () => ({ type: 'play_started', msSinceStart: 0 })),
      });
    }

    const events = await store.listVisitEvents(today(), { visitId, limit: 10_000 });
    expect(events).toHaveLength(200);

    const overflow = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', msSinceStart: 0 }],
    });
    expect(overflow.json()).toEqual({ accepted: 0 });
  });

  it('keeps completion diagnostics in a separate per-visit lane', async () => {
    const completion = {
      type: 'code_completion' as const,
      kind: 'language_service' as const,
      outcome: 'empty' as const,
      latencyMs: 1,
      msSinceStart: 0,
    };
    for (let batch = 0; batch < 2; batch += 1) {
      const response = await post(app, {
        visitId,
        flushMsSinceStart: 0,
        events: Array.from({ length: 25 }, () => completion),
      });
      expect(response.json()).toEqual({ accepted: 25 });
    }

    const completionOverflow = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [completion],
    });
    expect(completionOverflow.json()).toEqual({ accepted: 0 });

    const core = await post(app, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', msSinceStart: 0 }],
    });
    expect(core.json()).toEqual({ accepted: 1 });
    expect(await store.listVisitEvents(today(), { visitId })).toHaveLength(51);
  });

  it('never fails a visit when the store is unhappy', async () => {
    const failing = new InMemoryStore();
    await failing.upsertUser({ uid: 'g:me' });
    failing.appendVisitEvents = async () => {
      throw new Error('firestore is sad');
    };
    const failingApp = await buildApp({ store: failing, sessionSecret });

    const response = await post(failingApp, {
      visitId,
      flushMsSinceStart: 0,
      events: [{ type: 'play_started', msSinceStart: 0 }],
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 0 });
  });
});

describe('POST /api/telemetry/visit under private beta', () => {
  // The first minute of a visit — the entire point of this stream — happens *before*
  // sign-in for most visitors: during closed beta that is the "please sign in" splash
  // itself. If the beta wall ever swallowed this route the way it deliberately does
  // play telemetry, every anonymous arrival would silently 401 (the client swallows
  // the failure by design) and the acquisition funnel would read as "nobody visits"
  // without anyone noticing. This is the regression test for that specific failure.
  const previousPrivateBeta = process.env.PRIVATE_BETA;

  beforeEach(() => {
    process.env.PRIVATE_BETA = 'true';
  });

  afterEach(() => {
    if (previousPrivateBeta === undefined) delete process.env.PRIVATE_BETA;
    else process.env.PRIVATE_BETA = previousPrivateBeta;
  });

  it('accepts a visit_started event with no session at all', async () => {
    const app = await buildApp({ store: new InMemoryStore(), sessionSecret });

    const response = await app.inject({
      method: 'POST',
      url: '/api/telemetry/visit',
      // No auth headers: this is the anonymous, pre-sign-in visitor the wall must
      // never see, because request.user is never read by this route.
      payload: {
        visitId,
        flushMsSinceStart: 0,
        events: [{ type: 'visit_started', entry: 'home', msSinceStart: 0 }],
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 1 });
  });
});
