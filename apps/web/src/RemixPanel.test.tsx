// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

/*
 * The panel's promise is one door: say what you want. These pin what happens
 * when there is no door — the case that reaches most of the catalog today,
 * because a game only gets a lane by declaring parameters or by living in the
 * store, and a silent panel reads as broken rather than as not-yet.
 */

// A stable identity, as the real context has: `user` is state there, so it does
// not change on every render.
const alice = { uid: 'g:alice' };
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: alice, signInWithGoogleToken: vi.fn(), logout: vi.fn() }),
}));

const remixApi = vi.hoisted(() => ({
  startRemix: vi.fn(),
  remixAssist: vi.fn(),
  remixCode: vi.fn(),
  remixShare: vi.fn(),
  coerceSharedParams: (_specs: unknown, values: unknown) => values,
}));
vi.mock('./remixApi', () => remixApi);

const telemetry = vi.hoisted(() => ({ recordRemixStep: vi.fn() }));
vi.mock('./visitTelemetry', () => telemetry);

vi.mock('./AuthModal', () => ({ AuthModal: () => null }));

import { RemixPanel } from './RemixPanel.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
  vi.clearAllMocks();
});

async function draw() {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <RemixPanel
        slug="dog-dash"
        frameRef={createRef<HTMLIFrameElement>() as never}
        onSwapDocument={() => {}}
        onClose={() => {}}
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('RemixPanel', () => {
  it('says why there is no prompt when no lane answers for this game', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: null,
      values: null,
      canAssist: false,
      canCode: false,
      expiresInMs: 3_600_000,
    });
    await draw();

    // No composer — and, crucially, not silence: a panel offering only an
    // unexplained button is what a player reads as a broken feature.
    expect(container.querySelector('.remix-ask')).toBeNull();
    expect(container.querySelector('.remix-note')?.textContent).toBe(
      "This game can't be remixed yet — but it still plays.",
    );
    // And nothing else: no standing call to action under a panel that has not
    // done anything yet.
    expect(container.textContent).not.toContain('Make it mine');
    // And it is counted: without this rung, a visit that met a dead panel is
    // indistinguishable from one that opened the panel and lost interest.
    expect(telemetry.recordRemixStep).toHaveBeenCalledWith('no_lane');
  });

  it('opens with the composer when a lane can answer', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'Dog size' } } },
      values: { dogScale: 1 },
      canAssist: true,
      canCode: false,
      expiresInMs: 3_600_000,
    });
    await draw();

    expect(container.querySelector('.remix-ask textarea')).not.toBeNull();
    // Prompt-only: the declaration drives the lane, never the player's surface.
    expect(container.querySelector('.remix-sliders')).toBeNull();
    expect(telemetry.recordRemixStep).not.toHaveBeenCalledWith('no_lane');
  });

  it('offers the suggestions the game can act on, and sends one on tap', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'dog size' } } },
      values: { dogScale: 1 },
      canAssist: true,
      canCode: false,
      suggestions: [
        { kind: 'param', key: 'dogScale', direction: 'more' },
        // A key the game does not declare: written by nobody, so rendered by
        // nobody. A suggestion the game cannot act on is a broken promise.
        { kind: 'param', key: 'ghost', direction: 'more' },
      ],
      expiresInMs: 3_600_000,
    });
    remixApi.remixAssist.mockResolvedValue({ lane: 'params', values: { dogScale: 2 } });
    await draw();

    const tries = container.querySelectorAll('.remix-try');
    expect(tries.length).toBe(1);
    expect(tries[0].textContent).toBe('more dog size');

    await act(async () => {
      tries[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Tapping is saying it: one tap, no second step.
    expect(remixApi.remixAssist).toHaveBeenCalledWith('r1', 'more dog size', expect.anything());
  });

  it('offers share only once a change has landed', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'dog size' } } },
      values: { dogScale: 1 },
      canAssist: true,
      canCode: false,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixAssist.mockResolvedValue({ lane: 'params', values: { dogScale: 2 } });
    await draw();

    // Nothing to share before anything has happened.
    expect(container.querySelector('.remix-btn.is-primary')).toBeNull();

    const input = container.querySelector('.remix-ask textarea') as HTMLTextAreaElement;
    await act(async () => {
      nativeSetValue(input, 'bigger dog');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('.remix-ask')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // Earned: share is now the loudest thing on the panel, undo beside it.
    expect(container.querySelector('.remix-btn.is-primary')?.textContent).toBe('Share my version');
    expect(container.querySelector('.remix-btn.is-quiet')?.textContent).toBe('Undo');
    // And the way to a second change is still there, shrunk to a line.
    expect(container.querySelector('.remix-ask.is-compact')).not.toBeNull();
  });
});

/** React tracks the value on the node, so a bare `.value =` is not seen. */
function nativeSetValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(el, value);
}
