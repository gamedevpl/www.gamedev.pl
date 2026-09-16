// Shared setup for the transfer-route tests, which outgrew one file.

import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore } from '../platform/store.js';

export const sessionSecret = 'dev-session-secret-change-me';
export const AT = '2026-01-01T00:00:00.000Z';

export function authCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
}

// A response names the offer, so tests look it up.
export async function offerId(store: InMemoryStore, slug: string): Promise<string> {
  const invite = await store.getActiveGameTransfer(slug, new Date().toISOString());
  return invite?.invitationId ?? 'no-open-offer';
}

export async function ownedGameWithRecipientCode(): Promise<{ store: InMemoryStore; code: string }> {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:ada' });
  await store.upsertUser({ uid: 'g:grace' });
  await store.ensureGameAccess('sky', 'g:ada', AT, AT);
  const code = (await store.ensureRecipientCode('g:grace', AT))!;
  return { store, code };
}

// Closes every app the caller opened, in an afterEach.
export function appFactory(): {
  appWith: (store: InMemoryStore, gameTransferRoutes?: object) => Promise<Awaited<ReturnType<typeof buildApp>>>;
  closeAll: () => Promise<void>;
} {
  const apps: Array<{ close: () => Promise<void> }> = [];
  return {
    appWith: async (store, gameTransferRoutes = {}) => {
      const app = await buildApp({ store, sessionSecret, gameTransferRoutes });
      apps.push(app);
      return app;
    },
    closeAll: async () => {
      while (apps.length) await apps.pop()!.close();
    },
  };
}
