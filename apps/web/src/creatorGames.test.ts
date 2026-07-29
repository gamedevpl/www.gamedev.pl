// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inProgressCreatorGames,
  loadCreatorGames,
  publishedCreatorSlugs,
} from './creatorGames.js';
import { getSubmissionStatus, listMySubmissions } from './submissionApi.js';

vi.mock('./submissionApi', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi')>('./submissionApi');
  return { ...actual, getSubmissionStatus: vi.fn(), listMySubmissions: vi.fn() };
});

const mockedListMySubmissions = vi.mocked(listMySubmissions);
const mockedGetSubmissionStatus = vi.mocked(getSubmissionStatus);

describe('creatorGames', () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('lists the creator’s games from the server with their live status', async () => {
    mockedListMySubmissions.mockResolvedValue([
      {
        token: 'tok-a',
        title: 'Circus Cat',
        createdAt: '2026-01-02T00:00:00Z',
        lastKnownStatus: 'published',
        slug: 'circus-cat',
      },
      {
        token: 'tok-b',
        title: 'Space Runner',
        createdAt: '2026-01-01T00:00:00Z',
        lastKnownStatus: 'building',
        slug: 'space-runner-preview',
      },
    ]);

    const items = await loadCreatorGames('en');
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('Circus Cat');
    expect(items[0]?.status).toBe('published');
    expect(items[1]?.title).toBe('Space Runner');
    expect(items[1]?.status).toBe('building');
    expect(mockedGetSubmissionStatus).not.toHaveBeenCalled();
    // Only published statuses pin — a building item's slug must not pin early.
    expect([...publishedCreatorSlugs(items)]).toEqual(['circus-cat']);
    expect(inProgressCreatorGames(items).map((item) => item.title)).toEqual(['Space Runner']);
  });

  it('falls back to locally saved specs when the API list is unavailable', async () => {
    localStorage.setItem(
      'gamedev_saved_specs',
      JSON.stringify([{ token: 'tok-local', title: 'Local Game', createdAt: Date.now() }]),
    );
    mockedListMySubmissions.mockRejectedValue(new Error('unauthorized'));
    mockedGetSubmissionStatus.mockResolvedValue({ status: 'queued' });

    const items = await loadCreatorGames('en');
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Local Game');
    expect(items[0]?.status).toBe('queued');
  });

  it('returns an empty list when the creator has no games', async () => {
    mockedListMySubmissions.mockResolvedValue([]);
    const items = await loadCreatorGames('en');
    expect(items).toEqual([]);
    expect(mockedGetSubmissionStatus).not.toHaveBeenCalled();
  });
});
