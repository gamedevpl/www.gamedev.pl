// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type {
  EditorDefinition,
  EditorContentDoc,
  EditorLayerSpec,
  GameEditorState,
  StudioGame,
} from '../../studioApi.js';

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
const grid = { minCols: 16, maxCols: 28, minRows: 10, maxRows: 18 };

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
              { key: 'floor', char: '.', label: L('Floor', 'Podłoże') },
              { key: 'wall', char: '#', label: L('Wall', 'Ściana'), color: '#8aa8bf' },
              { key: 'hole', char: 'o', label: L('Hole', 'Dziura'), color: '#111827' },
              { key: 'rubber', char: 'R', label: L('Rubber', 'Kauczuk'), color: '#f076d1' },
              { key: 'jump', char: 'J', label: L('Jump', 'Skocznia'), color: '#a4ef56' },
            ],
            properties: {},
            constraints: [{ tile: 'hole', min: 1, max: 6 }],
          },
          // The type demands properties and constraints; this spec omits both.
          objects: {
            widget: 'tilemap',
            label: L('Objects', 'Obiekty'),
            grid,
            tiles: [
              { key: 'none', char: '.', label: L('Empty', 'Puste') },
              { key: 'start', char: 'S', label: L('Start', 'Pole startowe'), color: '#5bd1ff' },
              { key: 'token', char: 'T', label: L('Token', 'Żeton'), color: '#a78bfa' },
            ],
          } as unknown as EditorLayerSpec,
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

const T = [
  '############################',
  '#..........................#',
  '#......RR...JJ..............',
  '#..........................#',
  '#..........o...............#',
  '#..........................#',
  '#..........................#',
  '#..........................#',
  '#..........................#',
  '############################',
];
const O = [
  '............................',
  '....S.......................',
  '............................',
  '............................',
  '............................',
  '............T...............',
  '............................',
  '............................',
  '............................',
  '............................',
];
const content: EditorContentDoc = { levels: [mission(T, O), mission(T, O)] };

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

describe('a layer spec that omits properties', () => {
  it('still renders its board when it becomes the active layer', async () => {
    await renderEditor();
    const pick = Array.from(container.querySelectorAll<HTMLButtonElement>('.editor-layer-picker-item')).find((b) =>
      (b.textContent ?? '').includes('Objects'),
    );
    if (pick)
      await act(async () => {
        pick.click();
        await Promise.resolve();
      });
    const boards = Array.from(container.querySelectorAll<HTMLElement>('.editor-layer-board'));
    expect(boards).toHaveLength(2);
    const active = container.querySelector<HTMLElement>('.editor-layer-board.is-active');
    expect(active?.dataset.layerKey).toBe('objects');
    expect(active?.querySelectorAll('.editor-cell').length).toBeGreaterThan(0);
  });
});
