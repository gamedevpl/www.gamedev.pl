// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';

const auth = vi.hoisted(() => ({ user: { uid: 'g:creator', name: 'Creator' }, logout: vi.fn() }));
vi.mock('../../AuthContext.js', () => ({ useAuth: () => auth }));
vi.mock('../../studioApi.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../studioApi.js')>()),
  fetchStudioGames: async () => ({
    games: [
      {
        token: 'tok',
        title: 'Biplane',
        slug: 'biplane-skirmish',
        lastKnownStatus: 'published',
        publishedAt: '2026-10-01',
        createdAt: '2026-10-01',
      },
    ],
    truncated: false,
    totalGames: 1,
  }),
  fetchStudioHealth: async () => ({ days: [], truncated: false, games: [] }),
  fetchStudioScorecards: async () => [],
  fetchStudioSuggestions: async () => [],
}));
vi.mock('../../submissionApi.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../submissionApi.js')>()),
  getSubmissionStatus: async () => ({ status: 'published', slug: 'biplane-skirmish', media: [] }),
}));
vi.mock('./StudioStage.js', () => ({
  StudioStage: ({
    telemetryEnabled,
    covered,
    onStatusChange,
  }: {
    telemetryEnabled: boolean;
    covered: boolean;
    onStatusChange: (status: { kind: 'ready' }) => void;
  }) => {
    useEffect(() => onStatusChange({ kind: 'ready' }), [onStatusChange]);
    return <div data-testid="stage-ownership" data-enabled={String(telemetryEnabled)} data-covered={String(covered)} />;
  },
}));
vi.mock('../../GameTheater.js', () => ({
  GameTheater: ({ onExit }: { onExit: () => void }) => (
    <button data-testid="exit-theater" onClick={onExit}>
      Exit
    </button>
  ),
}));
const source = vi.hoisted(() => ({
  html: '<canvas/>',
  rawHtml: '<canvas/>',
  origin: { kind: 'delivered', at: null, versionLabel: null, artifactVersion: 'a'.repeat(64) },
  pushPreview: vi.fn(),
}));
vi.mock('../../useStageSource.js', () => ({ useStageSource: () => source }));
import { CreatorStudioView } from './CreatorStudioView.js';

it('hands collection to the full theater and restores inline ownership on exit', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<CreatorStudioView selectedGame="tok" onNavigate={vi.fn()} onPlay={vi.fn()} />));
    const stage = () => host.querySelector('[data-testid="stage-ownership"]')!;
    expect(stage().getAttribute('data-enabled')).toBe('true');
    const theater = host.querySelector<HTMLButtonElement>(
      '[aria-label="' + i18n.t('studioPanel.stage.openTheater') + '"]',
    );
    expect(theater).not.toBeNull();
    await act(async () => theater!.click());
    expect(stage().getAttribute('data-enabled')).toBe('false');
    expect(stage().getAttribute('data-covered')).toBe('true');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="exit-theater"]')!.click());
    expect(stage().getAttribute('data-enabled')).toBe('true');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
