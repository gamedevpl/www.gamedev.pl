// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { playBatches } from './test-utils/playTelemetry.js';

vi.mock('./catalog.js', () => ({
  fetchPublishedGame: vi.fn(async () => ({
    slug: 'space-hop',
    title: 'Space Hop',
    html: '<html>content</html>',
    artifactVersion: 'a'.repeat(64),
  })),
}));
vi.mock('./recommendationsApi.js', () => ({ recordGamePlayed: vi.fn() }));
vi.mock('./recentPlays.js', () => ({ rememberRecentPlay: vi.fn() }));
import { PublishedGameFrame } from './PublishedGameFrame.js';
import { fetchPublishedGame } from './catalog.js';
import { recordGamePlayed } from './recommendationsApi.js';
import { rememberRecentPlay } from './recentPlays.js';

it.each([undefined, 'candidate-v1'])(
  'collects playback without adding review candidates to affinity: %s',
  async (reviewVersion) => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(recordGamePlayed).mockClear();
    vi.mocked(rememberRecentPlay).mockClear();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(<PublishedGameFrame slug="space-hop" title="Space Hop" reviewVersion={reviewVersion} embed />),
      );
      expect(fetchPublishedGame).toHaveBeenLastCalledWith('space-hop', expect.objectContaining({ reviewVersion }));
      expect(playBatches(fetchSpy)[0].events).toMatchObject([{ type: 'game_opened', artifactVersion: 'a'.repeat(64) }]);
      expect(recordGamePlayed).toHaveBeenCalledTimes(reviewVersion ? 0 : 1);
      expect(rememberRecentPlay).toHaveBeenCalledTimes(reviewVersion ? 0 : 1);
      await act(async () => root.unmount());
      expect(playBatches(fetchSpy).at(-1)?.events).toMatchObject([{ type: 'game_closed' }]);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.restoreAllMocks();
    }
  },
);
