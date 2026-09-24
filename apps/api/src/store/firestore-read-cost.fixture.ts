import type { FastifyInstance } from 'fastify';
import { mintToken } from '../platform/submission-token.js';
import { FirestoreStore } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';
import { createReadCostApp, seedReadCostFixture, sessionCookie } from './firestore-read-cost-setup.fixture.js';
import {
  ADMIN_UID,
  CREATOR_UID,
  DERIVED_OWNER_UID,
  POLLED_JOB_ID,
  POLLED_ROUTES,
  PRIOR_ROUNDS_JOB_ID,
  REVIEWER_UID,
  STALE_DISPATCH_JOB_ID,
  SUBMISSION_SECRET,
  type PolledRoute,
} from './firestore-read-cost-shape.fixture.js';

export * from './firestore-read-cost-shape.fixture.js';
export { createReadCostApp, seedReadCostFixture } from './firestore-read-cost-setup.fixture.js';

export interface RouteReadMeasurement {
  route: PolledRoute;
  reads: number;
  statusCode: number;
}

async function injectRoute(app: FastifyInstance, route: PolledRoute): Promise<{ statusCode: number }> {
  if (route === 'GET /api/submissions/:token') {
    const token = mintToken(POLLED_JOB_ID, SUBMISSION_SECRET);
    return app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (route === 'GET /api/submissions/:token (steady state)') {
    const token = mintToken(POLLED_JOB_ID, SUBMISSION_SECRET);
    return app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (
    route === 'GET /api/submissions/:token (prior rounds)' ||
    route === 'GET /api/submissions/:token (prior rounds, steady state)'
  ) {
    const token = mintToken(PRIOR_ROUNDS_JOB_ID, SUBMISSION_SECRET);
    return app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (route === 'POST /api/internal/notify-sweep (steady state)') {
    return app.inject({
      method: 'POST',
      url: '/api/internal/notify-sweep',
      headers: { authorization: 'Bearer sweep' },
    });
  }
  if (route === 'GET /api/admin/summary (steady state)') {
    return app.inject({ method: 'GET', url: '/api/admin/summary', headers: { cookie: sessionCookie(ADMIN_UID) } });
  }
  if (route === 'GET /api/submissions/:token (stale dispatch, steady state)') {
    const token = mintToken(STALE_DISPATCH_JOB_ID, SUBMISSION_SECRET);
    return app.inject({
      method: 'GET',
      url: `/api/submissions/${token}`,
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (route === 'GET /api/submissions/:token (share link, steady state)') {
    const token = mintToken(POLLED_JOB_ID, SUBMISSION_SECRET);
    return app.inject({ method: 'GET', url: `/api/submissions/${token}` });
  }
  if (route === 'GET /api/submissions/mine') {
    return app.inject({
      method: 'GET',
      url: '/api/submissions/mine',
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (route === 'GET /api/submissions/mine (document, steady state)') {
    return app.inject({
      method: 'GET',
      url: '/api/submissions/mine',
      headers: { cookie: sessionCookie(CREATOR_UID) },
    });
  }
  if (route === 'GET /api/submissions/mine (derived-only owner)') {
    return app.inject({
      method: 'GET',
      url: '/api/submissions/mine',
      headers: { cookie: sessionCookie(DERIVED_OWNER_UID) },
    });
  }
  if (route === 'GET /api/review/status') {
    return app.inject({
      method: 'GET',
      url: '/api/review/status',
      headers: { cookie: sessionCookie(REVIEWER_UID) },
    });
  }
  return app.inject({
    method: 'GET',
    url: '/api/notifications',
    headers: { cookie: sessionCookie(CREATOR_UID) },
  });
}

export async function measurePolledRoute(route: PolledRoute): Promise<RouteReadMeasurement> {
  const fake = fakeFirestore();
  const store = new FirestoreStore(fake.db);
  await seedReadCostFixture(store);
  // Moved by hand, so a poll can outlive a short cache.
  let clock = Date.now();
  const app = await createReadCostApp(store, () => clock);
  try {
    // A process verifies its first read; steady state is the second.
    if (route === 'GET /api/submissions/mine (document, steady state)') {
      await injectRoute(app, route);
    }
    // What a 3s poll costs with the route's caches warm.
    if (route === 'GET /api/submissions/:token (steady state)') {
      await injectRoute(app, route);
    }
    // The same poll with no session resolves no access.
    if (route === 'GET /api/submissions/:token (share link, steady state)') {
      await injectRoute(app, route);
    }
    // A stuck dispatch is polled for days; the second poll bills.
    if (route === 'GET /api/submissions/:token (stale dispatch, steady state)') {
      await injectRoute(app, route);
      // The production cadence: past a 2s cache, well inside a 60s one.
      clock += 4_000;
    }
    // The first call pays the backfill; a 30s poll does not.
    if (route === 'GET /api/admin/summary (steady state)') {
      await injectRoute(app, route);
      // Past the first hour, when an empty stamp is trusted.
      clock += 61 * 60_000;
    }
    // The first run derives every round; later runs defer the quiet ones.
    if (route === 'POST /api/internal/notify-sweep (steady state)') {
      await injectRoute(app, route);
      clock += 2 * 60_000;
    }
    // A later round polls its history; the first has none.
    if (route === 'GET /api/submissions/:token (prior rounds, steady state)') {
      await injectRoute(app, route);
    }
    fake.resetBilledReads();
    const res = await injectRoute(app, route);
    return { route, reads: fake.billedReads(), statusCode: res.statusCode };
  } finally {
    await app.close();
  }
}

export async function measurePolledRouteReads(): Promise<Record<PolledRoute, number>> {
  const measured = {} as Record<PolledRoute, number>;
  for (const route of POLLED_ROUTES) {
    const row = await measurePolledRoute(route);
    if (row.statusCode !== 200) {
      throw new Error(`${route} returned ${row.statusCode} (want 200)`);
    }
    measured[route] = row.reads;
  }
  return measured;
}

const invoked = process.argv[1] ?? '';
if (invoked.endsWith('firestore-read-cost.fixture.ts') || invoked.endsWith('firestore-read-cost.fixture.js')) {
  measurePolledRouteReads()
    .then((measured) => {
      process.stdout.write(`${JSON.stringify(measured, null, 2)}\n`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
