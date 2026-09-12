// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type { EditorDefinition, EditorContentDoc, GameEditorState, StudioGame } from '../../studioApi.js';

const fetchGameEditor = vi.hoisted(() => vi.fn());
const putEditorDraft = vi.hoisted(() => vi.fn());
const publishEditorContent = vi.hoisted(() => vi.fn());

vi.mock('../../studioApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../studioApi.js')>('../../studioApi.js');
  return { ...actual, fetchGameEditor, putEditorDraft, publishEditorContent };
});

vi.mock('../../visitTelemetry.js', () => ({ recordAssistStep: vi.fn(), recordEditorStep: vi.fn() }));

import { EditorPanel } from './EditorPanel.js';

const L = (en: string, pl: string) => ({ en, pl });
const grid = { minCols: 3, maxCols: 3, minRows: 2, maxRows: 2 };

const definition: EditorDefinition = {
  version: 2,
  content: {
    levels: {
      widget: 'collection',
      label: L('Missions', 'Misje'),
      itemLabel: L('Mission', 'Misja'),
      min: 1,
      max: 10,
      item: {
        widget: 'layered',
        properties: {},
        constraints: [],
        layers: {
          terrain: {
            widget: 'tilemap',
            label: L('Terrain', 'Teren'),
            grid,
            tiles: [
              { key: 'dirt', char: '.', label: L('Dirt', 'Ziemia') },
              { key: 'steel', char: 'S', label: L('Steel', 'Stal'), color: '#8ab0cc' },
            ],
            properties: {},
            constraints: [],
          },
          objects: {
            widget: 'tilemap',
            label: L('Objects', 'Obiekty'),
            grid,
            tiles: [
              { key: 'none', char: '.', label: L('Empty', 'Puste') },
              { key: 'exit', char: 'E', label: L('Exit', 'Wyjście'), color: '#7dffb2' },
            ],
            properties: {},
            constraints: [],
          },
        },
      },
      defaults: [],
    },
  },
};

const mission = (terrain: string[], objects: string[]) => ({
  properties: {},
  layers: { terrain: { properties: {}, rows: terrain }, objects: { properties: {}, rows: objects } },
});

const content: EditorContentDoc = {
  levels: [mission(['...', '...'], ['E..', '...']), mission(['SSS', '...'], ['...', '..E'])],
};

const game: StudioGame = {
  token: 'game-token',
  title: 'Mission pack',
  createdAt: '2026-08-07T00:00:00.000Z',
  lastKnownStatus: 'published',
  slug: 'mission-pack',
};

function editorState(overrides: Partial<GameEditorState> = {}): GameEditorState {
  return { version: 'v1', definition, content, draft: null, ...overrides };
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

async function renderEditor(push?: { current: ((doc: EditorContentDoc) => void) | null }) {
  root = createRoot(container);
  await act(async () => {
    root!.render(<EditorPanel game={game} editorPushRef={push} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
    await Promise.resolve();
  });
}

function layerBoard(key: string) {
  return container.querySelector<HTMLElement>(`[data-layer-key='${key}']`);
}

describe('a layered collection item paints one level at a time', () => {
  it("stacks the selected mission's own layers, with a picker beside the mission list", async () => {
    await renderEditor();

    expect(container.querySelectorAll('.editor-layer-board')).toHaveLength(2);
    expect(layerBoard('terrain')).not.toBeNull();
    expect(layerBoard('objects')).not.toBeNull();
    // Both choices stay available: which mission, and which layer of it.
    const groups = Array.from(container.querySelectorAll('.editor-side-group')).map((g) => g.textContent ?? '');
    expect(groups.some((text) => text.includes('Mission 1') && text.includes('Mission 2'))).toBe(true);
    expect(container.querySelector('.editor-layer-picker-item.is-active')?.textContent).toContain('Terrain');
  });

  it("shows the second mission's layers after switching mission, not the first's", async () => {
    await renderEditor();
    const rowOf = (key: string) =>
      Array.from(layerBoard(key)!.querySelectorAll('.editor-cell'))
        .slice(0, 3)
        .map((cell) => cell.getAttribute('aria-label'));

    expect(rowOf('terrain')[0]).toContain('Dirt');

    const second = Array.from(container.querySelectorAll<HTMLButtonElement>('.editor-side-group button')).find(
      (button) => button.textContent?.includes('2'),
    )!;
    await act(async () => second.click());

    // Mission two is walled with steel on its whole first row.
    expect(rowOf('terrain')[0]).toContain('Steel');
  });

  it('writes a painted cell into the selected mission only, and pushes it live', async () => {
    const push = vi.fn();
    await renderEditor({ current: push });
    push.mockClear();

    const cell = layerBoard('terrain')!.querySelectorAll<HTMLButtonElement>('.editor-cell')[0];
    await act(async () => cell.click());

    const pushed = push.mock.calls.at(-1)?.[0] as EditorContentDoc;
    const levels = pushed.levels as unknown as Array<{ layers: { terrain: { rows: string[] } } }>;
    expect(levels[0].layers.terrain.rows[0]).toBe('...'); // dirt is the active tile, so unchanged
    expect(levels[1].layers.terrain.rows[0]).toBe('SSS'); // mission two untouched
    expect(putEditorDraft).not.toHaveBeenCalled(); // still debounced
  });
});
