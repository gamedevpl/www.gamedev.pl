// @vitest-environment jsdom
import { documentMessage } from '../../test-utils/frameMessage.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioStage, type StudioStageProps } from './StudioStage.js';

const GAME_A = '<!doctype html><html><head></head><body><canvas id="game">A</canvas></body></html>';
const GAME_B = '<!doctype html><html><head></head><body><canvas id="game">B</canvas></body></html>';

function baseProps(overrides: Partial<StudioStageProps> = {}): StudioStageProps {
  return {
    token: 'tok',
    title: 'Sky Dodge',
    published: false,
    source: { html: GAME_A, rawHtml: GAME_A, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    posture: 'watch',
    onPostureChange: vi.fn(),
    covered: false,
    ...overrides,
  };
}

async function mount(props: StudioStageProps) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const rerender = async (next: StudioStageProps) => {
    await act(async () => {
      root.render(<StudioStage {...next} />);
    });
  };
  await rerender(props);
  return { host, rerender, unmount: () => root.unmount() };
}

describe('StudioStage drew-nothing check', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  async function swapAndSendAlive(host: HTMLElement, frames: number) {
    const iframe = host.querySelector('iframe')!;
    await act(async () => {
      window.dispatchEvent(
        documentMessage('message', {
          source: iframe.contentWindow,
          origin: 'null',
          data: { source: 'gdpl-player', type: 'alive', frames },
        }),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it('does not call a slow-loading build blank before its first heartbeat arrives', async () => {
    vi.useFakeTimers();
    const onStatusChange = vi.fn();
    const props = baseProps({ posture: 'watch', onStatusChange });
    const { host, rerender, unmount } = await mount(props);
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    // First heartbeat lands 5s after document start, not swap.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });
    expect(onStatusChange).not.toHaveBeenCalledWith({ kind: 'drew-nothing' });
    await swapAndSendAlive(host, 240);
    expect(onStatusChange).not.toHaveBeenCalledWith({ kind: 'drew-nothing' });
    expect(host.textContent).not.toContain("didn't draw anything");
    unmount();
  });

  it('reports a blank build from its heartbeat and clears once frames appear', async () => {
    vi.useFakeTimers();
    const onStatusChange = vi.fn();
    const props = baseProps({ posture: 'watch', onStatusChange });
    const { host, rerender, unmount } = await mount(props);
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    await swapAndSendAlive(host, 0);
    expect(onStatusChange).toHaveBeenLastCalledWith({ kind: 'drew-nothing' });
    await swapAndSendAlive(host, 120);
    expect(onStatusChange).toHaveBeenLastCalledWith({ kind: 'ready' });
    // A later quiet window does not flip it back.
    await swapAndSendAlive(host, 0);
    expect(onStatusChange).toHaveBeenLastCalledWith({ kind: 'ready' });
    unmount();
  });

  it('calls a build blank when it never sends a heartbeat', async () => {
    vi.useFakeTimers();
    const onStatusChange = vi.fn();
    const props = baseProps({ posture: 'watch', onStatusChange });
    const { rerender, unmount } = await mount(props);
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_100);
    });
    expect(onStatusChange).toHaveBeenLastCalledWith({ kind: 'drew-nothing' });
    unmount();
  });
  it('defers the no-heartbeat verdict while the tab is hidden', async () => {
    vi.useFakeTimers();
    const onStatusChange = vi.fn();
    const props = baseProps({ posture: 'watch', onStatusChange });
    const { rerender, unmount } = await mount(props);
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_100);
    });
    expect(onStatusChange).not.toHaveBeenCalledWith({ kind: 'drew-nothing' });
    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(onStatusChange).toHaveBeenLastCalledWith({ kind: 'drew-nothing' });
    visibility.mockRestore();
    unmount();
  });
});
