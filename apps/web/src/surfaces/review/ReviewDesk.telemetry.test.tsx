// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { dispatchFromFrame } from '../../test-utils/frameMessage.js';
import { performanceWindow, playBatches } from '../../test-utils/playTelemetry.js';

vi.mock('../../AuthContext.js', () => ({
  useAuth: () => ({ user: { uid: 'g:reviewer', reviewer: true }, loading: false }),
}));
vi.mock('../../useAgentBridge.js', () => ({ useAgentBridge: () => null }));
vi.mock('../../catalog.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../catalog.js')>()),
  fetchPublishedGame: vi.fn(async () => ({
    slug: 'biplane-skirmish',
    title: 'Biplane',
    html: '<html><canvas></canvas></html>',
    artifactVersion: 'c'.repeat(64),
  })),
}));
vi.mock('./reviewApi.js', () => ({
  submitAssessment: vi.fn(),
  raiseModerationFlag: vi.fn(),
  fetchReviewQueue: async () => ({
    assessed: 0,
    remaining: 1,
    items: [
      {
        slug: 'biplane-skirmish',
        title: 'Biplane',
        source: 'creator',
        creatorHandle: null,
        genre: null,
        jobId: 42,
        gameVersion: 'candidate-v1',
        media: { screenshots: [{ name: 'opening', file: 'opening.png' }], video: null },
      },
    ],
  }),
}));
import { ReviewDesk } from './ReviewDesk.js';
import { fetchPublishedGame } from '../../catalog.js';

it('collects reviewer play through the real desk, theater and collector', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ReviewDesk />));
    expect(playBatches(fetchSpy)).toHaveLength(0);
    const play = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Try play'),
    )!;
    await act(async () => play.click());
    expect(fetchPublishedGame).toHaveBeenCalledWith(
      'biplane-skirmish',
      expect.objectContaining({ reviewVersion: 'candidate-v1' }),
    );
    expect(playBatches(fetchSpy)[0].events).toMatchObject([{ type: 'game_opened', artifactVersion: 'c'.repeat(64) }]);
    await act(async () => {
      dispatchFromFrame(host.querySelector('iframe')!.contentWindow!, {
        source: 'gdpl-player',
        type: 'alive',
        frames: 300,
        performance: performanceWindow,
      });
      root.unmount();
    });
    expect(playBatches(fetchSpy).at(-1)?.events).toMatchObject([
      { type: 'alive', performance: performanceWindow },
      { type: 'game_closed' },
    ]);
    expect(JSON.stringify(playBatches(fetchSpy))).not.toContain('g:reviewer');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  }
});
