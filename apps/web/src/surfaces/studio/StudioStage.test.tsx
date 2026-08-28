// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import {
  embedGameHtml,
  postGameHostMessage,
  requestStateRestore,
  requestStateSnapshot,
  withGameLocale,
} from '../../gamePlayer.js';
import { StudioStage, type StudioStageProps } from './StudioStage.js';

vi.mock('../../submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return { ...actual, submitFeedback: vi.fn() };
});
vi.mock('../../studioApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return { ...actual, submitImprovement: vi.fn() };
});
vi.mock('../../gamePlayer.js', async () => {
  const actual = await vi.importActual<typeof import('../../gamePlayer.js')>('../../gamePlayer.js');
  return {
    ...actual,
    postGameHostMessage: vi.fn(actual.postGameHostMessage),
    requestStateSnapshot: vi.fn(actual.requestStateSnapshot),
    requestStateRestore: vi.fn(actual.requestStateRestore),
  };
});

const mockedPostGameHostMessage = vi.mocked(postGameHostMessage);
const mockedRequestStateSnapshot = vi.mocked(requestStateSnapshot);
const mockedRequestStateRestore = vi.mocked(requestStateRestore);

const GAME_A = '<!doctype html><html><head></head><body><canvas id="game">A</canvas></body></html>';
const GAME_B = '<!doctype html><html><head></head><body><canvas id="game">B</canvas></body></html>';
const GAME_C = '<!doctype html><html><head></head><body><canvas id="game">C</canvas></body></html>';

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

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
  await act(async () => {
    root.render(<StudioStage {...props} />);
  });
  return {
    host,
    root,
    rerender: async (next: StudioStageProps) => {
      await act(async () => {
        root.render(<StudioStage {...next} />);
      });
    },
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
}

