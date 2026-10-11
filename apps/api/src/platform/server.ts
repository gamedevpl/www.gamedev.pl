import { buildApp } from './app.js';
import { seedStudioDemo } from './dev-seed-studio.js';
import { applyLocalDevOrigin } from './dev-origin.js';
import { FirestoreStore, InMemoryStore } from './store.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

async function main() {
  applyLocalDevOrigin();
  // Production: Firestore via the runtime service account. Dev: InMemoryStore.
  const store = process.env.NODE_ENV === 'production' ? new FirestoreStore() : new InMemoryStore();

  // Optional local demo shelf for Creator Studio screenshots / manual QA.
  // Never armed in production. Mint a session with the default secret and open /studio.
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_SEED_STUDIO === '1' && store instanceof InMemoryStore) {
    await seedStudioDemo(store);
  }

  const app = await buildApp({ logger: true, store });
  await app.listen({ port, host });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
