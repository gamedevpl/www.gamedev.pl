// @vitest-environment jsdom
import { documentMessage } from '../../test-utils/frameMessage.js';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type { StageCheck } from '../../stageCheckVerdict.js';
import type { StageSource } from '../../useStageSource.js';
import { StudioStage, type StudioStageProps } from './StudioStage.js';

const GAME_A = '<!doctype html><html><head></head><body><canvas id="game">A</canvas></body></html>';
const GAME_B = '<!doctype html><html><head></head><body><canvas id="game">B</canvas></body></html>';

const source = (html: string, version: string): StageSource => ({
  html,
  rawHtml: html,
  origin: { kind: 'staged', at: Date.now(), versionLabel: null, version },
});

async function mount(props: StudioStageProps) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = async (next: StudioStageProps) => {
    await act(async () => {
      root.render(<StudioStage {...next} />);
    });
  };
  await render(props);
  return { host, render, unmount: () => root.unmount() };
}

describe('StudioStage shown version', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('reports and checks the build on screen, not one held back during play', async () => {
    vi.useFakeTimers();
    const onShownVersionChange = vi.fn();
    const checkVerdict = vi.fn((version?: string | null): StageCheck => (version === 'v-a' ? 'passed' : 'checking'));
    const props: StudioStageProps = {
      token: 'tok',
      title: 'Sky Dodge',
      published: false,
      source: source(GAME_A, 'v-a'),
      posture: 'play',
      onPostureChange: vi.fn(),
      covered: false,
      checkVerdict,
      onShownVersionChange,
    };
    const { host, render, unmount } = await mount(props);
    expect(onShownVersionChange).toHaveBeenLastCalledWith('v-a');

    // Player input holds the new build back; the stage still shows A.
    const iframe = host.querySelector('iframe')!;
    await act(async () => {
      window.dispatchEvent(
        documentMessage('message', {
          source: iframe.contentWindow,
          origin: 'null',
          data: { source: 'gdpl-player', type: 'activity' },
        }),
      );
    });
    await render({ ...props, source: source(GAME_B, 'v-b') });
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>A<');
    expect(onShownVersionChange).toHaveBeenLastCalledWith('v-a');
    expect(checkVerdict).toHaveBeenLastCalledWith('v-a');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>B<');
    expect(onShownVersionChange).toHaveBeenLastCalledWith('v-b');
    expect(checkVerdict).toHaveBeenLastCalledWith('v-b');
    unmount();
  });

  it('stays quiet while the gate checks the very build being played', async () => {
    const props = (check: StageCheck): StudioStageProps => ({
      token: 'tok',
      title: 'Sky Dodge',
      published: false,
      source: source(GAME_A, 'v-a'),
      posture: 'watch',
      onPostureChange: vi.fn(),
      covered: false,
      deliveryInGate: true,
      checkVerdict: () => check,
    });
    const playingChecked = await mount(props('checking'));
    expect(playingChecked.host.querySelector('.studio-version-ribbon-exception')).toBeNull();
    expect(playingChecked.host.querySelector('.studio-version-ribbon-depth.is-checking')).not.toBeNull();
    playingChecked.unmount();

    // A different build in the gate is still worth a word.
    const otherInGate = await mount(props('passed'));
    expect(otherInGate.host.querySelector('.studio-version-ribbon-exception')).not.toBeNull();
    otherInGate.unmount();
  });
});
