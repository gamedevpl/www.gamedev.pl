// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type { EditorControllerState } from '../../editorBridge.js';
import type { EditorDefinition, GameEditorState, StudioGame } from '../../studioApi.js';

const fetchGameEditor = vi.hoisted(() => vi.fn());
const putEditorDraft = vi.hoisted(() => vi.fn());
const publishEditorContent = vi.hoisted(() => vi.fn());
const listMySubmissions = vi.hoisted(() => vi.fn());
const getSubmissionStatus = vi.hoisted(() => vi.fn());

vi.mock('../../studioApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return { ...actual, fetchGameEditor, putEditorDraft, publishEditorContent };
});

vi.mock('../../submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return { ...actual, listMySubmissions, getSubmissionStatus };
});

const recordEditorStep = vi.hoisted(() => vi.fn());
vi.mock('../../visitTelemetry.js', () => ({ recordAssistStep: vi.fn(), recordEditorStep }));

import { EditorPanel } from './EditorPanel.js';

const definition: EditorDefinition = {
  version: 1,
  params: {
    width: { type: 'int', min: 80, max: 200, label: { en: 'Width', pl: 'Szerokość' }, default: 140 },
  },
  content: {},
};

const game: StudioGame = {
  token: 'game-token',
  title: 'Lemming Rescue',
  createdAt: '2026-08-07T00:00:00.000Z',
  lastKnownStatus: 'published',
  slug: 'lemming-rescue',
};

