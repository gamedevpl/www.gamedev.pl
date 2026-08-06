// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

vi.mock('./AuthContext.js', () => ({
  useAuth: () => ({
    user: { uid: 'dev:reviewer', tier: 'standard', reviewer: true },
    loading: false,
  }),
}));

vi.mock('./PublishedGameFrame.js', () => ({
  PublishedGameFrame: ({ slug, title }: { slug: string; title: string }) => (
    <div data-testid="frame">
      {title} ({slug})
    </div>
  ),
}));

const reviewApi = vi.hoisted(() => ({
  fetchReviewQueue: vi.fn(),
  submitAssessment: vi.fn(),
}));

vi.mock('./reviewApi.js', () => reviewApi);

import { ReviewDesk } from './ReviewDesk.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  reviewApi.fetchReviewQueue.mockReset();
  reviewApi.submitAssessment.mockReset();
  reviewApi.fetchReviewQueue.mockResolvedValue({
    source: 'all',
    remaining: 2,
    assessed: 0,
    items: [
      {
        slug: 'sky-dodge',
        title: 'Sky Dodge',
        source: 'catalog',
        creatorHandle: null,
        genre: 'arcade',
        issueNumber: null,
        media: {
          screenshots: [
            { name: 'opening', file: 'opening.png' },
            { name: 'mid', file: 'mid.png' },
          ],
          video: 'gameplay.mp4',
        },
      },
      {
        slug: 'neon-courier',
        title: 'Neon Courier',
        source: 'catalog',
        creatorHandle: 'ada',
        genre: 'racing',
        issueNumber: null,
        media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: null },
      },
    ],
  });
  reviewApi.submitAssessment.mockImplementation(async (input: { slug: string; verdict: string }) => ({
    id: `${input.slug}:dev:reviewer`,
    slug: input.slug,
    title: input.slug,
    source: 'catalog',
    creatorHandle: null,
    reviewerUid: 'dev:reviewer',
    verdict: input.verdict,
    note: '',
    noteOrigin: 'none',
    clientContext: null,
    createdAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z',
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ReviewDesk', () => {
  it('shows catalog preview media and advances on Keep', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(<ReviewDesk />);
    });
    await flush();

    expect(container.textContent).toContain('Sky Dodge');
    expect(container.querySelector('video.review-preview-video')).toBeTruthy();
    expect(container.querySelector('[data-testid="frame"]')).toBeNull();
    expect(container.querySelector('.review-dock')).toBeTruthy();
    expect(container.querySelector('#review-note')).toBeTruthy();
    expect(container.textContent).toMatch(/Mic/);
    expect(container.textContent).toMatch(/Try play/);

    const keep = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Keep'),
    );
    expect(keep).toBeTruthy();
    await act(async () => {
      keep!.click();
    });
    await flush();

    expect(reviewApi.submitAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'sky-dodge',
        verdict: 'keep',
        clientContext: expect.objectContaining({
          viewportW: expect.any(Number),
          viewportH: expect.any(Number),
          input: expect.stringMatching(/^(touch|mouse|mixed)$/),
          platform: expect.any(String),
        }),
      }),
    );
    expect(container.textContent).toContain('Neon Courier');
  });

  it('mounts the live frame when Try play is pressed', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(<ReviewDesk />);
    });
    await flush();

    const tryPlay = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Try play'),
    );
    expect(tryPlay).toBeTruthy();
    await act(async () => {
      tryPlay!.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="frame"]')?.textContent).toContain('sky-dodge');
    expect(container.querySelector('video.review-preview-video')).toBeNull();
    expect(container.textContent).toMatch(/Show preview/);
  });

  it('sends cut when the Cut control is pressed', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(<ReviewDesk />);
    });
    await flush();

    const cut = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Cut'));
    await act(async () => {
      cut!.click();
    });
    await flush();

    expect(reviewApi.submitAssessment).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'sky-dodge', verdict: 'cut' }),
    );
  });
});
