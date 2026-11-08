import type { Store } from '../platform/store.js';

// The account's pl/en wins over the round's stored locale.
export async function creatorLocale(store: Store, uid: string, stored: string | undefined): Promise<'pl' | 'en'> {
  const account = (await store.getUser(uid))?.locale;
  const chosen = account ?? stored ?? 'en';
  return /^pl/i.test(chosen) ? 'pl' : 'en';
}
