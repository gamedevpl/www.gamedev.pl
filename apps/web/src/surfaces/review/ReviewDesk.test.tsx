// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';

vi.mock('../../AuthContext.js', () => ({
  useAuth: () => ({
    user: { uid: 'dev:reviewer', tier: 'standard', reviewer: true },
    loading: false,
  }),
}));

vi.mock('../../PublishedGameFrame.js', () => ({
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
        creatorHandle: 'sky-pilot',
        genre: 'arcade',
        jobId: null,
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
        jobId: null,
        media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: null },
      },
    ],
  });
  reviewApi.submitAssessment.mockImplementation(async (input: { slug: string; verdict: string; note: string }) => ({
    id: `${input.slug}:dev:reviewer`,
    slug: input.slug,
    title: input.slug,
    source: 'catalog',
    creatorHandle: null,
    reviewerUid: 'dev:reviewer',
    verdict: input.verdict,
    note: input.note,
    noteOrigin: 'text',
    checklist: {
      graphics: 'ok',
      gameplay: 'ok',
      fun: 'ok',
      sound: 'ok',
      controls: 'ok',
    },
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

async function fillRequiredForm() {
  const note = container.querySelector('#review-note') as HTMLTextAreaElement | null;
  expect(note).toBeTruthy();
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    nativeInputValueSetter?.call(note!, 'Solid first pass.');
    note!.dispatchEvent(new Event('input', { bubbles: true }));
  });

  for (const facet of ['Graphics', 'Gameplay', 'Fun', 'Sound', 'Controls']) {
    const row = Array.from(container.querySelectorAll('.review-checklist-row')).find((el) =>
      el.textContent?.includes(facet),
    );
    expect(row).toBeTruthy();
    const ok = Array.from(row!.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Ok');
    expect(ok).toBeTruthy();
    await act(async () => {
      ok!.click();
    });
  }
  await flush();
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
    expect(container.querySelector('.review-checklist')).toBeTruthy();
    expect(container.textContent).toMatch(/Mic/);
    expect(container.textContent).toMatch(/Try play/);

    const keep = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Keep'),
    );
    expect(keep).toBeTruthy();
    expect(keep!.disabled).toBe(true);
    await fillRequiredForm();
    expect(keep!.disabled).toBe(false);
    await act(async () => {
      keep!.click();
    });
    await flush();

    expect(reviewApi.submitAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'sky-dodge',
        verdict: 'keep',
        note: 'Solid first pass.',
        checklist: {
          graphics: 'ok',
          gameplay: 'ok',
          fun: 'ok',
          sound: 'ok',
          controls: 'ok',
        },
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

  it('opens the full-viewport theater when Try play is pressed', async () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    root = createRoot(container);
    await act(async () => {
      root!.render(<ReviewDesk />);
    });
    await flush();

    const tryPlay = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Try play'),
    );
    expect(tryPlay).toBeTruthy();
    expect(tryPlay!.className).toContain('is-overlay');
    await act(async () => {
      tryPlay!.click();
    });
    await flush();

    const theater = container.querySelector('.stage.is-playing-full-viewport');
    expect(theater).toBeTruthy();
    expect(theater?.getAttribute('role')).toBe('dialog');
    expect(container.querySelector('[data-testid="frame"]')?.textContent).toContain('sky-dodge');
    expect(container.querySelector('video.review-preview-video')).toBeTruthy();
    expect(pauseSpy).toHaveBeenCalled();
    expect(theater?.querySelector('a.theater-author-link')?.getAttribute('href')).toBe('/sky-pilot');
    expect(theater?.textContent).toMatch(/sky-pilot/);
    expect(theater?.querySelector('.remix-btn')).toBeNull();
    expect(document.body.classList.contains('player-open')).toBe(true);

    const exitBtn = theater!.querySelector('button.exit-btn') as HTMLButtonElement | null;
    expect(exitBtn).toBeTruthy();
    await act(async () => {
      exitBtn!.click();
    });
    await flush();

    expect(container.querySelector('.stage.is-playing-full-viewport')).toBeNull();
    expect(document.body.classList.contains('player-open')).toBe(false);
    pauseSpy.mockRestore();
  });

  it('sends cut when the Cut control is pressed', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(<ReviewDesk />);
    });
    await flush();

    await fillRequiredForm();
    const cut = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Cut'));
    await act(async () => {
      cut!.click();
    });
    await flush();

    expect(reviewApi.submitAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'sky-dodge',
        verdict: 'cut',
        note: 'Solid first pass.',
        checklist: expect.objectContaining({ graphics: 'ok', controls: 'ok' }),
      }),
    );
  });

  it('flags a slug an operator explicitly requeued for re-review', async () => {
    reviewApi.fetchReviewQueue.mockResolvedValue({
      source: 'all',
      remaining: 1,
      assessed: 1,
      items: [
        {
          slug: 'sky-dodge',
          title: 'Sky Dodge',
          source: 'catalog',
          creatorHandle: 'sky-pilot',
          genre: 'arcade',
          jobId: null,
          media: { screenshots: [], video: null },
          reReview: { reason: 'Controls fix shipped.', gameVersion: 'v2', requestedAt: '2026-08-06T00:00:00.000Z' },
        },
      ],
    });

    root = createRoot(container);
    await act(async () => {
      root!.render(<ReviewDesk />);
    });
    await flush();

    expect(container.textContent).toContain('Re-review requested');
    expect(container.textContent).toContain('Controls fix shipped.');
  });
});
