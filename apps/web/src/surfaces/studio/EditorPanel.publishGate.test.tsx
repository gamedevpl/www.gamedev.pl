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

vi.mock('../../visitTelemetry.js', () => ({ recordAssistStep: vi.fn(), recordEditorStep: vi.fn() }));

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

  it('never strands Publish on a controller that failed — degrade, never break', async () => {
    // Stale checks from a dead controller must not lock Publish.
    await renderWithController(
      controllerState({ status: 'failed', view: null, checks: { ok: false, problems: ['stale'] } }),
    );

    expect(publishButton().disabled).toBe(false);
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
