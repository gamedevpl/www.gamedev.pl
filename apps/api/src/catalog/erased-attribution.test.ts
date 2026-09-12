import { describe, expect, it } from 'vitest';
import { createDeattributor } from './erased-attribution.js';
import type { CatalogGameEntry } from './github-client.js';

const entries = [
  { slug: 'kept', submittedBy: 'ada', creatorHandle: 'ada' },
  { slug: 'erased', submittedBy: 'someone', creatorHandle: 'someone' },
] as unknown as CatalogGameEntry[];

function storeWith(slugs: string[], onRead?: () => void) {
  return {
    async listSubmissionsByOwner() {
      onRead?.();
      return slugs.map((slug) => ({ slug })) as never;
    },
  };
}

describe('erased attribution', () => {
  it('strips the byline from an erased creator and leaves the rest alone', async () => {
    const deattribute = createDeattributor({ store: storeWith(['erased']), now: () => 0 });
    const [kept, erased] = await deattribute(entries);
    expect(kept).toMatchObject({ submittedBy: 'ada', creatorHandle: 'ada' });
    expect(erased).toMatchObject({ submittedBy: 'gamedev-platform', creatorHandle: null });
  });

  it('asks the store once per window instead of once per request', async () => {
    let reads = 0;
    let clock = 0;
    const deattribute = createDeattributor({
      store: storeWith(['erased'], () => {
        reads += 1;
      }),
      now: () => clock,
      ttlMs: 30_000,
    });

    for (let request = 0; request < 50; request += 1) await deattribute(entries);
    expect(reads).toBe(1);

    clock = 30_001;
    await deattribute(entries);
    expect(reads).toBe(2);
  });

  it('picks up an erasure once the window turns over', async () => {
    let erasedSlugs: string[] = [];
    let clock = 0;
    const deattribute = createDeattributor({
      store: {
        async listSubmissionsByOwner() {
          return erasedSlugs.map((slug) => ({ slug })) as never;
        },
      },
      now: () => clock,
      ttlMs: 30_000,
    });

    expect((await deattribute(entries))[1]).toMatchObject({ submittedBy: 'someone' });
    erasedSlugs = ['erased'];
    clock = 30_001;
    expect((await deattribute(entries))[1]).toMatchObject({ submittedBy: 'gamedev-platform' });
  });

  it('refuses to guess when the store cannot be read', async () => {
    const deattribute = createDeattributor({
      store: {
        async listSubmissionsByOwner(): Promise<never> {
          throw new Error('firestore is unreachable');
        },
      },
      now: () => 0,
    });
    await expect(deattribute(entries)).rejects.toThrow('firestore is unreachable');
  });

  it('passes everything through when there is no store at all', async () => {
    const deattribute = createDeattributor({ now: () => 0 });
    expect(await deattribute(entries)).toBe(entries);
  });
});