const editorState: GameEditorState = {
  version: 'v1',
  definition,
  content: { params: { width: 140 } },
  draft: null,
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  fetchGameEditor.mockResolvedValue(editorState);
  putEditorDraft.mockResolvedValue({ revision: 1, updatedAt: '2026-08-07T00:00:01.000Z' });
  publishEditorContent.mockResolvedValue({ version: 'v2-editor', jobId: 42 });
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.clearAllMocks();
});

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
    checksFresh: true,
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

  it("keeps the game's own checks gating Publish after the creator takes the standard editor", async () => {
    await renderWithController(controllerState({ checks: { ok: false, problems: ['Needs at least one exit'] } }));
    expect(publishButton().disabled).toBe(true);

    const toStandard = container.querySelector<HTMLButtonElement>('.editor-surface-switch');
    expect(toStandard).not.toBeNull();
    await act(async () => toStandard!.click());

    // The controller is still live, so it still refuses.
    expect(publishButton().disabled).toBe(true);
    expect(container.textContent).toContain(i18n.t('studioPanel.editor.checksFromGame'));
  });

  it('holds Publish after a standard edit until the game has answered for it', async () => {
    await renderWithController(controllerState({ checks: { ok: true, problems: [] } }));
    await act(async () => container.querySelector<HTMLButtonElement>('.editor-surface-switch')!.click());
    expect(publishButton().disabled).toBe(false);

    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(slider, '150');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Unseen edit, so the green verdict is about older content.
    await act(async () => {
      root!.render(
        <EditorPanel
          game={game}
          controller={controllerState({ checks: { ok: true, problems: [] }, checksFresh: false })}
          onOpenPlaytest={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      await Promise.resolve();
    });
    expect(publishButton().disabled).toBe(true);
    expect(container.textContent).toContain(i18n.t('studioPanel.editor.checksFromGame'));
  });

  it('never holds Publish for a game that declares no validator', async () => {
    await renderWithController(controllerState({ checks: null, checksFresh: false }));
    expect(publishButton().disabled).toBe(false);
  });

  it('refuses a controller patch while the creator is on the standard editor', async () => {
    const controller = controllerState({ checks: { ok: true, problems: [] } });
    await renderWithController(controller);
    await act(async () => container.querySelector<HTMLButtonElement>('.editor-surface-switch')!.click());

    await act(async () => {
      root!.render(
        <EditorPanel
          game={game}
          controller={{
            ...controller,
            pendingChange: { id: 'change-9', patch: { path: ['params', 'width'], value: 150 } },
          }}
          onOpenPlaytest={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    // A patch that would otherwise have applied cleanly is refused instead.
    expect(controller.acknowledgeChange).toHaveBeenCalledWith('change-9', false, expect.any(String));
    expect(controller.acknowledgeChange).not.toHaveBeenCalledWith('change-9', true);
    expect(putEditorDraft).not.toHaveBeenCalled();
  });

  it('never strands Publish on a controller that failed — degrade, never break', async () => {
    // Stale checks from a dead controller must not lock Publish.
    await renderWithController(
      controllerState({ status: 'failed', view: null, checks: { ok: false, problems: ['stale'] } }),
    );

    expect(publishButton().disabled).toBe(false);
  });
});

describe('a failed draft save must not take the creator away from their edit', () => {
  it('stays in the editor when the flush before a playtest is rejected', async () => {
    const rejected = Object.assign(new Error('draft does not fit'), {
      status: 422,
      problems: ['needs exactly 1 goal'],
    });
    putEditorDraft.mockRejectedValue(rejected);
    const onOpenPlaytest = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <EditorPanel
          game={game}
          controller={controllerState({ checks: { ok: true, problems: [] } })}
          onOpenPlaytest={onOpenPlaytest}
          onBack={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(slider, '150');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const tryDraft = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes(i18n.t('studioPanel.editor.tryDraft')),
    )!;
    await act(async () => {
      tryDraft.click();
      await Promise.resolve();
    });

    // Navigating unmounts the panel, so this would have discarded the edit.
    expect(putEditorDraft).toHaveBeenCalled();
    expect(onOpenPlaytest).not.toHaveBeenCalled();
  });
});

describe('a playtest never leaves unsaved work behind, whatever the save state', () => {
  async function renderDirty(onOpenPlaytest: () => void) {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <EditorPanel
          game={game}
          controller={controllerState({ checks: { ok: true, problems: [] } })}
          onOpenPlaytest={onOpenPlaytest}
          onBack={vi.fn()}
        />,
      );
      await Promise.resolve();
    });
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(slider, '150');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function tryDraftButton() {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes(i18n.t('studioPanel.editor.tryDraft')),
    )!;
  }

  it('stays put when the autosave has already failed before the click', async () => {
    vi.useFakeTimers();
    try {
      putEditorDraft.mockRejectedValue(
        Object.assign(new Error('draft does not fit'), { status: 422, problems: ['too wide'] }),
      );
      const onOpenPlaytest = vi.fn();
      await renderDirty(onOpenPlaytest);

      // The debounced autosave fires first, so the click starts from 'error'.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      putEditorDraft.mockClear();

      await act(async () => {
        tryDraftButton().click();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(putEditorDraft).toHaveBeenCalled();
      expect(onOpenPlaytest).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts a preview only once the playtest actually opens', async () => {
    putEditorDraft.mockRejectedValue(Object.assign(new Error('nope'), { status: 422, problems: ['too wide'] }));
    await renderDirty(vi.fn());
    recordEditorStep.mockClear();

    await act(async () => {
      tryDraftButton().click();
      await Promise.resolve();
    });

    expect(recordEditorStep).not.toHaveBeenCalledWith('previewed');
  });
});

describe('EK2-29 — a verdict that lands mid-publish still counts', () => {
  it('drops the publish when the game turns its checks red while the save is in flight', async () => {
    let releaseSave: (value: { revision: number; updatedAt: string }) => void = () => {};
    putEditorDraft.mockReturnValue(
      new Promise<{ revision: number; updatedAt: string }>((resolve) => {
        releaseSave = resolve;
      }),
    );
    await renderWithController(controllerState({ checks: { ok: true, problems: [] } }));

    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(slider, '150');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(publishButton().disabled).toBe(false);

    await act(async () => {
      publishButton().click();
      await Promise.resolve();
    });
    expect(putEditorDraft).toHaveBeenCalled();

    // The game answers while the draft flush is still in the air.
    await act(async () => {
      root!.render(
        <EditorPanel
          game={game}
          controller={controllerState({ checks: { ok: false, problems: ['Needs at least one exit'] } })}
          onOpenPlaytest={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      releaseSave({ revision: 1, updatedAt: '2026-08-07T00:00:01.000Z' });
      await Promise.resolve();
    });

    expect(publishEditorContent).not.toHaveBeenCalled();
  });
});

describe('EK2-29 — the not_sealed retry re-checks before it fires', () => {
  it('refuses the queued retry when the game turns its checks red mid-wait', async () => {
    vi.useFakeTimers();
    const notSealed = Object.assign(new Error('not_sealed'), { status: 409, code: 'not_sealed' });
    publishEditorContent.mockRejectedValueOnce(notSealed).mockResolvedValueOnce({ version: 'v2', jobId: 43 });
    listMySubmissions.mockResolvedValue([
      { token: 'round-1', slug: game.slug, title: game.title, createdAt: '', lastKnownStatus: 'building' },
    ]);
    getSubmissionStatus.mockResolvedValue({ status: 'building', phase: 'gating' });

    await renderWithController(controllerState({ checks: { ok: true, problems: [] } }));
    await act(async () => {
      publishButton().click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(publishEditorContent).toHaveBeenCalledTimes(1);

    // Checks go red while the retry still waits for the seal.
    await act(async () => {
      root!.render(
        <EditorPanel
          game={game}
          controller={controllerState({ checks: { ok: false, problems: ['Needs at least one exit'] } })}
          onOpenPlaytest={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    getSubmissionStatus.mockResolvedValue({ status: 'in_review', phase: 'ready_for_review' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    // Still one — the retry bypasses the button, so the guard lives in publishNow.
    expect(publishEditorContent).toHaveBeenCalledTimes(1);
  });
});
