// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { inProgressCreatorGames, loadCreatorGames, publishedCreatorSlugs } from './creatorGames.js';
import { getSavedSpecs } from './mySpecs.js';
import { getSubmissionStatus, listMySubmissions, type SubmissionApiError } from './submissionApi.js';

vi.mock('./submissionApi', async () => {
  const actual = await vi.importActual<typeof import('./submissionApi')>('./submissionApi');
  return { ...actual, getSubmissionStatus: vi.fn(), listMySubmissions: vi.fn() };
});

const mockedListMySubmissions = vi.mocked(listMySubmissions);
const mockedGetSubmissionStatus = vi.mocked(getSubmissionStatus);

function saveLocal(entries: Array<{ token: string; title: string; createdAt?: number; lastStatus?: string }>): void {
  localStorage.setItem(
    'gamedev_saved_specs',
    JSON.stringify(
      entries.map((entry, index) => ({
        token: entry.token,
        title: entry.title,
        createdAt: entry.createdAt ?? Date.now() - index,
        ...(entry.lastStatus ? { lastStatus: entry.lastStatus } : {}),
      })),
    ),
  );
}

function rejected(status: number): SubmissionApiError {
  const error = new Error(`Request failed (${status})`) as SubmissionApiError;
  error.status = status;
  return error;
}

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
    saveLocal([{ token: 'tok-local', title: 'Local Game' }]);
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

  it('re-asks only unlisted tokens that last resolved live', async () => {
    saveLocal([
      { token: 'tok-dead', title: 'Ancient Job', createdAt: 1 },
      { token: 'tok-gone', title: 'Missing Job', createdAt: 2 },
      { token: 'tok-live', title: 'Still Building', createdAt: 3 },
      { token: 'tok-done', title: 'Published Off Shelf', createdAt: 4 },
    ]);
    mockedListMySubmissions.mockResolvedValue([]);
    mockedGetSubmissionStatus.mockImplementation(async (token) => {
      if (token === 'tok-dead') return { status: 'abandoned' };
      if (token === 'tok-gone') throw rejected(404);
      if (token === 'tok-live') return { status: 'building', slug: 'still-building' };
      if (token === 'tok-done') return { status: 'published', slug: 'published-off-shelf' };
      throw new Error(`unexpected token ${token}`);
    });

    const first = await loadCreatorGames('en');
    expect(first.map((item) => item.token).sort()).toEqual(['tok-done', 'tok-gone', 'tok-live']);
    expect(first.find((item) => item.token === 'tok-live')?.status).toBe('building');
    expect(first.find((item) => item.token === 'tok-done')?.status).toBe('published');
    expect(mockedGetSubmissionStatus.mock.calls.map((call) => call[0]).sort()).toEqual([
      'tok-dead',
      'tok-done',
      'tok-gone',
      'tok-live',
    ]);

    mockedGetSubmissionStatus.mockClear();
    const second = await loadCreatorGames('en');
    expect(mockedGetSubmissionStatus.mock.calls.map((call) => call[0])).toEqual(['tok-live']);
    expect(second.map((item) => item.token).sort()).toEqual(['tok-done', 'tok-live']);
    expect(
      getSavedSpecs()
        .map((spec) => spec.token)
        .sort(),
    ).toEqual(['tok-done', 'tok-live']);
    expect(getSavedSpecs().find((spec) => spec.token === 'tok-done')?.lastStatus).toBe('published');
  });

  it('keeps asking after a transient failure, not after a rejected token', async () => {
    saveLocal([
      { token: 'tok-live', title: 'Blip' },
      { token: 'tok-bad', title: 'Garbage Token' },
    ]);
    mockedListMySubmissions.mockResolvedValue([]);
    mockedGetSubmissionStatus.mockImplementation(async (token) => {
      if (token === 'tok-live') throw rejected(502);
      throw rejected(400);
    });

    await loadCreatorGames('en');
    mockedGetSubmissionStatus.mockClear();
    await loadCreatorGames('en');
    expect(mockedGetSubmissionStatus.mock.calls.map((call) => call[0])).toEqual(['tok-live']);
  });
});
