import { expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createDispatcher } from './dispatch-build.js';

it('records the first dispatch ref without rewinding progress that arrived before the provider returned', async () => {
  const store = new InMemoryStore();
  await store.createSubmission(42, 'owner', 'Game');
  await store.recordJobTransition(42, { to: 'queued', at: new Date().toISOString(), by: 'creator' });
  const { dispatchBuild } = createDispatcher({
    store,
    submissionTokenSecret: 'test',
    gameSeeder: undefined,
    now: Date.now,
    notifyAppBaseUrl: 'https://example.test',
    builderOf: () => 'platform',
    backendFor: async () => ({
      name: 'managed:test',
      dispatch: async () => {
        await store.recordJobTransition(42, {
          to: 'building',
          at: new Date().toISOString(),
          by: 'agent',
          reason: 'channel_signal',
        });
        return { ref: 'session' };
      },
      resume: async () => ({ ref: 'session' }),
      observe: async () => null,
      cancel: async () => ({ enforced: false }),
    }),
    recordSessionCost: async () => {},
    seedDeliveryFor: () => 'channel',
    seedBuild: async () => ({ reason: 'unused' }),
    publishSeedPreview: async () => {},
  });
  expect(await dispatchBuild({ jobId: 42, spec: 'Game', locale: 'pl', log: { error: () => {} } })).toBe(true);
  expect(await store.getSubmission(42)).toMatchObject({ state: 'building', dispatch: { refs: ['session'] } });
});
