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
      },
      {
        slug: 'neon-courier',
        title: 'Neon Courier',
        source: 'catalog',
        creatorHandle: 'ada',
        genre: 'racing',
        issueNumber: null,
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
  it('loads the queue and advances on Keep', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(<ReviewDesk />);
    });
    await flush();

    expect(container.textContent).toContain('Sky Dodge');
    expect(container.querySelector('#review-note')).toBeTruthy();
    expect(container.textContent).toMatch(/Mic/);

    const keep = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Keep'),
    );
    expect(keep).toBeTruthy();
    await act(async () => {
      keep!.click();
    });
    await flush();

    expect(reviewApi.submitAssessment).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'sky-dodge', verdict: 'keep' }),
    );
    expect(container.textContent).toContain('Neon Courier');
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
