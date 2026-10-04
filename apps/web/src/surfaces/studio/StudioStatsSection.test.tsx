// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { StudioGame } from '../../studioApi.js';
import { StatsSection } from './StudioStatsSection.js';

const performance = vi.hoisted(() => vi.fn(() => null));
vi.mock('./StudioPerformance.js', () => ({ StudioPerformance: performance }));
vi.mock('./AutonomySetting.js', () => ({ AutonomySetting: () => null }));
vi.mock('./StudioSuggestions.js', () => ({ SuggestedImprovements: () => null }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it.each([
  { live: false as const, viewerRole: 'owner' as const, mounted: false },
  { live: undefined, viewerRole: 'owner' as const, mounted: true },
  { live: undefined, viewerRole: 'editor' as const, mounted: false },
])('mounts performance only for a live owned game: %j', async ({ live, viewerRole, mounted }) => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  performance.mockClear();
  const container = document.createElement('div');
  const root = createRoot(container);
  const game = { slug: 'space-hop', publishedAt: '2026-10-04T00:00:00Z', live, viewerRole } as StudioGame;
  try {
    await act(async () =>
      root.render(
        <StatsSection
          game={game}
          health={null}
          days={7}
          healthDays={null}
          truncated={false}
          scorecard={null}
          onDaysChange={() => {}}
        />,
      ),
    );
    expect(performance.mock.calls.length > 0).toBe(mounted);
  } finally {
    await act(async () => root.unmount());
  }
});
