// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { DetailsPanel } from './StudioDetailsPanel.js';
import type { StudioShelfGame } from '../../studioShelf.js';

const hosts: Array<() => void> = [];

async function renderPanel(game: Partial<StudioShelfGame>, pane: 'overview' | 'build' = 'overview') {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onPaneChange = vi.fn();
  const baseGame: StudioShelfGame = {
    token: 'tok-published',
    title: 'Airtime',
    slug: 'airtime',
    lastKnownStatus: 'published',
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    ...game,
  };

  await act(async () => {
    root.render(
      <DetailsPanel
        game={baseGame}
        health={null}
        days={7}
        healthDays={null}
        truncated={false}
        scorecard={null}
        pane={pane}
        onPaneChange={onPaneChange}
        onClose={vi.fn()}
        onDaysChange={vi.fn()}
        onOpenPlaytest={vi.fn()}
        onSwitchToPlatform={vi.fn(async () => {})}
        onPlay={vi.fn()}
        onDraftSharedChange={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );
  });

  hosts.push(() => {
    root.unmount();
    host.remove();
  });

  return { host, onPaneChange };
}

afterEach(() => {
  while (hosts.length) hosts.pop()!();
});

describe('DetailsPanel build pane visibility for published games', () => {
  it('shows the build pane icon for a published game with no active handoff round', async () => {
    const { host, onPaneChange } = await renderPanel({ lastKnownStatus: 'published' });
    const buildIcon = host.querySelector<HTMLButtonElement>('[data-testid="studio-rail-icon-build"]');
    expect(buildIcon).not.toBeNull();

    await act(async () => {
      buildIcon?.click();
    });

    expect(onPaneChange).toHaveBeenCalledWith('build');
  });

  it('renders the build pane content when pane is set to build on a published game', async () => {
    const { host } = await renderPanel({ lastKnownStatus: 'published' }, 'build');
    const buildIcon = host.querySelector<HTMLButtonElement>('[data-testid="studio-rail-icon-build"]');
    expect(buildIcon?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.studio-rail-head h3')?.textContent).toBe('Build progress');
  });
});
