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

vi.mock('../../studioApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return { ...actual, fetchGameEditor, putEditorDraft, publishEditorContent };
});

const recordEditorStep = vi.hoisted(() => vi.fn());
vi.mock('../../visitTelemetry.js', () => ({ recordAssistStep: vi.fn(), recordEditorStep }));

import { EditorPanel } from './EditorPanel.js';

const L = (en: string, pl: string) => ({ en, pl });
const grid = { minCols: 4, maxCols: 4, minRows: 3, maxRows: 3 };

const definition: EditorDefinition = {
  version: 2,
  content: {},
  layers: {
    terrain: {
      widget: 'tilemap',
      label: L('Terrain', 'Teren'),
      grid,
      tiles: [
        { key: 'floor', char: '.', label: L('Floor', 'Podłoże') },
        { key: 'wall', char: '#', label: L('Wall', 'Ściana'), color: '#8aa8bf' },
      ],
      properties: {},
      constraints: [],
    },
  },
  controller: true,
};

const editorState: GameEditorState = {
  version: 'v1',
  definition,
  content: { layers: { terrain: { properties: {}, rows: ['####', '#..#', '####'] } } },
  draft: null,
};

const game: StudioGame = {
  token: 'game-token',
  title: 'Ball in the bends',
  createdAt: '2026-08-07T00:00:00.000Z',
  lastKnownStatus: 'published',
  slug: 'ball-in-the-bends',
};

// Only the fields EditorPanel reads; a toolbar view, no board.
function controllerState(overrides: Partial<EditorControllerState> = {}): EditorControllerState {
  return {
    status: 'ready',
    view: { type: 'rail', children: [{ type: 'toolbar', tools: ['paint'] }] } as EditorControllerState['view'],
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
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.clearAllMocks();
});

async function renderWithController(controller: EditorControllerState) {
  root = createRoot(container);
  await act(async () => {
    root!.render(<EditorPanel game={game} controller={controller} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
    await Promise.resolve();
  });
}

function switchButton() {
  return container.querySelector<HTMLButtonElement>('.editor-surface-switch');
}

describe('a game driving the editor surface never strands the creator', () => {
  it('offers the standard editor while the controller holds the surface', async () => {
    await renderWithController(controllerState());

    expect(container.querySelector('.editor-controller-surface')).not.toBeNull();
    expect(container.querySelector('.editor-layer-board')).toBeNull();
    expect(switchButton()?.textContent).toBe(i18n.t('studioPanel.editor.useStandardEditor'));
  });

  it('brings the standard board back when the creator asks for it', async () => {
    await renderWithController(controllerState());

    await act(async () => switchButton()!.click());

    expect(container.querySelector('.editor-controller-surface')).toBeNull();
    const board = container.querySelector<HTMLElement>('.editor-layer-board');
    expect(board?.dataset.layerKey).toBe('terrain');
    expect(board!.querySelectorAll('.editor-cell').length).toBe(12);
    expect(switchButton()?.textContent).toBe(i18n.t('studioPanel.editor.useGameEditor'));
  });

  it('records both directions, so an abandoned controller surface is visible in the funnel', async () => {
    await renderWithController(controllerState());
    recordEditorStep.mockClear();

    await act(async () => switchButton()!.click());
    expect(recordEditorStep).toHaveBeenCalledWith('standard_surface_chosen');

    await act(async () => switchButton()!.click());
    expect(recordEditorStep).toHaveBeenCalledWith('controller_surface_restored');
  });

  it('keeps the creator on the standard editor when the controller sends a fresh view', async () => {
    await renderWithController(controllerState());
    await act(async () => switchButton()!.click());

    await act(async () => {
      root!.render(
        <EditorPanel
          game={game}
          controller={controllerState({ view: { type: 'note', text: 'Back again' } })}
          onOpenPlaytest={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('.editor-controller-surface')).toBeNull();
    expect(container.querySelector('.editor-layer-board')).not.toBeNull();
  });
});
