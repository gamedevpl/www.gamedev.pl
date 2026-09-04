// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type { EditorControllerState } from '../../editorBridge.js';
import type { EditorContentDoc, EditorDefinition, GameEditorState, StudioGame } from '../../studioApi.js';

const fetchGameEditor = vi.hoisted(() => vi.fn());
const putEditorDraft = vi.hoisted(() => vi.fn());
const publishEditorContent = vi.hoisted(() => vi.fn());
const requestEditorAssist = vi.hoisted(() => vi.fn());
const listMySubmissions = vi.hoisted(() => vi.fn());
const getSubmissionStatus = vi.hoisted(() => vi.fn());

vi.mock('../../studioApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return { ...actual, fetchGameEditor, putEditorDraft, publishEditorContent, requestEditorAssist };
});

vi.mock('../../submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return { ...actual, listMySubmissions, getSubmissionStatus };
});

vi.mock('../../visitTelemetry.js', () => ({ recordAssistStep: vi.fn(), recordEditorStep: vi.fn() }));

import { EditorPanel } from './EditorPanel.js';

const paramsDefinition: EditorDefinition = {
  version: 1,
  params: {
    width: { type: 'int', min: 80, max: 200, label: { en: 'Width', pl: 'Szerokość' }, default: 140 },
  },
  content: {},
};

const game: StudioGame = {
  token: 'game-token',
  title: 'Trampoline Master',
  createdAt: '2026-08-07T00:00:00.000Z',
  lastKnownStatus: 'published',
  slug: 'trampoline-master',
};

function editorState(overrides: Partial<GameEditorState> = {}): GameEditorState {
  return {
    version: 'v1',
    definition: paramsDefinition,
    content: { params: { width: 140 } },
    draft: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  fetchGameEditor.mockResolvedValue(editorState());
  putEditorDraft.mockResolvedValue({ revision: 1, updatedAt: '2026-08-07T00:00:01.000Z' });
  publishEditorContent.mockResolvedValue({ version: 'v2-editor', jobId: 42 });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.clearAllMocks();
});

