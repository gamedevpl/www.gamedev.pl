import { buildApp } from './app.js';
import { FirestoreStore, InMemoryStore } from './store.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

async function main() {
  // In production, use Firestore for persistent user/quota/submission storage.
  // Firestore auth is ambient via the Cloud Run runtime service account — no key file needed.
  // In development and tests, InMemoryStore is used (no GCP dependency).
  const store = process.env.NODE_ENV === 'production' ? new FirestoreStore() : new InMemoryStore();

  // Optional local demo shelf for Creator Studio screenshots / manual QA.
  // Never armed in production. Mint a session with the default secret and open /studio.
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_SEED_STUDIO === '1' && store instanceof InMemoryStore) {
    const uid = 'g:studio-demo';
    await store.upsertUser({ uid, name: 'Studio Demo', email: 'studio-demo@example.com' });
    await store.createSubmission(101, uid, 'Sky Dodge');
    await store.setSubmissionSlug(101, 'sky-dodge');
    await store.setSubmissionPublishedAt(101, new Date(Date.now() - 3 * 86400_000).toISOString());
    await store.setSubmissionLastStatus(101, 'published');
    await store.setSubmissionNotifiedStatus(101, 'published');
    await store.createSubmission(102, uid, 'Arena Tag');
    await store.setSubmissionSlug(102, 'arena-tag');
    await store.setSubmissionLastStatus(102, 'building');
    await store.setSubmissionNotifiedStatus(102, 'building');
    const today = new Date().toISOString().slice(0, 10);
    await store.appendTelemetryEvents(today, [
      {
        slug: 'sky-dodge',
        sessionId: 'demo-s1',
        type: 'game_opened',
        at: `${today}T10:00:00.000Z`,
        msSinceOpen: 0,
      },
      {
        slug: 'sky-dodge',
        sessionId: 'demo-s1',
        type: 'alive',
        frames: 300,
        at: `${today}T10:00:05.000Z`,
        msSinceOpen: 5_000,
      },
      {
        slug: 'sky-dodge',
        sessionId: 'demo-s1',
        type: 'play_time',
        seconds: 95,
        at: `${today}T10:01:35.000Z`,
        msSinceOpen: 95_000,
      },
      {
        slug: 'sky-dodge',
        sessionId: 'demo-s1',
        type: 'game_closed',
        at: `${today}T10:01:36.000Z`,
        msSinceOpen: 96_000,
      },
      {
        slug: 'sky-dodge',
        sessionId: 'demo-s2',
        type: 'game_opened',
        at: `${today}T11:00:00.000Z`,
        msSinceOpen: 0,
      },
      {
        slug: 'sky-dodge',
        sessionId: 'demo-s2',
        type: 'error',
        message: 'TypeError: x is not a function',
        at: `${today}T11:00:02.000Z`,
        msSinceOpen: 2_000,
      },
      {
        slug: 'sky-dodge',
        sessionId: 'demo-s2',
        type: 'play_time',
        seconds: 12,
        at: `${today}T11:00:12.000Z`,
        msSinceOpen: 12_000,
      },
    ]);
    console.info('[dev] seeded Creator Studio demo user g:studio-demo');
  }

  const app = await buildApp({ logger: true, store });
  await app.listen({ port, host });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
