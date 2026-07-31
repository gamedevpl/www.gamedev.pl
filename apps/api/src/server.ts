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
    // Mirror the live shelf that motivated the operator-cancel fix: a rejected
    // street-heist must not appear beside the creator's other drafts.
    await store.createSubmission(100, uid, 'Can we make a game like Grand Theft Auto');
    await store.setSubmissionSlug(100, 'street-heist');
    await store.recordJobTransition(100, {
      to: 'canceled',
      at: new Date(Date.now() - 20 * 3600_000).toISOString(),
      by: 'operator',
      reason: 'operator_canceled',
    });
    // Pre-fix shape (no abandonedAt) — shelf must still hide it via state === 'canceled'.
    await store.createSubmission(101, uid, 'Global Thermonuclear Strategy');
    await store.setSubmissionSlug(101, 'global-thermonuclear');
    await store.setSubmissionLastStatus(101, 'building');
    await store.setSubmissionNotifiedStatus(101, 'building');
    await store.createSubmission(102, uid, 'A game tycoon like where I run a studio');
    await store.setSubmissionSlug(102, 'studio-tycoon');
    await store.setSubmissionLastStatus(102, 'building');
    await store.setSubmissionNotifiedStatus(102, 'building');
    // Extra shelf rows so local QA can exercise search/filters/mobile switcher at 10+.
    const extras: Array<{
      issue: number;
      title: string;
      slug?: string;
      status: 'published' | 'building' | 'queued' | 'in_review' | 'needs_changes';
      daysAgo: number;
    }> = [
      { issue: 103, title: 'Sky Dodge', slug: 'sky-dodge', status: 'published', daysAgo: 3 },
      { issue: 104, title: 'Neon Drift', slug: 'neon-drift', status: 'published', daysAgo: 8 },
      { issue: 105, title: 'Puzzle Dock', slug: 'puzzle-dock', status: 'published', daysAgo: 12 },
      { issue: 106, title: 'Bolt Rush', status: 'queued', daysAgo: 0 },
      { issue: 107, title: 'Castle Siege', slug: 'castle-siege', status: 'published', daysAgo: 20 },
      { issue: 108, title: 'Orbit Hop', status: 'in_review', daysAgo: 1 },
      { issue: 109, title: 'Tide Pool', slug: 'tide-pool', status: 'published', daysAgo: 30 },
      { issue: 110, title: 'Ghost Circuit', status: 'needs_changes', daysAgo: 5 },
      { issue: 111, title: 'Forest Dash', slug: 'forest-dash', status: 'published', daysAgo: 55 },
      { issue: 112, title: 'Sumo Mini', slug: 'sumo-mini', status: 'published', daysAgo: 60 },
    ];
    for (const extra of extras) {
      await store.createSubmission(extra.issue, uid, extra.title);
      if (extra.slug) await store.setSubmissionSlug(extra.issue, extra.slug);
      const created = new Date(Date.now() - extra.daysAgo * 86400_000).toISOString();
      // createdAt is set by createSubmission; publishedAt only for live games.
      if (extra.status === 'published' && extra.slug) {
        await store.setSubmissionPublishedAt(extra.issue, created);
      }
      await store.setSubmissionLastStatus(extra.issue, extra.status);
      await store.setSubmissionNotifiedStatus(extra.issue, extra.status);
    }
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
