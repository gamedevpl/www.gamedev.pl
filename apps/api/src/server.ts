import { buildApp } from './app.js';
import { FirestoreStore, InMemoryStore } from './store.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

async function main() {
  // In production, use Firestore for persistent user/quota/submission storage.
  // Firestore auth is ambient via the Cloud Run runtime service account — no key file needed.
  // In development and tests, InMemoryStore is used (no GCP dependency).
  const store = process.env.NODE_ENV === 'production' ? new FirestoreStore() : new InMemoryStore();

  const app = await buildApp({ logger: true, store });
  await app.listen({ port, host });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
