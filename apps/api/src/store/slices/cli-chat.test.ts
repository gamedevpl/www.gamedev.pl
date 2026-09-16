import { expect, it } from 'vitest';
import { fakeFirestore } from '../fake-firestore.js';
import { FirestoreCliChatStore, InMemoryCliChatStore, type CliChatRecord } from './cli-chat.js';

const record = (conversationId: string, text = conversationId): CliChatRecord => ({
  conversationId,
  turns: [{ role: 'user', text }],
  updatedAt: '2026-09-16T00:00:00Z',
});
it.each([
  ['memory', () => new InMemoryCliChatStore()],
  ['firestore', () => new FirestoreCliChatStore(fakeFirestore().db)],
] as const)('%s retains bounded independent conversations', async (_name, create) => {
  const store = create();
  for (let i = 0; i < 10; i++) await store.putCliChat('owner', record(String(i)));
  expect(await store.getCliChat('owner', '0')).toBeNull();
  expect(await store.getCliChat('owner', '2')).toEqual(record('2'));
  expect(await store.getCliChat('owner')).toEqual(record('9'));
  await store.putCliChat('owner', record('2', 'continued'));
  expect(await store.getCliChat('owner', '9')).toEqual(record('9'));
  expect(await store.getCliChat('owner')).toEqual(record('2', 'continued'));
  expect(await store.getCliChat('another', '2')).toBeNull();
  for (let i = 0; i < 8; i++) await store.putCliChat('large', record(String(i), 'x'.repeat(150_000)));
  expect(await store.getCliChat('large', '0')).toBeNull();
  expect(await store.getCliChat('large', '7')).not.toBeNull();
});

it('reads and retains legacy singleton Firestore history', async () => {
  const { db } = fakeFirestore();
  await db.collection('cliChats').doc('owner').set(record('legacy'));
  const store = new FirestoreCliChatStore(db);
  expect(await store.getCliChat('owner', 'legacy')).toEqual(record('legacy'));
  await store.putCliChat('owner', record('new'));
  expect(await store.getCliChat('owner', 'legacy')).toEqual(record('legacy'));
  await db.collection('cliChats').doc('owner').delete();
  expect(await store.getCliChat('owner', 'legacy')).toBeNull();
  expect(await store.getCliChat('owner', 'new')).toBeNull();
});
