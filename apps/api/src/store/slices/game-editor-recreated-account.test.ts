import { afterEach, describe, expect, it, vi } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../../platform/store.js';
import { fakeFirestore } from '../fake-firestore.js';

const OWNER = 'g:owner';
const EDITOR = 'g:editor';
const SLUG = 'recreated-game';
const BEFORE = '2026-09-16T10:00:00.000Z';
const ERASED = '2026-09-16T11:00:00.000Z';
const AFTER = '2026-09-16T12:00:00.000Z';
const stores: Array<[string, () => Store]> = [
  ['memory', () => new InMemoryStore()],
  ['firestore', () => new FirestoreStore(fakeFirestore().db)],
];
afterEach(() => vi.useRealTimers());
for (const [name, make] of stores)
  describe(name, () => {
    it.each([OWNER, EDITOR])('allows fresh invitations after %s recreates their account', async (uid) => {
      vi.useFakeTimers();
      vi.setSystemTime(BEFORE);
      const store = make();
      await store.upsertUser({ uid: OWNER });
      await store.upsertUser({ uid: EDITOR });
      await store.deleteAccountIdentity(uid, ERASED);
      vi.setSystemTime(AFTER);
      await store.upsertUser({ uid });
      await store.ensureGameAccess(SLUG, OWNER, AFTER, AFTER);
      const code = (await store.ensureRecipientCode(EDITOR, AFTER))!;
      const offered = await store.createEditorInvitation(SLUG, OWNER, EDITOR, AFTER, code);
      expect(offered).toMatchObject({ status: 'pending' });
      const id = (offered as { inviteId: string }).inviteId;
      expect(await store.acceptEditorInvitation(SLUG, EDITOR, AFTER, id)).toMatchObject({ status: 'accepted' });
      expect(await store.getAccountErasure(uid)).toBe(ERASED);
    });
    it('refuses a pending invitation once erasure starts', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(BEFORE);
      const store = make();
      await store.upsertUser({ uid: OWNER });
      await store.upsertUser({ uid: EDITOR });
      await store.ensureGameAccess(SLUG, OWNER, BEFORE, BEFORE);
      const offered = await store.createEditorInvitation(SLUG, OWNER, EDITOR, BEFORE);
      const id = (offered as { inviteId: string }).inviteId;
      await store.beginAccountErasure(EDITOR, ERASED);
      expect(await store.acceptEditorInvitation(SLUG, EDITOR, AFTER, id)).toBe('ineligible');
      expect((await store.getGameAccess(SLUG))!.editorUids).toEqual([]);
    });
  });
