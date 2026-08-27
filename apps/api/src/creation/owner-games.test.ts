import { describe, expect, it } from 'vitest';
import { collapseJobsToOwnerGames, MAX_OWNER_GAMES, pageOwnerGames } from './owner-games.js';
import type { SubmissionRecord } from '../platform/store.js';

function job(partial: Partial<SubmissionRecord> & Pick<SubmissionRecord, 'jobId' | 'createdAt'>): SubmissionRecord {
  return {
    ownerUid: 'g:creator',
    title: `Job ${partial.jobId}`,
    ...partial,
  } as SubmissionRecord;
}

describe('collapseJobsToOwnerGames', () => {
  it('groups by slug and picks the newest job as tip', () => {
    const jobs = [
      job({ jobId: 1, createdAt: '2026-01-01T00:00:00.000Z', slug: 'sky-dodge' }),
      job({ jobId: 2, createdAt: '2026-01-02T00:00:00.000Z', slug: 'sky-dodge' }),
    ];

    const collapsed = collapseJobsToOwnerGames(jobs, 'shelf');
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.tip.jobId).toBe(2);
  });

  it('treats slugless jobs as one game per issue', () => {
    const jobs = [
      job({ jobId: 10, createdAt: '2026-01-01T00:00:00.000Z' }),
      job({ jobId: 11, createdAt: '2026-01-02T00:00:00.000Z' }),
    ];

    expect(collapseJobsToOwnerGames(jobs, 'shelf')).toHaveLength(2);
  });

  it('drops abandoned and canceled jobs from the shelf', () => {
    const jobs = [
      job({ jobId: 1, createdAt: '2026-01-01T00:00:00.000Z', abandonedAt: '2026-01-02T00:00:00.000Z' }),
      job({ jobId: 2, createdAt: '2026-01-02T00:00:00.000Z', state: 'canceled' }),
      job({ jobId: 3, createdAt: '2026-01-03T00:00:00.000Z', slug: 'keep' }),
    ];

    const collapsed = collapseJobsToOwnerGames(jobs, 'shelf');
    expect(collapsed.map((entry) => entry.tip.jobId)).toEqual([3]);
  });

  it('stamps catalogPublishedAt on an improve tip without copying publishedAt onto the tip', () => {
    const jobs = [
      job({
        jobId: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        slug: 'sky-dodge',
        publishedAt: '2026-01-01T12:00:00.000Z',
      }),
      job({ jobId: 2, createdAt: '2026-01-02T00:00:00.000Z', slug: 'sky-dodge' }),
    ];

    const collapsed = collapseJobsToOwnerGames(jobs, 'shelf');
    expect(collapsed[0]!.tip.jobId).toBe(2);
    expect(collapsed[0]!.tip.publishedAt).toBeUndefined();
    expect(collapsed[0]!.catalogPublishedAt).toBe('2026-01-01T12:00:00.000Z');
  });

  it('published mode keeps only games with a published sibling', () => {
    const jobs = [
      job({
        jobId: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        slug: 'live',
        publishedAt: '2026-01-01T12:00:00.000Z',
      }),
      job({ jobId: 2, createdAt: '2026-01-02T00:00:00.000Z', slug: 'draft-only' }),
    ];

    const collapsed = collapseJobsToOwnerGames(jobs, 'published');
    expect(collapsed.map((entry) => entry.tip.slug)).toEqual(['live']);
  });
});

describe('pageOwnerGames', () => {
  it('truncates after MAX_OWNER_GAMES distinct games', () => {
    const jobs = Array.from({ length: MAX_OWNER_GAMES + 5 }, (_, index) =>
      job({
        jobId: index + 1,
        createdAt: new Date(Date.UTC(2026, 0, MAX_OWNER_GAMES + 5 - index)).toISOString(),
        slug: `game-${index + 1}`,
      }),
    );

    const page = pageOwnerGames(jobs, 'shelf');
    expect(page.games).toHaveLength(MAX_OWNER_GAMES);
    expect(page.total).toBe(MAX_OWNER_GAMES + 5);
    expect(page.truncated).toBe(true);
  });
});
