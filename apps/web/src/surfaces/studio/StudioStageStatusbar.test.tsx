// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioStageStatusbar, type StudioStageStatusbarProps } from './StudioStageStatusbar.js';

async function mount(props: StudioStageStatusbarProps) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StudioStageStatusbar {...props} />);
  });
  return {
    host,
    rerender: async (next: StudioStageStatusbarProps) => {
      await act(async () => {
        root.render(<StudioStageStatusbar {...next} />);
      });
    },
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
}

describe('StudioStageStatusbar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders version ribbon and omits play bar in watch posture', async () => {
    const { host, unmount } = await mount({
      shownOrigin: { kind: 'staged', at: Date.now(), versionLabel: null },
      stageStatus: { kind: 'ready' },
      posture: 'watch',
      shownHtml: '<html></html>',
      paused: false,
      onPause: vi.fn(),
      onResume: vi.fn(),
      onRequestWatch: vi.fn(),
    });

    expect(host.querySelector('.studio-stage-statusbar')).not.toBeNull();
    expect(host.querySelector('.studio-version-ribbon')).not.toBeNull();
    expect(host.querySelector('.studio-stage-play-bar')).toBeNull();
    unmount();
  });

  it('renders play controls in play posture and calls callbacks', async () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onRequestWatch = vi.fn();

    const { host, rerender, unmount } = await mount({
      shownOrigin: { kind: 'staged', at: Date.now(), versionLabel: null },
      stageStatus: { kind: 'ready' },
      posture: 'play',
      shownHtml: '<html></html>',
      paused: false,
      onPause,
      onResume,
      onRequestWatch,
    });

    const playBar = host.querySelector('.studio-stage-play-bar');
    expect(playBar).not.toBeNull();

    const buttons = Array.from(playBar!.querySelectorAll('button'));
    expect(buttons.length).toBe(2);

    // Click pause
    await act(async () => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onPause).toHaveBeenCalledTimes(1);

    // Rerender paused
    await rerender({
      shownOrigin: { kind: 'staged', at: Date.now(), versionLabel: null },
      stageStatus: { kind: 'ready' },
      posture: 'play',
      shownHtml: '<html></html>',
      paused: true,
      onPause,
      onResume,
      onRequestWatch,
    });

    const pausedButtons = Array.from(host.querySelectorAll('.studio-stage-play-bar button'));
    // Click resume
    await act(async () => {
      pausedButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onResume).toHaveBeenCalledTimes(1);

    // Click stop playing
    await act(async () => {
      pausedButtons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRequestWatch).toHaveBeenCalledTimes(1);

    unmount();
  });
});
