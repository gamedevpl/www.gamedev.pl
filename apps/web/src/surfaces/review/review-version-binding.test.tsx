// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';

vi.mock('../../AuthContext.js', () => ({
  useAuth: () => ({ user: { uid: 'g:reviewer', reviewer: true }, loading: false }),
}));
const theater = vi.hoisted(() => vi.fn());
vi.mock('../../GameTheater.js', () => ({
  GameTheater: (props: unknown) => {
    theater(props);
    return <div />;
  },
}));
const submit = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('./reviewApi.js', () => ({
  submitAssessment: submit,
  raiseModerationFlag: vi.fn(),
  fetchReviewQueue: async () => ({
    assessed: 0,
    remaining: 1,
    items: [
      {
        slug: 'creator-game',
        title: 'Creator game',
        source: 'creator',
        creatorHandle: null,
        genre: null,
        jobId: 42,
        gameVersion: 'v-current',
        media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: null },
        reReview: { reason: 'Check again', gameVersion: 'v-previous', requestedAt: 'now' },
      },
    ],
  }),
}));
import { ReviewDesk } from './ReviewDesk.js';

it('submits the creator version selected in the queue', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<ReviewDesk />);
    });
    const play = Array.from(container.querySelectorAll('button')).find((entry) =>
      entry.textContent?.includes('Try play'),
    )!;
    await act(async () => {
      play.click();
    });
    expect(theater).toHaveBeenCalledWith(
      expect.objectContaining({ source: { slug: 'creator-game', reviewVersion: 'v-current' } }),
    );
    const note = container.querySelector('textarea')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(note, 'Solid first pass.');
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    for (const row of container.querySelectorAll('.review-checklist-row')) {
      const button = Array.from(row.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === 'Ok')!;
      await act(async () => {
        button.click();
      });
    }
    const keep = Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.includes('Keep'))!;
    await act(async () => {
      keep.click();
    });
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ source: 'creator', gameVersion: 'v-current' }));
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('loads the pinned review candidate instead of the public slug route', async () => {
  const { fetchPublishedGame } = await import('../../fetchPublishedGame.js');
  const fetch = vi.fn(
    async () => new Response(JSON.stringify({ slug: 'creator-game', title: 'Creator', html: '<title>v1</title>' })),
  );
  vi.stubGlobal('fetch', fetch);
  try {
    const game = await fetchPublishedGame('creator-game', { reviewVersion: 'v1' });
    expect(game.html).toContain('v1');
    expect(fetch).toHaveBeenCalledWith(
      '/api/review/games/creator-game?version=v1',
      expect.objectContaining({ credentials: 'include' }),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
