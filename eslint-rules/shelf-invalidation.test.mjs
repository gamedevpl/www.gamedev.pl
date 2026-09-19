/**
 * The rule exists because a shelf-visible write with no invalidation is silent: the
 * stale document stays self-consistent, the reader's count still agrees, and nothing
 * surfaces until a sampled read or the hourly sweep. These cases pin what it does and
 * does not fire on, because a rule that over-fires gets disabled everywhere.
 */
import path from 'node:path';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, it } from 'vitest';
import { shelfInvalidation } from './shelf-invalidation.mjs';

RuleTester.describe = describe;
RuleTester.it = it;

const tsLanguageOptions = { parser: tsParser, sourceType: 'module', ecmaVersion: 'latest' };
const ruleTester = new RuleTester({ languageOptions: tsLanguageOptions });

const slice = path.join('apps', 'api', 'src', 'store', 'slices', 'rounds.ts');
const listedSlice = path.join('apps', 'api', 'src', 'store', 'slices', 'submission.ts');

// The shape every Firestore slice has: a private ref helper over one collection.
const withRef = (collection, body) => `
class S {
  constructor(private db: any) {}
  private ref(jobId: number) {
    return this.db.collection('${collection}').doc(String(jobId));
  }
  ${body}
}`;

ruleTester.run('shelf-invalidation', shelfInvalidation, {
  valid: [
    // Inside runTransaction the guarded handle does the invalidating.
    {
      filename: slice,
      code: withRef(
        'submissions',
        `async seal(jobId: number) {
          return this.db.runTransaction(async (tx: any) => {
            tx.set(this.ref(jobId), { state: 'building' }, { merge: true });
          });
        }`,
      ),
    },
    // A patch naming no mirrored field cannot be seen on any shelf.
    {
      filename: slice,
      code: withRef('submissions', `async bump(jobId: number) { await this.ref(jobId).set({ seedStatus: 'x' }); }`),
    },
    // A subcollection is not the document the shelf mirrors.
    {
      filename: slice,
      code: withRef(
        'submissions',
        `private events(jobId: number) { return this.ref(jobId).collection('events'); }
         async add(jobId: number) { await this.events(jobId).doc('e').set({ title: 'x' }); }`,
      ),
    },
    // Another collection entirely.
    {
      filename: slice,
      code: withRef('games', `async rename(jobId: number) { await this.ref(jobId).set({ title: 'x' }); }`),
    },
    // Listed in INVALIDATED_BY_CALLER, which names where the invalidation lives.
    {
      filename: listedSlice,
      code: withRef('submissions', `async setSubmissionTitle(jobId: number) { await this.ref(jobId).set({ title: 'x' }); }`),
    },
  ],
  invalid: [
    // The case the rule is for: a mirrored field, written outside any transaction.
    {
      filename: slice,
      code: withRef('submissions', `async rename(jobId: number) { await this.ref(jobId).set({ title: 'x' }); }`),
      errors: [{ messageId: 'unguarded' }],
    },
    // A spread may carry anything, so it is assumed to carry a mirrored field.
    {
      filename: slice,
      code: withRef('submissions', `async patch(jobId: number, p: object) { await this.ref(jobId).set({ ...p }); }`),
      errors: [{ messageId: 'unguarded' }],
    },
    // Every gameAccess write is shelf-visible; membership is the fence's blind spot.
    {
      filename: slice,
      code: `
class S {
  constructor(private db: any) {}
  async grant(slug: string, record: object) {
    await this.db.collection('gameAccess').doc(slug).set(record);
  }
}`,
      errors: [{ messageId: 'unguarded' }],
    },
    // A local name in a sibling method must not launder the collection.
    {
      filename: slice,
      code: `
class S {
  constructor(private db: any) {}
  private ref(jobId: number) {
    return this.db.collection('submissions').doc(String(jobId));
  }
  async claim(slug: string) {
    const ref = this.db.collection('games').doc(slug);
    await ref.set({ claimed: true });
  }
  async rename(jobId: number) {
    await this.ref(jobId).set({ title: 'x' });
  }
}`,
      errors: [{ messageId: 'unguarded' }],
    },
    // `tx` is the universal name here; an earlier callback must not launder a later write.
    {
      filename: slice,
      code: `
class S {
  constructor(private db: any) {}
  private ref(jobId: number) {
    return this.db.collection('submissions').doc(String(jobId));
  }
  async seal(jobId: number) {
    return this.db.runTransaction(async (tx: any) => {
      tx.set(this.ref(jobId), { state: 'building' }, { merge: true });
    });
  }
  async rename(jobId: number, tx: any) {
    tx.set(this.ref(jobId), { title: 'x' }, { merge: true });
  }
}`,
      errors: [{ messageId: 'unguarded' }],
    },
    // A row of a query is still a document in that collection.
    {
      filename: slice,
      code: `
class S {
  constructor(private db: any) {}
  async revoke(slug: string) {
    const snap = await this.db.collection('submissions').where('slug', '==', slug).get();
    for (const doc of snap.docs) await doc.ref.set({ ownerUid: 'gone' }, { merge: true });
  }
}`,
      errors: [{ messageId: 'unguarded' }],
    },
  ],
});
