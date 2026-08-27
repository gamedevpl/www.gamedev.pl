import { describe, expect, it } from 'vitest';
import type { GamesStore, VersionManifest } from '../delivery/games-store.js';
import { isRepoBaseStale, ProposalBaseUnavailableError, resolveProposalBase } from './proposal-base.js';
import { InMemoryStore } from '../platform/store.js';

const NOW = '2026-08-04T12:00:00Z';

function storeGamesStore(files: Record<string, string>): GamesStore {
  return {
    async getManifest(): Promise<VersionManifest> {
      return {
        slug: 'neon-drift',
        version: 'base-1',
        createdAt: NOW,
        jobId: 1_000_001,
        sourceFiles: Object.keys(files),
      } as VersionManifest;
    },
    async getSourceFile(_slug: string, _version: string, path: string) {
      return files[path] ?? null;
    },
  } as unknown as GamesStore;
}

async function publishedStoreGame() {
  const store = new InMemoryStore();
  await store.setPublication({ slug: 'neon-drift', state: 'published', currentVersion: 'base-1', publishedAt: NOW });
  return store;
}

describe('resolveProposalBase — store lane', () => {
  it('returns the published version and pins the base to it', async () => {
    const store = await publishedStoreGame();
    const result = await resolveProposalBase(
      { store, gamesStore: storeGamesStore({ 'game.ts': 'export const grip = 0.5;\n' }) },
      'neon-drift',
    );
    expect(result.base).toEqual({ kind: 'store', version: 'base-1' });
    expect(result.files).toEqual([{ path: 'game.ts', content: 'export const grip = 0.5;\n' }]);
  });

  it('refuses a game that is not live', async () => {
    const store = await publishedStoreGame();
    await store.takedownPublication('neon-drift', 'reported');
    await expect(
      resolveProposalBase({ store, gamesStore: storeGamesStore({ 'game.ts': 'x' }) }, 'neon-drift'),
    ).rejects.toBeInstanceOf(ProposalBaseUnavailableError);
  });
});

describe('resolveProposalBase — repo lane', () => {
  it('says so plainly when repo-lane proposals are not configured', async () => {
    // No publication record, so this falls through to the repo lane — which needs a
    // snapshot pointer and a games-repo token to answer at all.
    const store = new InMemoryStore();
    await expect(resolveProposalBase({ store }, 'apex-sprint')).rejects.toMatchObject({
      reason: 'not_configured',
    });
  });

  it('refuses when the live snapshot has no recorded commit', async () => {
    // Without a commit there is nothing to apply an accepted change onto later, and
    // nothing to detect drift against — so a proposal must not be anchored to it.
    const store = new InMemoryStore();
    await expect(
      resolveProposalBase(
        {
          store,
          snapshotStore: { getPointer: async () => ({ snapshotId: 's1', commitSha: null }) } as never,
          gamesRepo: 'owner/repo',
          gamesRepoToken: 'token',
        },
        'apex-sprint',
      ),
    ).rejects.toMatchObject({ reason: 'not_configured' });
  });
});

describe('isRepoBaseStale', () => {
  it('is fresh while the site still serves the commit the proposal was built on', () => {
    expect(isRepoBaseStale({ kind: 'repo', snapshotId: 's1', sha: 'aaa' }, { commitSha: 'aaa' })).toBe(false);
  });

  it('is stale once a bake moved the commit', () => {
    expect(isRepoBaseStale({ kind: 'repo', snapshotId: 's1', sha: 'aaa' }, { commitSha: 'bbb' })).toBe(true);
  });

  it('is stale when there is no pointer to compare against', () => {
    expect(isRepoBaseStale({ kind: 'repo', snapshotId: 's1', sha: 'aaa' }, null)).toBe(true);
  });

  it("says nothing about a store-lane base — that is isBaseStale's job", () => {
    expect(isRepoBaseStale({ kind: 'store', version: 'v1' }, { commitSha: 'bbb' })).toBe(false);
  });
});
