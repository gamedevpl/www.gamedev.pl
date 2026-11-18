import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';

// The site assistant's token lane behaves alike in both stores.
const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

const DAY = '2026-11-18';

describe('store contract: site assistant tokens', () => {
  for (const [implName, makeStore] of IMPLEMENTATIONS) {
    describe(implName, () => {
      it('holds tokens up to the cap and refuses a hold that would cross it', async () => {
        const store = makeStore();
        expect(await store.getGlobalAssistantTokenCount(DAY)).toBe(0);
        expect(await store.checkAndIncrementGlobalAssistantTokens(DAY, 600, 1000)).toEqual({
          allowed: true,
          current: 600,
        });
        expect(await store.checkAndIncrementGlobalAssistantTokens(DAY, 600, 1000)).toEqual({
          allowed: false,
          current: 600,
        });
        expect(await store.getGlobalAssistantTokenCount(DAY)).toBe(600);
      });

      it('settles a hold down to what was used, never below zero', async () => {
        const store = makeStore();
        await store.checkAndIncrementGlobalAssistantTokens(DAY, 600, 1000);
        expect(await store.adjustGlobalAssistantTokens(DAY, 120 - 600)).toBe(120);
        expect(await store.adjustGlobalAssistantTokens(DAY, -500)).toBe(0);
      });

      it('keeps its count apart from the tab-complete lane and other days', async () => {
        const store = makeStore();
        await store.checkAndIncrementGlobalAssistantTokens(DAY, 300, 1000);
        expect(await store.getGlobalTabCompleteTokenCount(DAY)).toBe(0);
        expect(await store.getGlobalAssistantTokenCount('2026-11-19')).toBe(0);
      });

      it('reads back the pause and the cap an operator sets', async () => {
        const store = makeStore();
        await store.setCreationLimits({ assistantPaused: true, globalDailyAssistantTokenCap: 50_000 }, 'operator');
        expect(await store.getCreationLimits()).toMatchObject({
          assistantPaused: true,
          globalDailyAssistantTokenCap: 50_000,
        });
        await store.setCreationLimits({ chatPaused: true }, 'operator');
        expect(await store.getCreationLimits()).toMatchObject({ assistantPaused: true, chatPaused: true });
      });
    });
  }
});
