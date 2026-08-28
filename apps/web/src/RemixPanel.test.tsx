// @vitest-environment jsdom

import { act } from 'react';
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
let authUser: typeof alice | null = alice;
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: authUser, signInWithGoogleToken: vi.fn(), logout: vi.fn() }),
}));

const remixApi = vi.hoisted(() => ({
  startRemix: vi.fn(),
  getRemix: vi.fn(),
  remixAssist: vi.fn(),
  remixCode: vi.fn(),
  remixShare: vi.fn(),
  remixSave: vi.fn(),
  remixUndo: vi.fn(),
  coerceSharedParams: (_specs: unknown, values: unknown) => values,
}));
vi.mock('./remixApi', () => remixApi);

/** Button text is the stable handle — quiet/primary classes are shared by Keep and Undo. */
function buttonNamed(root: ParentNode, name: string): HTMLButtonElement | null {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === name) ?? null;
}

const telemetry = vi.hoisted(() => ({ recordRemixStep: vi.fn() }));
vi.mock('./visitTelemetry', () => telemetry);

vi.mock('./AuthModal', () => ({ AuthModal: () => null }));

import { RemixPanel } from './RemixPanel.js';
import { clearRemixSnapshot, writeRemixSnapshot } from './remixSessionPersist.js';

let container: HTMLDivElement;
let root: Root | null = null;
let swapped: string[] = [];

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  authUser = alice;
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  swapped = [];
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
  clearRemixSnapshot();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

/** Stands in for the game frame, so a message can claim to come from it. */
const frameWindow = { postMessage: () => {} } as unknown as Window;
const frameRef = { current: { contentWindow: frameWindow } } as unknown as React.RefObject<HTMLIFrameElement>;

function panel(props: { initialRequest?: string; theaterChromeHidden?: boolean; session?: object } = {}) {
  return (
    <RemixPanel
      slug="dog-dash"
      frameRef={frameRef as never}
      onSwapDocument={(html) => swapped.push(html)}
      onClose={() => {}}
      initialRequest={props.initialRequest}
      theaterChromeHidden={props.theaterChromeHidden}
      session={props.session as never}
    />
  );
}

