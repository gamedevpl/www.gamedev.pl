// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import type { GameReview as GameReviewData } from './gameReviewApi.js';

const fetchGameReview = vi.fn();
const fetchReviewCandidate = vi.fn();
const approveCandidate = vi.fn();
const fetchPublishedGame = vi.fn();

vi.mock('./gameReviewApi.js', () => ({
  fetchGameReview: (...args: unknown[]) => fetchGameReview(...args),
  fetchReviewCandidate: (...args: unknown[]) => fetchReviewCandidate(...args),
  approveCandidate: (...args: unknown[]) => approveCandidate(...args),
}));

vi.mock('./catalog.js', () => ({
  fetchPublishedGame: (...args: unknown[]) => fetchPublishedGame(...args),
}));

// The real frame is a sandboxed iframe; what matters here is which document each
// pane was handed, so the stub records that and nothing else.
vi.mock('./GameFrame.js', () => ({
  GameFrame: (props: { title: string; html?: string }) =>
    createElement('div', { 'data-testid': 'frame', 'data-title': props.title, 'data-html': props.html }),
}));

import { GameReview } from './GameReview.js';

function reviewData(overrides: Partial<GameReviewData> = {}): GameReviewData {
  return {
    baselineVersion: 'v-live',
    candidate: {
      version: 'v-candidate',
      createdAt: '2026-08-04T12:00:00.000Z',
      jobId: 1_000_002,
      title: 'Grip on wet asphalt',
      gate: { green: true, ranAt: '2026-08-04T12:05:00.000Z', report: '31 checks passed' },
    },
    diff: {
      files: [
        { path: 'game.ts', status: 'modified', added: 3, removed: 1 },
        { path: 'wet.ts', status: 'added', added: 1, removed: 0 },
      ],
      filesChanged: 2,
      added: 4,
      removed: 1,
      truncated: false,
    },
    viewerIsOperator: false,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  fetchGameReview.mockReset();
  fetchReviewCandidate.mockReset();
  approveCandidate.mockReset();
  fetchPublishedGame.mockReset();
  fetchGameReview.mockResolvedValue(reviewData());
  fetchPublishedGame.mockResolvedValue({ slug: 'neon-courier', title: 'Neon Courier', html: '<html>live</html>' });
  fetchReviewCandidate.mockResolvedValue({
    slug: 'neon-courier',
    title: 'Grip on wet asphalt',
    html: '<html>candidate</html>',
  });
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

async function renderReview() {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(GameReview, { slug: 'neon-courier' }));
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes(label));
}

describe('GameReview', () => {
  it('puts the live game and the candidate side by side, both playable', async () => {
    await renderReview();

    const frames = Array.from(container.querySelectorAll('[data-testid="frame"]'));
    expect(frames).toHaveLength(2);
    expect(frames[0].getAttribute('data-html')).toBe('<html>live</html>');
    expect(frames[1].getAttribute('data-html')).toBe('<html>candidate</html>');
    expect(container.textContent).toContain('Play both for thirty seconds');
    expect(container.textContent).toContain('gate passed');
    // Publishing is not on offer here, and the page says who does it.
    expect(container.textContent).toContain('an operator does the publishing');
  });

  it('keeps the diff a collapsed footnote', async () => {
    await renderReview();

    expect(container.querySelector('.game-review-diff-list')).toBeNull();
    const toggle = findButton('show what changed in the code');
    expect(toggle?.textContent).toContain('2 files');
    expect(toggle?.textContent).toContain('+4');

    await act(async () => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.game-review-diff-list')?.textContent).toContain('game.ts');
    expect(container.textContent).toContain('+3 −1');
  });

  it('records a sign-off and re-reads the verdict', async () => {
    approveCandidate.mockResolvedValue({ approvedAt: '2026-08-05T00:00:00.000Z' });
    fetchGameReview
      .mockResolvedValueOnce(reviewData())
      .mockResolvedValueOnce(
        reviewData({ candidate: { ...reviewData().candidate!, approvedAt: '2026-08-05T00:00:00.000Z' } }),
      );
    await renderReview();

    await act(async () => {
      findButton('Looks good')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(approveCandidate).toHaveBeenCalledWith('neon-courier', 'v-candidate');
    expect(container.textContent).toContain('You signed off on this');
    expect(findButton('Looks good')).toBeUndefined();
  });

  it('will not offer a sign-off on a build the gate refused', async () => {
    fetchGameReview.mockResolvedValue(
      reviewData({
        candidate: {
          ...reviewData().candidate!,
          gate: { green: false, ranAt: '2026-08-04T12:05:00.000Z', report: '2 checks failed' },
        },
      }),
    );
    await renderReview();

    expect(container.textContent).toContain('gate failed');
    expect(findButton('Looks good')?.disabled).toBe(true);
  });

  it('explains itself to a signed-out visitor rather than erroring', async () => {
    fetchGameReview.mockRejectedValue(Object.assign(new Error('unauthorized'), { code: 'unauthorized' }));
    await renderReview();

    expect(container.textContent).toContain('Sign in as the game’s creator');
    expect(container.querySelector('[data-testid="frame"]')).toBeNull();
    // No candidate is fetched for someone who may not see one.
    expect(fetchReviewCandidate).not.toHaveBeenCalled();
  });

  it('says so when nothing is waiting to be played', async () => {
    fetchGameReview.mockResolvedValue(reviewData({ candidate: null, diff: null }));
    await renderReview();

    expect(container.textContent).toContain('Nothing waiting to be played');
    expect(fetchPublishedGame).not.toHaveBeenCalled();
  });
});
