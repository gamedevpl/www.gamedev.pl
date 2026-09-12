// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type { EditorContentDoc, EditorDefinition, GameEditorState, StudioGame } from '../../studioApi.js';

const fetchGameEditor = vi.hoisted(() => vi.fn());
const putEditorDraft = vi.hoisted(() => vi.fn());
const publishEditorContent = vi.hoisted(() => vi.fn());

vi.mock('../../studioApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return { ...actual, fetchGameEditor, putEditorDraft, publishEditorContent };
});

vi.mock('../../visitTelemetry.js', () => ({ recordAssistStep: vi.fn(), recordEditorStep: vi.fn() }));

import { EditorPanel } from './EditorPanel.js';
import { RemixPainter } from '../../RemixPainter.js';

const layeredDefinition: EditorDefinition = {
  version: 2,
  content: {},
  layers: {
    terrain: {
      widget: 'tilemap',
      label: { en: 'Terrain', pl: 'Teren' },
      grid: { minCols: 3, maxCols: 3, minRows: 3, maxRows: 3 },
      tiles: [
        { key: 'floor', char: '.', label: { en: 'Floor', pl: 'Podłoga' } },
        { key: 'start', char: '@', label: { en: 'Start', pl: 'Start' } },
        { key: 'goal', char: '*', label: { en: 'Goal', pl: 'Meta' } },
      ],
      properties: {},
      constraints: [],
    },
    objects: {
      widget: 'tilemap',
      label: { en: 'Objects', pl: 'Obiekty' },
      grid: { minCols: 3, maxCols: 3, minRows: 3, maxRows: 3 },
      tiles: [
        { key: 'empty', char: '.', label: { en: 'Empty', pl: 'Puste' } },
        { key: 'wall', char: '#', label: { en: 'Wall', pl: 'Ściana' } },
      ],
      properties: {},
      constraints: [],
    },
    triggers: {
      widget: 'entities',
      label: { en: 'Triggers', pl: 'Wyzwalacze' },
      min: 0,
      max: 2,
      properties: { kind: { type: 'text', max: 20 } },
      constraints: [],
    },
  },
  constraints: [
    {
      reachable: {
        from: { layer: 'terrain', tile: 'start' },
        blockedBy: [{ layer: 'objects', tile: 'wall' }],
        require: [{ layer: 'terrain', tile: 'goal' }],
      },
    },
  ],
};

const layeredContent: EditorContentDoc = {
  layers: {
    terrain: { properties: {}, rows: ['...', '.@*', '...'] },
    objects: { properties: {}, rows: ['...', '...', '...'] },
    triggers: [{ properties: { kind: 'exit' } }],
  },
};

const game: StudioGame = {
  token: 'game-token',
  title: 'Fixture game',
  createdAt: '2026-08-07T00:00:00.000Z',
  lastKnownStatus: 'published',
  slug: 'fixture-game',
};

function editorState(overrides: Partial<GameEditorState> = {}): GameEditorState {
  return { version: 'v1', definition: layeredDefinition, content: layeredContent, draft: null, ...overrides };
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

async function renderEditor() {
  root = createRoot(container);
  await act(async () => {
    root!.render(<EditorPanel game={game} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
    await Promise.resolve();
  });
}

describe('layered editor surfaces', () => {
  it('paints only tiles that declare a colour, so lower layers show through the rest', async () => {
    // Opaque cells used to hide every layer but the active one.
    const coloured: EditorDefinition = {
      ...layeredDefinition,
      layers: {
        ...layeredDefinition.layers,
        terrain: {
          ...layeredDefinition.layers!.terrain,
          tiles: [
            { key: 'floor', char: '.', label: { en: 'Floor', pl: 'Podłoga' } },
            { key: 'start', char: '@', label: { en: 'Start', pl: 'Start' }, color: '#ffe14d' },
            { key: 'goal', char: '*', label: { en: 'Goal', pl: 'Meta' }, color: '#7dffb2' },
          ],
        },
      },
    } as EditorDefinition;
    fetchGameEditor.mockResolvedValue(editorState({ definition: coloured, content: layeredContent }));
    await renderEditor();

    const board = container.querySelector("[data-layer-key='terrain']")!;
    const cells = Array.from(board.querySelectorAll<HTMLButtonElement>('.editor-cell'));
    const holes = cells.filter((cell) => cell.classList.contains('is-blank'));
    const painted = cells.filter((cell) => !cell.classList.contains('is-blank'));

    // Only row '.@*' carries colour: seven holes, two painted.
    expect(holes).toHaveLength(7);
    expect(painted).toHaveLength(2);
    expect(painted.map((cell) => cell.style.background)).toEqual(['rgb(255, 225, 77)', 'rgb(125, 255, 178)']);
  });

  it('renders a stacked Studio board with a declaration-driven layer rail', async () => {
    fetchGameEditor.mockResolvedValue(editorState({ definition: layeredDefinition, content: layeredContent }));
    await renderEditor();

    expect(container.querySelectorAll('.editor-layer-board')).toHaveLength(2);
    expect(container.querySelectorAll('.editor-layer-picker-item')).toHaveLength(3);
    expect(container.querySelector('.editor-layer-picker-item.is-active')?.textContent).toContain('Terrain');
    expect(container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary')?.disabled).toBe(false);

    const objects = Array.from(container.querySelectorAll('.editor-layer-picker-item')).find((button) =>
      button.textContent?.includes('Objects'),
    ) as HTMLButtonElement;
    await act(async () => objects.click());
    expect(container.querySelector('.editor-layer-picker-item.is-active')?.textContent).toContain('Objects');
    expect(putEditorDraft).not.toHaveBeenCalled();
  });

  it('renders Remix layers stacked and keeps lower layers read-only', async () => {
    const onChange = vi.fn();
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <RemixPainter
          layers={layeredDefinition.layers}
          constraints={layeredDefinition.constraints}
          doc={layeredContent}
          onChange={onChange}
        />,
      );
    });

    expect(container.querySelectorAll('.editor-layer-board')).toHaveLength(2);
    expect(container.querySelector('.editor-layer-picker-item.is-active')?.textContent).toContain('Triggers');
    const terrain = Array.from(container.querySelectorAll('.editor-layer-picker-item')).find((button) =>
      button.textContent?.includes('Terrain'),
    ) as HTMLButtonElement;
    await act(async () => terrain.click());
    expect(container.textContent).toContain('Only the top layer can be edited');
    expect(container.querySelector<HTMLButtonElement>('.editor-layer-board.is-active button')?.disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});