describe('StudioStage', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    mockedRequestStateSnapshot.mockClear();
    mockedRequestStateRestore.mockClear();
  });

  it('is pointer-inert in watch posture — a window, not a place to play', async () => {
    const { host, unmount } = await mount(baseProps());
    expect(host.querySelector('.studio-stage')?.classList.contains('is-watch')).toBe(true);
    const frame = host.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame!.getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
    unmount();
  });

  it('swaps the srcDoc immediately in watch posture', async () => {
    const props = baseProps();
    const { host, rerender, unmount } = await mount(props);
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>A<');

    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>B<');
    unmount();
  });

  // Dispatches the bridge's activity message as if the game sent it.
  function sendGameActivity(host: HTMLElement) {
    const iframe = host.querySelector('iframe')!;
    const event = new MessageEvent('message', { data: { source: 'gdpl-player', type: 'activity' } });
    Object.defineProperty(event, 'source', { value: iframe.contentWindow });
    Object.defineProperty(event, 'origin', { value: 'null' });
    window.dispatchEvent(event);
  }

  // Dispatches the bridge's held message for a pointer press or release.
  function sendPointerHeld(host: HTMLElement, held: boolean) {
    const iframe = host.querySelector('iframe')!;
    const event = new MessageEvent('message', { data: { source: 'gdpl-player', type: 'held', held } });
    Object.defineProperty(event, 'source', { value: iframe.contentWindow });
    Object.defineProperty(event, 'origin', { value: 'null' });
    window.dispatchEvent(event);
  }

  it('holds a new stage during play only while input is active, no toast, and applies it once idle', async () => {
    vi.useFakeTimers();
    const props = baseProps({ posture: 'play' });
    const { host, rerender, unmount } = await mount(props);
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>A<');

    await act(async () => sendGameActivity(host));
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });

    // Held while input is still fresh — no toast, no manual choice offered.
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>A<');
    expect(host.querySelector('.studio-swap-toast')).toBeNull();

    // Once idle, the held build applies after its snapshot request times out.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>B<');
    // Nothing to restore without a snapshot.
    expect(mockedRequestStateRestore).not.toHaveBeenCalled();
    unmount();
  });

  it('snapshots state before an idle-triggered swap applies, then restores it on the new frame', async () => {
    vi.useFakeTimers();
    mockedRequestStateSnapshot.mockResolvedValueOnce({ score: 7 });
    mockedRequestStateRestore.mockResolvedValueOnce(true);
    const props = baseProps({ posture: 'play' });
    const { host, rerender, unmount } = await mount(props);

    await act(async () => sendGameActivity(host));
    const oldFrame = host.querySelector('iframe');
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(mockedRequestStateSnapshot).toHaveBeenCalledExactlyOnceWith(oldFrame);
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>B<');
    // Restores against the now-swapped frame, which is the same DOM node.
    expect(mockedRequestStateRestore).toHaveBeenCalledExactlyOnceWith(host.querySelector('iframe'), { score: 7 });
    unmount();
  });

  it('retries a restore that the new frame is not ready for yet, up to the retry schedule', async () => {
    vi.useFakeTimers();
    mockedRequestStateSnapshot.mockResolvedValueOnce({ score: 7 });
    mockedRequestStateRestore.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const props = baseProps({ posture: 'play' });
    const { host, rerender, unmount } = await mount(props);

    await act(async () => sendGameActivity(host));
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mockedRequestStateRestore).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('never re-applies a stale build once a newer one lands while its snapshot is in flight', async () => {
    vi.useFakeTimers();
    let resolveSnapshot: ((value: unknown) => void) | null = null;
    mockedRequestStateSnapshot.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      }),
    );
    const props = baseProps({ posture: 'play' });
    const { host, rerender, unmount } = await mount(props);

    await act(async () => sendGameActivity(host));
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    // Idle triggers the swap to B, which stalls snapshotting A.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockedRequestStateSnapshot).toHaveBeenCalledTimes(1);
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>A<');

    // Build C arrives while idle — applies immediately, superseding B.
    await act(async () => {
      await rerender({
        ...props,
        source: { html: GAME_C, rawHtml: GAME_C, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
      });
    });
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>C<');

    // B's stalled snapshot resolves — must not overwrite C.
    await act(async () => {
      resolveSnapshot!(null);
      await flushPromises();
    });
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>C<');
    unmount();
  });

  it('keeps a held stage while a pointer is held past the idle window, and applies it on release', async () => {
    vi.useFakeTimers();
    const props = baseProps({ posture: 'play' });
    const { host, rerender, unmount } = await mount(props);

    await act(async () => sendPointerHeld(host, true));
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });

    // Still held past the idle window — a drag must not read idle.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>A<');

    // Release restarts the countdown; the build applies once idle and snapshotted.
    await act(async () => sendPointerHeld(host, false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>B<');
    unmount();
  });

  it('applies a new stage immediately during play when input is already idle', async () => {
    const props = baseProps({ posture: 'play' });
    const { host, rerender, unmount } = await mount(props);

    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });

    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>B<');
    unmount();
  });

  it('applies a held swap immediately on leaving play, even mid-input', async () => {
    vi.useFakeTimers();
    const props = baseProps({ posture: 'play' });
    const { host, rerender, unmount } = await mount(props);

    await act(async () => sendGameActivity(host));
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>A<');

    await rerender({
      ...props,
      posture: 'watch',
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>B<');
    unmount();
  });

  it('reports status changes to the parent as builds land and go away', async () => {
    const onStatusChange = vi.fn();
    const props = baseProps({
      source: { html: null, rawHtml: null, origin: { kind: 'none', at: null, versionLabel: null } },
      onStatusChange,
    });
    const { rerender, unmount } = await mount(props);

    await rerender({
      ...props,
      source: { html: GAME_A, rawHtml: GAME_A, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    expect(onStatusChange).toHaveBeenCalledWith({ kind: 'ready' });

    onStatusChange.mockClear();
    await rerender({
      ...props,
      source: { html: null, rawHtml: null, origin: { kind: 'none', at: null, versionLabel: null } },
    });
    expect(onStatusChange).toHaveBeenCalledWith({ kind: 'empty' });
    unmount();
  });

  it('Escape exits play posture only when nothing covers the stage (topmost-layer-first)', async () => {
    const onPostureChange = vi.fn();
    const covered = await mount(baseProps({ posture: 'play', covered: true, onPostureChange }));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onPostureChange).not.toHaveBeenCalled();
    covered.unmount();

    const uncovered = await mount(baseProps({ posture: 'play', covered: false, onPostureChange }));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onPostureChange).toHaveBeenCalledWith('watch');
    uncovered.unmount();
  });

  it('throttles to idle after ten minutes of watching with no activity, and resumes on tap', async () => {
    vi.useFakeTimers();
    const { host, unmount } = await mount(baseProps());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 10);
    });
    expect(host.querySelector('.studio-stage')?.classList.contains('is-idle')).toBe(true);
    const poster = host.querySelector('.studio-stage-idle-poster') as HTMLButtonElement | null;
    expect(poster).not.toBeNull();

    await act(async () => {
      poster!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelector('.studio-stage')?.classList.contains('is-idle')).toBe(false);
    unmount();
  });

  it('embeds the player bridge exactly once — the stage does its own embedding, not a pre-embedded document', async () => {
    // Mirrors what useStageSource actually hands the stage: `html` pre-embedded for a
    // caller that renders it directly, `rawHtml` for one (this component) that embeds
    // it itself via GameFrame's `embed` prop.
    const embedded = embedGameHtml(withGameLocale(GAME_A, 'en'));
    const { host, unmount } = await mount(
      baseProps({
        source: { html: embedded, rawHtml: GAME_A, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
      }),
    );
    const srcdoc = host.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
    expect(srcdoc.match(/id="gdpl-embed"/g)?.length).toBe(1);
    unmount();
  });

  it('does not promote a crashing swap to the crash-recovery target', async () => {
    vi.useFakeTimers();
    const props = baseProps({ posture: 'play' });
    const { host, rerender, unmount } = await mount(props);

    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });
    // No input was simulated — the swap applies right away.
    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>B<');

    // B crashes well inside the watch window — before it could ever have been
    // confirmed good. Play posture's crash handler must restore A, not the same B
    // that just crashed.
    const iframe = host.querySelector('iframe')!;
    await act(async () => {
      const event = new MessageEvent('message', {
        data: { source: 'gdpl-player', type: 'error', message: 'boom' },
      });
      Object.defineProperty(event, 'source', { value: iframe.contentWindow });
      Object.defineProperty(event, 'origin', { value: 'null' });
      window.dispatchEvent(event);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toContain('>A<');
    unmount();
  });

  it('crash card surfaces a Fix it button that reports the crash message', async () => {
    vi.useFakeTimers();
    const onFixIt = vi.fn();
    const props = baseProps({ posture: 'watch', onFixIt });
    const { host, rerender, unmount } = await mount(props);
    // Swap sources so the crash listener attaches (mount alone skips it).
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });

    const iframe = host.querySelector('iframe')!;
    await act(async () => {
      const event = new MessageEvent('message', {
        data: { source: 'gdpl-player', type: 'error', message: 'Bastion requires gfx3d' },
      });
      Object.defineProperty(event, 'source', { value: iframe.contentWindow });
      Object.defineProperty(event, 'origin', { value: 'null' });
      window.dispatchEvent(event);
      await vi.advanceTimersByTimeAsync(0);
    });

    const fixItBtn = Array.from(host.querySelectorAll('button')).find((btn) => /fix it/i.test(btn.textContent ?? ''));
    expect(fixItBtn).not.toBeUndefined();
    await act(async () => {
      fixItBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onFixIt).toHaveBeenCalledWith('Bastion requires gfx3d');
    unmount();
  });

  it('omits the Fix it button when no handler is wired', async () => {
    vi.useFakeTimers();
    const props = baseProps({ posture: 'watch' });
    const { host, rerender, unmount } = await mount(props);
    await rerender({
      ...props,
      source: { html: GAME_B, rawHtml: GAME_B, origin: { kind: 'staged', at: Date.now(), versionLabel: null } },
    });

    const iframe = host.querySelector('iframe')!;
    await act(async () => {
      const event = new MessageEvent('message', {
        data: { source: 'gdpl-player', type: 'error', message: 'boom' },
      });
      Object.defineProperty(event, 'source', { value: iframe.contentWindow });
      Object.defineProperty(event, 'origin', { value: 'null' });
      window.dispatchEvent(event);
      await vi.advanceTimersByTimeAsync(0);
    });

    const fixItBtn = Array.from(host.querySelectorAll('button')).find((btn) => /fix it/i.test(btn.textContent ?? ''));
    expect(fixItBtn).toBeUndefined();
    unmount();
  });

  it('unmutes and resumes the frame on entering play — watching must not leave a game silent forever', async () => {
    vi.useFakeTimers();
    const props = baseProps({ posture: 'watch' });
    const { rerender, unmount } = await mount(props);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    mockedPostGameHostMessage.mockClear();

    await rerender({ ...props, posture: 'play' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });

    const messages = mockedPostGameHostMessage.mock.calls.map(([, message]) => message);
    expect(messages).toContainEqual({ type: 'resume' });
    expect(messages).toContainEqual({ type: 'setSound', muted: false });
    unmount();
  });
});
