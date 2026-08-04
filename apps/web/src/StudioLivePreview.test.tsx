// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioLivePreview } from './StudioLivePreview.js';

const GAME_HTML = '<!doctype html><html><head></head><body><canvas id="game"></canvas></body></html>';

async function mount(node: React.ReactElement) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  return {
    host,
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
}

describe('StudioLivePreview', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('runs the draft in a sandboxed frame with the safety invariant intact', async () => {
    const { host, unmount } = await mount(
      <StudioLivePreview token="tok" html={GAME_HTML} title="Comet Courier" onOpen={() => {}} />,
    );

    const frame = host.querySelector('iframe') as HTMLIFrameElement;
    // The invariant every generated game renders under. `allow-same-origin` here would
    // hand unreviewed agent output the app's cookies and DOM.
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
    expect(frame.getAttribute('srcdoc')).toContain('<canvas id="game">');
    expect(frame.getAttribute('title')).toBe('Comet Courier');

    unmount();
  });

  it('takes no input and no focus — it is a window, not a place to play', async () => {
    const { host, unmount } = await mount(
      <StudioLivePreview token="tok" html={GAME_HTML} title="Comet Courier" onOpen={() => {}} />,
    );

    const frame = host.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('tabindex')).toBe('-1');
    expect(frame.getAttribute('aria-hidden')).toBe('true');

    unmount();
  });

  it('injects the player bridge, so the game’s own title chrome does not eat the frame', async () => {
    const { host, unmount } = await mount(
      <StudioLivePreview token="tok" html={GAME_HTML} title="Comet Courier" onOpen={() => {}} />,
    );

    expect(host.querySelector('iframe')!.getAttribute('srcdoc')).toContain('gdpl-embed');

    unmount();
  });

  it('opens the real player when the card is clicked', async () => {
    const onOpen = vi.fn();
    const { host, unmount } = await mount(
      <StudioLivePreview token="tok" html={GAME_HTML} title="Comet Courier" onOpen={onOpen} />,
    );

    await act(async () => {
      (host.querySelector('.studio-live-preview-open') as HTMLButtonElement).click();
    });

    expect(onOpen).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('renders nothing before there is a draft to show', async () => {
    const { host, unmount } = await mount(
      <StudioLivePreview token="tok" html={null} title="Comet Courier" onOpen={() => {}} />,
    );

    expect(host.querySelector('[data-testid="studio-live-preview"]')).toBeNull();

    unmount();
  });

  it('stays dismissed for the session, per game', async () => {
    const first = await mount(<StudioLivePreview token="tok" html={GAME_HTML} title="A" onOpen={() => {}} />);
    await act(async () => {
      (first.host.querySelector('.studio-live-preview-dismiss') as HTMLButtonElement).click();
    });
    expect(first.host.querySelector('[data-testid="studio-live-preview"]')).toBeNull();
    first.unmount();

    // A remount of the same thread respects it…
    const again = await mount(<StudioLivePreview token="tok" html={GAME_HTML} title="A" onOpen={() => {}} />);
    expect(again.host.querySelector('[data-testid="studio-live-preview"]')).toBeNull();
    again.unmount();

    // …and another game's thread is unaffected, because dismissal is about this build.
    const other = await mount(<StudioLivePreview token="other" html={GAME_HTML} title="B" onOpen={() => {}} />);
    expect(other.host.querySelector('[data-testid="studio-live-preview"]')).not.toBeNull();
    other.unmount();
  });

  it('mutes the frame on load, and keeps trying while the game boots', async () => {
    vi.useFakeTimers();
    const posted: unknown[] = [];
    const { host, unmount } = await mount(
      <StudioLivePreview token="tok" html={GAME_HTML} title="Comet Courier" onOpen={() => {}} />,
    );

    const frame = host.querySelector('iframe') as HTMLIFrameElement;
    Object.defineProperty(frame, 'contentWindow', {
      value: { postMessage: (message: unknown) => posted.push(message) },
      configurable: true,
    });

    await act(async () => {
      frame.dispatchEvent(new Event('load'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    // A background thumbnail that starts playing music is a bug however faithful it is.
    expect(posted.length).toBeGreaterThan(1);
    expect(posted[0]).toMatchObject({ source: 'gdpl-host', type: 'setSound', muted: true });

    unmount();
  });

  it('freezes the game while the tab is in the background', async () => {
    const posted: Array<{ type?: string }> = [];
    const { host, unmount } = await mount(
      <StudioLivePreview token="tok" html={GAME_HTML} title="Comet Courier" onOpen={() => {}} />,
    );

    const frame = host.querySelector('iframe') as HTMLIFrameElement;
    Object.defineProperty(frame, 'contentWindow', {
      value: { postMessage: (message: { type?: string }) => posted.push(message) },
      configurable: true,
    });

    const setVisibility = (state: DocumentVisibilityState) =>
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

    setVisibility('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(posted.map((message) => message.type)).toContain('pause');

    setVisibility('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(posted.map((message) => message.type)).toContain('resume');

    unmount();
  });
});