async function renderEditor(editorPushRef?: { current: ((content: EditorContentDoc) => void) | null }) {
  root = createRoot(container);
  await act(async () => {
    root!.render(<EditorPanel game={game} editorPushRef={editorPushRef} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
    await Promise.resolve();
  });
}

/** A controller state with only the fields EditorPanel reads. */
function controllerState(overrides: Partial<EditorControllerState> = {}): EditorControllerState {
  return {
    status: 'ready',
    view: { kind: 'rail', children: [] } as unknown as EditorControllerState['view'],
    reason: null,
    selected: null,
    pendingChange: null,
    uiRequest: null,
    checks: null,
    canvasBox: null,
    sendEvent: vi.fn(),
    sendSelection: vi.fn(),
    sendUiResult: vi.fn(),
    acknowledgeChange: vi.fn(),
    useFallback: vi.fn(),
    ...overrides,
  };
}

async function renderWithController(controller: EditorControllerState) {
  root = createRoot(container);
  await act(async () => {
    root!.render(<EditorPanel game={game} controller={controller} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
    await Promise.resolve();
  });
}

function publishButton(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary');
  expect(button).not.toBeNull();
  return button!;
}

function dragSlider(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="range"]');
  expect(input).not.toBeNull();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('EditorPanel live push (§E tier 1)', () => {
  it('pushes the merged draft to the running stage as soon as it loads, before any edit', async () => {
    const push = vi.fn();
    await renderEditor({ current: push });

    expect(push).toHaveBeenCalledWith({ params: { width: 140 } });
  });

  it('pushes the updated document on every slider drag, alongside the debounced save', async () => {
    const push = vi.fn();
    await renderEditor({ current: push });
    push.mockClear();

    dragSlider('180');

    expect(push).toHaveBeenCalledWith({ params: { width: 180 } });
    expect(putEditorDraft).not.toHaveBeenCalled(); // still debounced — push is immediate, save is not
  });

  it('reads editorPushRef.current fresh on every push, so a remount of the stage is picked up', async () => {
    const first = vi.fn();
    const ref = { current: first as ((content: EditorContentDoc) => void) | null };
    await renderEditor(ref);

    const second = vi.fn();
    ref.current = second;
    dragSlider('160');

    expect(second).toHaveBeenCalledWith({ params: { width: 160 } });
    expect(first).not.toHaveBeenCalledWith({ params: { width: 160 } });
  });

  it('does nothing when no editorPushRef was supplied — a Studio session without a mounted stage must not throw', async () => {
    await renderEditor(undefined);

    expect(() => dragSlider('165')).not.toThrow();
    // The ordinary autosave path still ran, proving the drag itself was handled.
    expect(container.querySelector('.editor-save-state')?.textContent).toBe(i18n.t('studioPanel.editor.saving'));
  });

  it("never pushes a stale in-flight assist reply into a different game's stage after switching games", async () => {
    // editorPushRef is shared and parent-owned — a game switch can reassign .current
    // before this request resolves.
    let resolveAssist!: (value: {
      lane: 'params';
      content: EditorContentDoc;
      patches: Array<{ key: string; value: number }>;
    }) => void;
    requestEditorAssist.mockReturnValue(
      new Promise((resolve) => {
        resolveAssist = resolve;
      }),
    );

    const gameA = vi.fn();
    const ref = { current: gameA as ((content: EditorContentDoc) => void) | null };
    await renderEditor(ref);
    gameA.mockClear();

    const input = container.querySelector<HTMLInputElement>('.editor-assist-input')!;
    const send = container.querySelector<HTMLButtonElement>('.editor-assist-send')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'make it bouncier');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      send.click();
    });
    expect(requestEditorAssist).toHaveBeenCalled();

    // Simulates the game switch: unmount, then the stage reassigns the ref.
    act(() => root!.unmount());
    root = null;
    const gameB = vi.fn();
    ref.current = gameB;

    // Now the stale request resolves.
    await act(async () => {
      resolveAssist({ lane: 'params', content: { params: { width: 999 } }, patches: [{ key: 'width', value: 999 }] });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(gameB).not.toHaveBeenCalled();
    expect(gameA).not.toHaveBeenCalled();
  });
});

describe('EditorPanel publish (not_sealed retry)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a live status instead of a dead-end error, then retries publish once the round seals', async () => {
    vi.useFakeTimers();
    const notSealed = Object.assign(new Error('not_sealed'), { status: 409, code: 'not_sealed' });
    publishEditorContent.mockRejectedValueOnce(notSealed).mockResolvedValueOnce({ version: 'v2-editor', jobId: 43 });
    listMySubmissions.mockResolvedValue([
      { token: 'round-1', slug: game.slug, title: game.title, createdAt: '', lastKnownStatus: 'building' },
    ]);
    getSubmissionStatus.mockResolvedValue({ status: 'building', phase: 'gating' });

    await renderEditor();
    const publishButton = container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary')!;
    await act(async () => {
      publishButton.click();
      await vi.advanceTimersByTimeAsync(0);
    });

    // No raw "not_sealed" code, and no spam-clicking while it polls.
    expect(container.querySelector('.editor-banner')?.textContent).toBe(i18n.t('studioPanel.editor.notSealed'));
    expect(publishButton.disabled).toBe(true);

    getSubmissionStatus.mockResolvedValue({ status: 'in_review', phase: 'ready_for_review' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(publishEditorContent).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.editor-banner.is-ok')?.textContent).toBe(i18n.t('studioPanel.editor.published'));
  });

  it('flushes an edit made mid-wait before the auto-retry, instead of publishing a stale draft', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const notSealed = Object.assign(new Error('not_sealed'), { status: 409, code: 'not_sealed' });
    publishEditorContent
      .mockImplementationOnce(async () => {
        order.push('publish1');
        throw notSealed;
      })
      .mockImplementationOnce(async () => {
        order.push('publish2');
        return { version: 'v2-editor', jobId: 44 };
      });
    putEditorDraft.mockImplementation(async () => {
      order.push('save');
      return { revision: 2, updatedAt: '2026-08-07T00:00:02.000Z' };
    });
    listMySubmissions.mockResolvedValue([
      { token: 'round-1', slug: game.slug, title: game.title, createdAt: '', lastKnownStatus: 'building' },
    ]);
    let resolveStatus!: (value: { status: string; phase: string }) => void;
    getSubmissionStatus.mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );

    await renderEditor();
    const publishButton = container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary')!;
    await act(async () => {
      publishButton.click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(container.querySelector('.editor-banner')?.textContent).toBe(i18n.t('studioPanel.editor.notSealed'));

    // Edit while the first sealing check is still in flight.
    dragSlider('180');

    await act(async () => {
      resolveStatus({ status: 'in_review', phase: 'ready_for_review' });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(order).toEqual(['publish1', 'save', 'publish2']);
  });

  it('stops and shows an error if the round drops off the shelf, instead of retrying publish forever', async () => {
    vi.useFakeTimers();
    const notSealed = Object.assign(new Error('not_sealed'), { status: 409, code: 'not_sealed' });
    publishEditorContent.mockRejectedValueOnce(notSealed);
    // Abandoned rounds are dropped from `/api/submissions/mine`.
    listMySubmissions.mockResolvedValue([]);

    await renderEditor();
    const publishButton = container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary')!;
    await act(async () => {
      publishButton.click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(container.querySelector('.editor-banner')?.textContent).toBe(i18n.t('studioPanel.editor.notSealedUnknown'));
    expect(publishButton.disabled).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(publishEditorContent).toHaveBeenCalledTimes(1); // no runaway retries burning the rate limit
  });
});

describe("EK2-29 — a controller's own checks gate Publish", () => {
  it('disables Publish while the game reports its own validation problems', async () => {
    await renderWithController(controllerState({ checks: { ok: false, problems: ['Needs at least one exit'] } }));

    expect(publishButton().disabled).toBe(true);
    // Named in the blocking list, so the creator knows what refuses.
    expect(container.textContent).toContain(i18n.t('studioPanel.editor.checksFromGame'));
  });

  it('leaves Publish enabled once the game reports its checks green', async () => {
    await renderWithController(controllerState({ checks: { ok: true, problems: [] } }));

    expect(publishButton().disabled).toBe(false);
  });

  it('never strands Publish on a controller that failed — degrade, never break', async () => {
    // Stale checks from a dead controller must not lock Publish.
    await renderWithController(
      controllerState({ status: 'failed', view: null, checks: { ok: false, problems: ['stale'] } }),
    );

    expect(publishButton().disabled).toBe(false);
  });
});
