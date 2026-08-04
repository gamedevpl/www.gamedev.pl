// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from './i18n/index.js';
import { StudioPreviewRail } from './StudioPreviewRail.js';
import type { StudioGame } from './studioApi.js';

vi.mock('./catalog.js', () => ({
  fetchPublishedGame: vi.fn(() => Promise.reject(new Error('no published'))),
}));

vi.mock('./submissionApi.js', () => ({
  getSubmissionPreview: vi.fn(() => Promise.reject(new Error('no preview'))),
  getSubmissionStatus: vi.fn(() => Promise.resolve({ media: [] })),
  buildMediaUrl: vi.fn((token: string, item: { ref: string }) => `/media/${token}/${item.ref}`),
}));

vi.mock('./gamePlayer.js', () => ({
  useCreatorPlaytest: () => ({
    paused: false,
    snapshot: null,
    instrumentation: { playSeconds: 0, lastAliveFrames: null, errors: [], progress: [] },
    pause: vi.fn(),
    resume: vi.fn(),
    clearSnapshot: vi.fn(),
  }),
  useGamePlayer: () => null,
}));

vi.mock('./editorBridge.js', () => ({
  useEditorDraftBridge: () => undefined,
}));

vi.mock('./GameFrame.js', () => ({
  GameFrame: () => <div data-testid="game-frame" />,
}));

const game: StudioGame = {
  token: 'tok',
  title: 'Rail Game',
  slug: 'rail-game',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastKnownStatus: 'building',
};

describe('StudioPreviewRail', () => {
  it('renders preview chrome and expand control', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const onExpand = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<StudioPreviewRail game={game} published={false} onExpand={onExpand} />);
    });

    expect(host.querySelector('.studio-preview-rail')).not.toBeNull();
    expect(host.textContent).toMatch(/Preview/i);

    const expand = host.querySelector('.studio-preview-expand') as HTMLButtonElement;
    expect(expand).not.toBeNull();
    await act(async () => {
      expand.click();
    });
    expect(onExpand).toHaveBeenCalled();

    root.unmount();
    host.remove();
  });
});
