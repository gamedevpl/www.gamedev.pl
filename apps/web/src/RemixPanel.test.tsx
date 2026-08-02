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
    // The way onward is still offered rather than the panel being a dead end.
    expect(container.textContent).toContain('Make it mine');
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

    expect(container.querySelector('.remix-ask input')).not.toBeNull();
    // Prompt-only: the declaration drives the lane, never the player's surface.
    expect(container.querySelector('.remix-sliders')).toBeNull();
    expect(telemetry.recordRemixStep).not.toHaveBeenCalledWith('no_lane');
  });
});