async function draw(props: { initialRequest?: string; theaterChromeHidden?: boolean; session?: object } = {}) {
  root = createRoot(container);
  await act(async () => {
    root!.render(panel(props));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('RemixPanel', () => {
  it('auto-starts a carried request exactly once after the session is ready', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { speed: { type: 'number', min: 1, max: 3, default: 1, label: { en: 'speed' } } },
      values: { speed: 1 },
      canAssist: true,
      canCode: true,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixAssist.mockResolvedValue({ lane: 'params', values: { speed: 2 } });

    await draw({ initialRequest: '  make it faster  ' });
    await vi.waitFor(() => {
      expect(remixApi.remixAssist).toHaveBeenCalledTimes(1);
    });

    expect(remixApi.remixAssist).toHaveBeenCalledWith('r1', 'make it faster', { speed: 1 }, 'en');
    expect(remixApi.remixCode).not.toHaveBeenCalled();
    expect(telemetry.recordRemixStep).toHaveBeenCalledWith('typed');
    expect(telemetry.recordRemixStep).toHaveBeenCalledWith('asked');
  });

  it('carries a signed-out request through the existing pending-request wall', async () => {
    authUser = null;
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: null,
      values: null,
      canAssist: true,
      canCode: true,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixAssist.mockResolvedValue({ lane: 'params', values: {} });

    await draw({ initialRequest: 'make it faster' });

    expect(remixApi.startRemix).not.toHaveBeenCalled();
    expect(remixApi.remixAssist).not.toHaveBeenCalled();
    expect(telemetry.recordRemixStep).toHaveBeenCalledWith('typed');
    expect(telemetry.recordRemixStep).toHaveBeenCalledWith('wall_shown');

    authUser = alice;
    await act(async () => {
      root!.render(panel({ initialRequest: 'make it faster' }));
    });
    await vi.waitFor(() => {
      expect(remixApi.remixAssist).toHaveBeenCalledTimes(1);
    });

    expect(remixApi.remixAssist).toHaveBeenCalledWith('r1', 'make it faster', {}, 'en');
    expect(telemetry.recordRemixStep).toHaveBeenCalledWith('signed_in');
  });

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

  it('offers the suggestions the game can act on, and a tap fills the box rather than sending', async () => {
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

    // Inert while the gesture that opened the panel is still landing.
    expect((tries[0] as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      // Real time rather than fake: this file drives the panel through awaited
      // promises, and swapping the clock under those is more fragile than the
      // half-second it saves.
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect((tries[0] as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      tries[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // A tap fills the composer and stops. It used to send, which made a mis-tap
    // — on a control that arrives late, under a composer that grows as you type
    // — cost a rebuild and an undo. The sentence is a starting point to edit,
    // not a wish granted whole.
    expect(remixApi.remixAssist).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLTextAreaElement>('.remix-ask textarea')?.value).toBe('more dog size');
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

    // Earned: share is the loudest thing; Undo sits quiet beside it. Keep is
    // not on the row — it waits for a few landings, with a header escape hatch.
    expect(container.querySelector('.remix-btn.is-primary')?.textContent).toBe('Share my version');
    expect(buttonNamed(container, 'Make it mine')).toBeNull();
    expect(buttonNamed(container, 'Keep in Studio')).toBeNull();
    expect(buttonNamed(container, 'Save to Studio')).not.toBeNull();
    expect(buttonNamed(container, 'Undo')?.classList.contains('is-quiet')).toBe(true);
    // And the way to a second change is still there, shrunk to a line.
    expect(container.querySelector('.remix-ask.is-compact')).not.toBeNull();
  });

  it('keeps the last change undoable when the follow-up fails', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'dog size' } } },
      values: { dogScale: 1 },
      canAssist: true,
      canCode: false,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixAssist.mockResolvedValueOnce({ lane: 'params', values: { dogScale: 2 } });
    await draw();
    await send('bigger dog');
    expect(buttonNamed(container, 'Undo')).not.toBeNull();

    // The follow-up misses. The player's way back to the state they liked must
    // survive it — that is the moment they want it most.
    remixApi.remixAssist.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 503 }));
    await send('something impossible');

    expect(container.querySelector('.remix-note.is-error')).not.toBeNull();
    expect(buttonNamed(container, 'Undo')).not.toBeNull();
    // Keep stays off the row; the header hatch is enough after one landing.
    expect(buttonNamed(container, 'Make it mine')).toBeNull();
    expect(buttonNamed(container, 'Save to Studio')).not.toBeNull();
  });

  it('proposes the painter for a content-shaped request instead of falling through to code', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'dog size' } } },
      values: { dogScale: 1 },
      content: {
        maps: {
          widget: 'collection',
          label: { en: 'Maps', pl: 'Mapy' },
          itemLabel: { en: 'Map', pl: 'Mapa' },
          min: 1,
          max: 3,
          item: {
            widget: 'tilemap',
            grid: { minCols: 3, maxCols: 8, minRows: 3, maxRows: 8 },
            tiles: [
              { key: 'path', char: '.', label: { en: 'Path', pl: 'Ścieżka' } },
              { key: 'wall', char: '#', label: { en: 'Wall', pl: 'Mur' } },
            ],
            properties: {},
            constraints: [],
          },
          defaults: [{ properties: {}, rows: ['...', '.#.', '...'] }],
        },
      },
      canAssist: true,
      // The code lane is live — and must still not be where a map change lands.
      canCode: true,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixAssist.mockResolvedValue({ lane: 'content' });
    await draw();
    await send('move the walls around');

    // No rebuild was requested; the proposal is the whole answer.
    expect(remixApi.remixCode).not.toHaveBeenCalled();
    const offer = container.querySelector('.remix-actions-row .remix-btn.is-primary');
    expect(offer?.textContent).toBe('Open the level editor');

    // Taking the offer opens the full-bleed editor stage (not a sheet widget).
    await act(async () => {
      offer!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.remix-editor-stage.is-focus-edit')).not.toBeNull();
    expect(container.querySelector('.remix-panel')).toBeNull();
    expect(buttonNamed(container, 'Done')).not.toBeNull();
    expect(container.querySelector('.remix-painter .editor-board')).not.toBeNull();
    expect(container.querySelectorAll('.remix-painter .editor-tile').length).toBe(2);

    // Painting a cell records the rung with the door that led here — and the
    // dedupe means the funnel keeps this first door.
    const cell = container.querySelector('.remix-painter .editor-cell') as HTMLButtonElement;
    await act(async () => {
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(telemetry.recordRemixStep).toHaveBeenCalledWith('painted', { via: 'redirect' });
  });

  it('opens straight onto the painter when it is the only lane — the flags-off state', async () => {
    // Both model flags off, no params — but the game declares maps. The free
    // lane needs no model, so the panel must not say "can't be remixed yet",
    // and the visit must not count as `no_lane`: a painter is a way in.
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: null,
      values: null,
      content: {
        maps: {
          widget: 'collection',
          label: { en: 'Maps', pl: 'Mapy' },
          itemLabel: { en: 'Map', pl: 'Mapa' },
          min: 1,
          max: 3,
          item: {
            widget: 'tilemap',
            grid: { minCols: 3, maxCols: 8, minRows: 3, maxRows: 8 },
            tiles: [{ key: 'path', char: '.', label: { en: 'Path', pl: 'Ścieżka' } }],
            properties: {},
            constraints: [],
          },
          defaults: [{ properties: {}, rows: ['...', '...', '...'] }],
        },
      },
      canAssist: false,
      canCode: false,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    await draw();

    expect(container.querySelector('.remix-editor-stage')).not.toBeNull();
    expect(container.querySelector('.remix-painter .editor-board')).not.toBeNull();
    expect(container.textContent).not.toContain("This game can't be remixed yet");
    expect(telemetry.recordRemixStep).not.toHaveBeenCalledWith('no_lane');

    const cell = container.querySelector('.remix-painter .editor-cell') as HTMLButtonElement;
    await act(async () => {
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(telemetry.recordRemixStep).toHaveBeenCalledWith('painted', { via: 'panel' });
  });

  it('flips Edit ↔ Play focus without unmounting the painter, and reports the stage', async () => {
    const onEditorStage = vi.fn();
    const frameFocus = vi.fn();
    const contentFocus = vi.fn();
    const focusFrameRef = {
      current: { focus: frameFocus, contentWindow: { focus: contentFocus, postMessage: () => {} } },
    } as unknown as React.MutableRefObject<HTMLIFrameElement | null>;
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: null,
      values: null,
      content: {
        routes: {
          widget: 'collection',
          label: { en: 'Routes', pl: 'Trasy' },
          itemLabel: { en: 'Route', pl: 'Trasa' },
          min: 1,
          max: 1,
          item: {
            widget: 'path',
            gridCols: 8,
            gridRows: 6,
            minPoints: 2,
            maxPoints: 8,
            closed: false,
            properties: { name: { type: 'text', max: 24 } },
          },
          defaults: [
            {
              properties: { name: 'Opening' },
              points: [
                { x: 0, y: 1 },
                { x: 7, y: 4 },
              ],
            },
          ],
        },
      },
      canAssist: false,
      canCode: false,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <RemixPanel
          slug="dog-dash"
          frameRef={focusFrameRef as never}
          onSwapDocument={() => {}}
          onClose={() => {}}
          onEditorStage={onEditorStage}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onEditorStage).toHaveBeenCalledWith({ active: true, focus: 'edit' });
    expect(container.querySelector('.remix-editor-stage.is-focus-edit')).not.toBeNull();
    const path = container.querySelector('.remix-painter .editor-path');
    expect(path).not.toBeNull();

    await act(async () => {
      buttonNamed(container, 'Play')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.remix-editor-stage.is-focus-play')).not.toBeNull();
    expect(onEditorStage).toHaveBeenLastCalledWith({ active: true, focus: 'play' });
    // Same painter tree — focus is CSS, not a remount.
    expect(container.querySelector('.remix-painter .editor-path')).toBe(path);
    // Keyboard input must land in the game without an extra click on the iframe.
    expect(frameFocus).toHaveBeenCalled();
    expect(contentFocus).toHaveBeenCalled();

    await act(async () => {
      buttonNamed(container, 'Done')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.remix-editor-stage')).toBeNull();
    expect(container.querySelector('.remix-panel')).not.toBeNull();
    // Done from Play still clears with the default edit focus — not a stale 'play'.
    expect(onEditorStage).toHaveBeenLastCalledWith({ active: false, focus: 'edit' });
  });

  it('pushes the whole content document over the bridge, never params alone', async () => {
    // The game-side module replaces its content with what arrives. A params-only
    // push to a game that also declares collections hands it a document with no
    // maps — and its next restart reads maps that are no longer there.
    const postMessage = vi.fn();
    const frameRef = {
      current: { contentWindow: { postMessage } },
    } as unknown as React.MutableRefObject<HTMLIFrameElement | null>;
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'dog size' } } },
      values: { dogScale: 1 },
      content: {
        maps: {
          widget: 'collection',
          label: { en: 'Maps', pl: 'Mapy' },
          itemLabel: { en: 'Map', pl: 'Mapa' },
          min: 1,
          max: 3,
          item: {
            widget: 'tilemap',
            grid: { minCols: 3, maxCols: 8, minRows: 3, maxRows: 8 },
            tiles: [{ key: 'path', char: '.', label: { en: 'Path', pl: 'Ścieżka' } }],
            properties: {},
            constraints: [],
          },
          defaults: [{ properties: {}, rows: ['...', '...', '...'] }],
        },
      },
      canAssist: true,
      canCode: false,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixAssist.mockResolvedValue({ lane: 'params', values: { dogScale: 2 } });

    root = createRoot(container);
    await act(async () => {
      root!.render(<RemixPanel slug="dog-dash" frameRef={frameRef} onSwapDocument={() => {}} onClose={() => {}} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await send('bigger dog');

    const pushed = postMessage.mock.calls.at(-1)?.[0] as {
      content: Record<string, unknown>;
      selection?: { collection: string; index: number };
    };
    expect(pushed.content.params).toEqual({ dogScale: 2 });
    expect(pushed.content.maps).toEqual([{ properties: {}, rows: ['...', '...', '...'] }]);
    expect(pushed.selection).toEqual({ collection: 'maps', index: 0 });
  });

  it('flushes a stroke still on the debounce when the sheet closes', async () => {
    // Paint, then close the sheet inside the 500 ms window. The frame outlives
    // the panel, so cancelling the only scheduled push would silently lose the
    // last stroke with the state that held it — the flush is the promise.
    const postMessage = vi.fn();
    const frameRef = {
      current: { contentWindow: { postMessage } },
    } as unknown as React.MutableRefObject<HTMLIFrameElement | null>;
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: null,
      values: null,
      content: {
        maps: {
          widget: 'collection',
          label: { en: 'Maps', pl: 'Mapy' },
          itemLabel: { en: 'Map', pl: 'Mapa' },
          min: 1,
          max: 3,
          item: {
            widget: 'tilemap',
            grid: { minCols: 3, maxCols: 8, minRows: 3, maxRows: 8 },
            tiles: [
              { key: 'path', char: '.', label: { en: 'Path', pl: 'Ścieżka' } },
              { key: 'wall', char: '#', label: { en: 'Wall', pl: 'Mur' } },
            ],
            properties: {},
            constraints: [],
          },
          defaults: [{ properties: {}, rows: ['...', '...', '...'] }],
        },
      },
      canAssist: false,
      canCode: false,
      suggestions: [],
      expiresInMs: 3_600_000,
    });

    root = createRoot(container);
    await act(async () => {
      root!.render(<RemixPanel slug="dog-dash" frameRef={frameRef} onSwapDocument={() => {}} onClose={() => {}} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Select the wall tile and paint one cell — the push is now debounced.
    const wall = container.querySelectorAll('.remix-painter .editor-tile')[1] as HTMLButtonElement;
    await act(async () => {
      wall.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const cell = container.querySelector('.remix-painter .editor-cell') as HTMLButtonElement;
    await act(async () => {
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(postMessage).not.toHaveBeenCalled();

    // Close before the debounce fires.
    await act(async () => {
      root!.unmount();
    });
    root = null;
    const pushed = postMessage.mock.calls.at(-1)?.[0] as { content: { maps: Array<{ rows: string[] }> } };
    expect(pushed.content.maps[0].rows[0]).toBe('#..');
  });

  it('offers a toggle the way the running game is not currently set', async () => {
    // Arrived on a shared link that flipped a default-off toggle on. The server
    // derived "turn on" from the declaration; offering that here would be a
    // suggestion that does nothing — expensively, since a no-op patch falls
    // through to a rebuild.
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { rain: { type: 'bool', default: false, label: { en: 'rain' } } },
      values: { rain: true },
      canAssist: true,
      canCode: false,
      suggestions: [{ kind: 'param', key: 'rain', direction: 'on' }],
      expiresInMs: 3_600_000,
    });
    await draw();

    expect(container.querySelector('.remix-try')?.textContent).toBe('turn off rain');
  });

  it('does not offer a link that would carry nothing', async () => {
    // A code change moves no declared value, so the link is an empty diff — a
    // link to the game the player started with. Offering it makes the loudest
    // button on the panel the least true thing on it.
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'dog size' } } },
      values: { dogScale: 1 },
      canAssist: true,
      canCode: true,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixAssist.mockResolvedValue({ lane: 'code' });
    remixApi.remixCode.mockResolvedValue({
      ok: true,
      html: '<html></html>',
      region: { file: 'game/render.ts', name: 'paintWorld' },
      summary: { en: 'Replaced stars with drawn carrots.' },
    });
    await draw();
    await send('replace the stars with carrots');

    // The change landed and says so...
    expect(container.querySelector('.remix-result')?.textContent).toContain('carrots');
    // ...and there is nothing to share (code moves no declared value), so Share
    // stays off. Keep is not a row CTA — after one landing only the header hatch.
    expect(buttonNamed(container, 'Share my version')).toBeNull();
    expect(container.querySelector('.remix-btn.is-primary')).toBeNull();
    expect(buttonNamed(container, 'Make it mine')).toBeNull();
    expect(buttonNamed(container, 'Save to Studio')).not.toBeNull();

    // But there is always a way back. A rebuild that compiles is not a rebuild
    // that plays, and the lane cannot tell the difference — so the player must
    // never be left holding a broken game and a composer.
    const undo = buttonNamed(container, 'Undo');
    expect(undo).not.toBeNull();
    expect(undo!.classList.contains('is-quiet')).toBe(true);

    remixApi.remixUndo.mockResolvedValue({ ok: true, html: '<html>original</html>', undoable: false });
    await act(async () => {
      undo!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(remixApi.remixUndo).toHaveBeenCalledWith('r1');
    expect(swapped.at(-1)).toBe('<html>original</html>');
  });

  it('says so when the new build throws, and makes going back the loud option', async () => {
    // The lane checked that it assembles. It did — and then `createRound` threw
    // on `undefined.map` in the player's face, under a cheerful tick.
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: null,
      values: null,
      canAssist: false,
      canCode: true,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixCode.mockResolvedValue({
      ok: true,
      html: '<html>broken</html>',
      region: { file: 'game/render.ts', name: 'paintWorld' },
      summary: { en: 'Added a pulsing animation.' },
    });
    await draw();
    await send('make the seeds pulse');
    expect(container.querySelector('.remix-result')?.textContent).toContain('pulsing');

    // The frame reports its uncaught error over the same channel play telemetry
    // uses; the panel is listening rather than leaving the player to notice.
    await act(async () => {
      const event = new MessageEvent('message', {
        data: { source: 'gdpl-player', type: 'error', message: 'boom' },
      });
      // jsdom will not take a plain object as `source`/`origin` through the
      // constructor, and the panel checks both — an opaque-origin frame is the
      // only thing it listens to.
      Object.defineProperty(event, 'source', { value: frameWindow });
      Object.defineProperty(event, 'origin', { value: 'null' });
      window.dispatchEvent(event);
    });

    expect(container.querySelector('.remix-result.is-broken')).not.toBeNull();
    expect(container.querySelector('.remix-result')?.textContent).toContain('stopped the game working');
    expect(container.querySelector('.remix-btn.is-primary')?.textContent).toBe('Undo');
    // A broken game is not something to keep — hide the Studio fork until they undo.
    expect(buttonNamed(container, 'Make it mine')).toBeNull();
    expect(buttonNamed(container, 'Save to Studio')).toBeNull();
    expect(container.querySelector('.remix-keep-offer')).toBeNull();
  });

  it('rolls back a Keep offer when the landing that earned it then breaks', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: null,
      values: null,
      canAssist: false,
      canCode: true,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixCode
      .mockResolvedValueOnce({
        ok: true,
        html: '<html>one</html>',
        region: { file: 'game/render.ts', name: 'paintWorld' },
        summary: { en: 'One.' },
      })
      .mockResolvedValueOnce({
        ok: true,
        html: '<html>two</html>',
        region: { file: 'game/render.ts', name: 'paintWorld' },
        summary: { en: 'Two.' },
      })
      .mockResolvedValueOnce({
        ok: true,
        html: '<html>broken</html>',
        region: { file: 'game/render.ts', name: 'paintWorld' },
        summary: { en: 'Three.' },
      });
    await draw();
    await send('one');
    await send('two');
    await send('three');
    expect(container.querySelector('.remix-keep-offer')).not.toBeNull();

    await act(async () => {
      const event = new MessageEvent('message', {
        data: { source: 'gdpl-player', type: 'error', message: 'boom' },
      });
      Object.defineProperty(event, 'source', { value: frameWindow });
      Object.defineProperty(event, 'origin', { value: 'null' });
      window.dispatchEvent(event);
    });

    // The third landing did not stick — close the offer and do not leave the
    // hatch hidden behind a stuck keepOfferOpen flag.
    expect(container.querySelector('.remix-keep-offer')).toBeNull();
    expect(buttonNamed(container, 'Save to Studio')).toBeNull();
    expect(container.querySelector('.remix-result.is-broken')).not.toBeNull();
  });

  it('keeps the way back when the sheet is reopened over a running change', async () => {
    // Close the sheet, play-test the change, find it broken, reopen — the most
    // natural sequence there is, and the one a session owned by this panel could
    // not survive: the change keeps running while the history that undoes it
    // was thrown away with the unmount.
    const session = {
      remixId: 'r1',
      params: null,
      values: null,
      canAssist: false,
      canCode: true,
      suggestions: [],
      expiresInMs: 3_600_000,
    };
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <RemixPanel
          slug="dog-dash"
          frameRef={frameRef as never}
          onSwapDocument={(html) => swapped.push(html)}
          onClose={() => {}}
          session={session as never}
          undoable
        />,
      );
    });

    // No second session was minted for the reopening...
    expect(remixApi.startRemix).not.toHaveBeenCalled();
    // ...and the way back is offered. Keep is not on the row for a reopen that
    // has not yet landed a fresh change in this mount.
    expect(buttonNamed(container, 'Undo')).not.toBeNull();
    expect(buttonNamed(container, 'Make it mine')).toBeNull();
    expect(buttonNamed(container, 'Save to Studio')).toBeNull();
  });

  it('docks into a mini chat after the second landing', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'dog size' } } },
      values: { dogScale: 1 },
      canAssist: true,
      canCode: false,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixAssist
      .mockResolvedValueOnce({ lane: 'params', values: { dogScale: 1.2 }, summary: { en: 'Bigger.' } })
      .mockResolvedValueOnce({ lane: 'params', values: { dogScale: 1.4 }, summary: { en: 'Bigger still.' } });
    await draw();

    expect(container.querySelector('.remix-panel.is-chat')).toBeNull();
    await send('a bit bigger');
    expect(container.querySelector('.remix-panel.is-chat')).toBeNull();
    await send('again');

    expect(container.querySelector('.remix-panel.is-chat')).not.toBeNull();
    expect(container.querySelector('.remix-transcript')).not.toBeNull();
    const bubbles = Array.from(container.querySelectorAll('.remix-bubble-text')).map((el) => el.textContent);
    expect(bubbles).toEqual([
      'a bit bigger',
      'Bigger.\ndog size: 1 → 1.2',
      'again',
      'Bigger still.\ndog size: 1.2 → 1.4',
    ]);
    expect(container.querySelector('.remix-title')?.textContent).toBe('Remix chat');
    // Undo sits on the last assistant turn, not in the Share/Propose action row.
    expect(container.querySelector('.remix-bubble-undo')?.textContent).toBe('Undo');
    expect(container.querySelector('.remix-actions-row .remix-btn')?.textContent ?? null).not.toBe('Undo');

    await act(async () => {
      container
        .querySelector('.remix-close[aria-label="Collapse chat"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.remix-panel.is-collapsed')).not.toBeNull();
    await act(async () => {
      container.querySelector('.remix-collapsed-hit')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.remix-panel.is-collapsed')).toBeNull();
  });

  it('keeps Undo on the last bubble when a chat-mode rebuild breaks', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: null,
      values: null,
      canAssist: false,
      canCode: true,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixCode
      .mockResolvedValueOnce({
        ok: true,
        html: '<html>one</html>',
        region: { file: 'game/a.ts', name: 'a' },
        summary: { en: 'One.', pl: 'Jeden.' },
      })
      .mockResolvedValueOnce({
        ok: true,
        html: '<html>two</html>',
        region: { file: 'game/a.ts', name: 'a' },
        summary: { en: 'Two.', pl: 'Dwa.' },
      })
      .mockResolvedValueOnce({
        ok: true,
        html: '<html>broken</html>',
        region: { file: 'game/a.ts', name: 'a' },
        summary: { en: 'Three.', pl: 'Trzy.' },
      });
    await draw();
    await send('one');
    await send('two');
    await send('three');
    expect(container.querySelector('.remix-bubble-undo')).not.toBeNull();

    await act(async () => {
      const event = new MessageEvent('message', {
        data: { source: 'gdpl-player', type: 'error', message: 'boom' },
      });
      Object.defineProperty(event, 'source', { value: frameWindow });
      Object.defineProperty(event, 'origin', { value: 'null' });
      window.dispatchEvent(event);
    });

    expect(container.querySelector('.remix-result.is-broken')).not.toBeNull();
    // Chat mode is still on after a later landing breaks — Undo must stay on the bubble.
    expect(container.querySelector('.remix-panel.is-chat')).not.toBeNull();
    expect(container.querySelector('.remix-bubble-undo')).not.toBeNull();
    expect(container.querySelector('.remix-bubble-undo.is-urgent')).not.toBeNull();
  });

  it('keeps failures visible in the chat transcript', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: null,
      values: null,
      canAssist: false,
      canCode: true,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixCode
      .mockResolvedValueOnce({
        ok: true,
        html: '<html>one</html>',
        region: { file: 'game/a.ts', name: 'a' },
        summary: { en: 'One.', pl: 'Jeden.' },
      })
      .mockResolvedValueOnce({
        ok: true,
        html: '<html>two</html>',
        region: { file: 'game/a.ts', name: 'a' },
        summary: { en: 'Two.', pl: 'Dwa.' },
      })
      .mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 }));
    await draw();
    await send('one');
    await send('two');
    expect(container.querySelector('.remix-panel.is-chat')).not.toBeNull();

    await send('three');
    const texts = Array.from(container.querySelectorAll('.remix-bubble-text')).map((el) => el.textContent);
    expect(texts).toContain('three');
    expect(texts.join(' ')).toMatch(/Couldn't do that/i);
    expect(container.querySelector('.remix-bubble.is-miss')).not.toBeNull();
    expect(container.querySelector('.remix-note')?.textContent).toMatch(/play|napping|Couldn't/i);
  });

  it('offers to keep the remix after a few successful landings, with a name', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'dog size' } } },
      values: { dogScale: 1 },
      canAssist: true,
      canCode: false,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixAssist
      .mockResolvedValueOnce({ lane: 'params', values: { dogScale: 1.2 } })
      .mockResolvedValueOnce({ lane: 'params', values: { dogScale: 1.4 } })
      .mockResolvedValueOnce({ lane: 'params', values: { dogScale: 1.6 } });
    remixApi.remixSave.mockResolvedValue({ slug: 'my-dog-dash', openPath: '/play/my-dog-dash' });
    await draw();

    await send('a bit bigger');
    expect(container.querySelector('.remix-keep-offer')).toBeNull();
    await send('a bit bigger still');
    expect(container.querySelector('.remix-keep-offer')).toBeNull();
    await send('even bigger');

    // Third landing: the sheet, not a row button.
    expect(container.querySelector('.remix-keep-offer')).not.toBeNull();
    expect(container.querySelector('.remix-keep-heading')?.textContent).toBe('Keep this remix?');
    const name = container.querySelector<HTMLInputElement>('.remix-keep-field input');
    expect(name?.value).toBe('Remix of Dog Dash');
    expect(buttonNamed(container, 'Keep in Studio')).not.toBeNull();
    expect(buttonNamed(container, 'Not now')).not.toBeNull();
    // Composer and Share/Undo wait behind the offer.
    expect(container.querySelector('.remix-ask')).toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name!, 'Carrot Dash');
      name!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttonNamed(container, 'Keep in Studio')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(remixApi.remixSave).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ title: 'Carrot Dash', params: { dogScale: 1.6 } }),
    );
    expect(telemetry.recordRemixStep).toHaveBeenCalledWith('keep_clicked');
  });

  it('does not re-offer Keep after dismiss; the header hatch still works', async () => {
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
    await send('bigger');
    await send('bigger');
    await send('bigger');
    expect(container.querySelector('.remix-keep-offer')).not.toBeNull();

    await act(async () => {
      buttonNamed(container, 'Not now')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.remix-keep-offer')).toBeNull();
    expect(buttonNamed(container, 'Save to Studio')).not.toBeNull();

    // Another landing must not reopen the nag.
    await send('bigger again');
    expect(container.querySelector('.remix-keep-offer')).toBeNull();

    await act(async () => {
      buttonNamed(container, 'Save to Studio')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.remix-keep-offer')).not.toBeNull();
  });

  it('docks instead of closing when the grip is used before chat mode', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: { dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'dog size' } } },
      values: { dogScale: 1 },
      canAssist: true,
      canCode: false,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    remixApi.remixAssist.mockResolvedValue({
      lane: 'params',
      values: { dogScale: 1.2 },
      summary: { en: 'Bigger dog.' },
    });
    await draw();
    await send('bigger');
    expect(container.querySelector('.remix-result')?.textContent).toContain('dog size: 1 → 1.2');

    await act(async () => {
      container.querySelector('.remix-grip')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.remix-panel.is-collapsed')).not.toBeNull();
    expect(container.querySelector('.remix-collapsed-hint')?.textContent).toContain('Bigger dog.');
    expect(remixApi.startRemix).toHaveBeenCalledTimes(1);
  });

  it('docks while the theater HUD is hidden and keeps the running change', async () => {
    remixApi.startRemix.mockResolvedValue({
      remixId: 'r1',
      params: null,
      values: null,
      canAssist: false,
      canCode: true,
      suggestions: [],
      expiresInMs: 3_600_000,
    });
    await draw({ theaterChromeHidden: true });
    expect(container.querySelector('.remix-panel.is-collapsed')).not.toBeNull();
    expect(remixApi.startRemix).toHaveBeenCalledTimes(1);
  });

  it('reopens over a restored snapshot without minting a new session', async () => {
    const session = {
      remixId: 'r1',
      params: { dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'dog size' } } },
      values: { dogScale: 1.4 },
      canAssist: true,
      canCode: false,
      suggestions: [],
      expiresInMs: 3_600_000,
    };
    writeRemixSnapshot({
      v: 1,
      slug: 'dog-dash',
      remixId: 'r1',
      expiresAt: Date.now() + 60_000,
      remixOpen: true,
      chatExpanded: true,
      values: { dogScale: 1.4 },
      undo: { dogScale: 1 },
      chatTurns: [
        { id: '1', role: 'user', text: 'bigger' },
        { id: '2', role: 'assistant', text: 'Bigger.\ndog size: 1 → 1.4', canUndo: true },
      ],
      changed: { text: 'Bigger.\ndog size: 1 → 1.4', canShare: true },
      note: null,
      successCount: 2,
      asked: 'bigger',
      utterance: '',
      contentEdited: true,
      contentDoc: { maps: [{ properties: {}, rows: ['#'] }] },
    });
    remixApi.remixSave.mockResolvedValue({ slug: 'my-dog-dash', openPath: '/play/my-dog-dash' });
    await draw({ session });
    expect(remixApi.startRemix).not.toHaveBeenCalled();
    expect(container.querySelector('.remix-panel.is-chat')).not.toBeNull();
    const bubbles = Array.from(container.querySelectorAll('.remix-bubble-text')).map((el) => el.textContent);
    expect(bubbles).toEqual(['bigger', 'Bigger.\ndog size: 1 → 1.4']);
    expect(container.querySelector('.remix-bubble-undo')).not.toBeNull();
    await act(async () => {
      container.querySelector('.remix-bubble-undo')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.remix-bubble-undo')).toBeNull();
    await act(async () => {
      buttonNamed(container, 'Save to Studio')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.remix-keep-offer')).not.toBeNull();
    await act(async () => {
      buttonNamed(container, 'Keep in Studio')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(remixApi.remixSave).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ content: { maps: [{ properties: {}, rows: ['#'] }] } }),
    );
  });

  async function send(text: string) {
    const input = container.querySelector('.remix-ask textarea') as HTMLTextAreaElement;
    await act(async () => {
      nativeSetValue(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('.remix-ask')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }
});

/** React tracks the value on the node, so a bare `.value =` is not seen. */
function nativeSetValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(el, value);
}
