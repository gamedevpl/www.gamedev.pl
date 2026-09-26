import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { ConsoleMailer } from './mailer.js';
import { emitDigestNotification } from './notify.js';
import { mintUnsubscribeToken } from './unsubscribe-token.js';

const secret = 'dev-session-secret-change-me';

describe('digest unsubscribe capability', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:me', email: 'me@example.com' });
  });

  it.each(['', '&scope=nonsense'])('rejects changed scope %j', async (query) => {
    const app = await buildApp({ store, sessionSecret: secret });
    const token = mintUnsubscribeToken('g:me', secret, 'digest');

    const response = await app.inject({ method: 'GET', url: `/api/email/unsubscribe?token=${token}${query}` });

    expect(response.statusCode).toBe(400);
    const user = await store.getUser('g:me');
    expect(user?.digestOptOutAt).toBeFalsy();
    expect(user?.emailUnsubscribedAt).toBeFalsy();
    await app.close();
  });

  it('generates a digest link that cannot become a global opt-out', async () => {
    const app = await buildApp({ store, sessionSecret: secret });
    const mailer = new ConsoleMailer(() => {});
    await emitDigestNotification(
      { store, mailer, appBaseUrl: 'https://www.gamedev.pl', unsubscribeSecret: secret },
      {
        uid: 'g:me',
        id: 'digest-2026-W31',
        params: { games: '2', sessions: '30', votesUp: '4', votesDown: '1', feedback: '3' },
        link: '/',
        createdAt: '2026-07-28T09:00:00.000Z',
      },
    );
    const header = mailer.sent[0].headers?.['List-Unsubscribe'] ?? '';
    const link = new URL(header.slice(1, -1));
    link.searchParams.delete('scope');

    const response = await app.inject({ method: 'GET', url: `${link.pathname}${link.search}` });

    expect(response.statusCode).toBe(400);
    expect((await store.getUser('g:me'))?.emailUnsubscribedAt).toBeFalsy();
    await app.close();
  });

  it('keeps existing global tokens able to request a digest-only opt-out', async () => {
    const app = await buildApp({ store, sessionSecret: secret });
    const token = mintUnsubscribeToken('g:me', secret);

    const response = await app.inject({ method: 'GET', url: `/api/email/unsubscribe?token=${token}&scope=digest` });

    expect(response.statusCode).toBe(200);
    expect((await store.getUser('g:me'))?.digestOptOutAt).toBeTruthy();
    await app.close();
  });
});
