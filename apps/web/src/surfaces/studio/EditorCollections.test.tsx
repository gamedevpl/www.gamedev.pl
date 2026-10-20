// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import type {
  EditorCollectionSpec,
  EditorConstraint,
  EditorDefinition,
  EditorItemContent,
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
import type { EditorContentPush } from '../../editorBridge.js';

const mapItem: EditorItemContent = { properties: { name: 'Map 1' }, rows: ['..', '..'] };
const routeItem: EditorItemContent = { properties: { name: 'Route 1' }, rows: ['##', '##'] };

function collection(
  label: string,
  itemLabel: string,
  tileChar: string,
  item: EditorItemContent,
  constraints: EditorConstraint[] = [],
): EditorCollectionSpec {
  return {
    widget: 'collection',
    label: { en: label, pl: `${label} PL` },
    itemLabel: { en: itemLabel, pl: `${itemLabel} PL` },
    min: 1,
    max: 2,
    item: {
      widget: 'tilemap',
      grid: { minCols: 2, maxCols: 2, minRows: 2, maxRows: 2 },
      tiles: [
        { key: 'floor', char: tileChar, label: { en: 'Floor', pl: 'Podłoga' } },
        { key: 'wall', char: tileChar === '.' ? '#' : '.', label: { en: 'Wall', pl: 'Ściana' } },
      ],
      properties: { name: { type: 'text', max: 40 } },
      constraints,
    },
    defaults: [item],
  };
}

const definition: EditorDefinition = {
  version: 1,
  content: {
    maps: collection('Maps', 'Map', '.', mapItem),
    routes: collection('Routes', 'Route', '#', routeItem, [{ tile: 'floor', min: 5 }]),
  },
};

const content = { maps: [mapItem], routes: [routeItem] };

const game: StudioGame = {
  token: 'game-token',
  title: 'Fixture game',
  createdAt: '2026-08-07T00:00:00.000Z',
  lastKnownStatus: 'published',
  slug: 'fixture-game',
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

async function renderEditor() {
  root = createRoot(container);
  await act(async () => {
    root!.render(<EditorPanel game={game} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
    await Promise.resolve();
  });
}

function changeSelect(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('multi-collection editor surfaces', () => {
  it('switches the studio item list and painter without changing draft state', async () => {
    await renderEditor();

    const selector = container.querySelector('.editor-collection-selector select') as HTMLSelectElement;
    expect(selector).not.toBeNull();
    expect(selector.value).toBe('maps');
    expect(container.querySelector('.editor-item-list')?.textContent).toContain('Map 1');
    expect(container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary')?.disabled).toBe(true);

    changeSelect(selector, 'routes');

    expect(selector.value).toBe('routes');
    expect(container.querySelector('.editor-item-list')?.textContent).toContain('Route 1');
    expect(container.querySelector('.editor-item-list')?.textContent).not.toContain('Map 1');
    expect(putEditorDraft).not.toHaveBeenCalled();
  });
});

describe('selected collection item reaches the preview', () => {
  const mapTwo: EditorItemContent = { properties: { name: 'Map 2' }, rows: ['##', '##'] };
  const twoMaps = { maps: [mapItem, mapTwo], routes: [routeItem] };

  it('studio item picks push the selected collection index without writing a draft', async () => {
    fetchGameEditor.mockResolvedValue(editorState({ content: twoMaps }));
    const push = vi.fn();
    const editorPushRef = { current: push as EditorContentPush };
    root = createRoot(container);
    await act(async () => {
      root!.render(<EditorPanel game={game} editorPushRef={editorPushRef} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
      await Promise.resolve();
    });
    push.mockClear();

    const items = container.querySelectorAll('.editor-item-list button');
    const second = Array.from(items).find((button) => button.textContent === 'Map 2') as HTMLButtonElement;
    expect(second).not.toBeUndefined();
    await act(async () => {
      second.click();
    });

    expect(push).toHaveBeenCalledWith(twoMaps, { collection: 'maps', index: 1 });
    expect(putEditorDraft).not.toHaveBeenCalled();
  });
});

describe('the entities widget', () => {
  const cardOne: EditorItemContent = { properties: { name: 'Strike', cost: 1 } };
  const cardTwo: EditorItemContent = { properties: { name: 'Guard', cost: 2 } };

  const entitiesDefinition: EditorDefinition = {
    version: 1,
    content: {
      cards: {
        widget: 'collection',
        label: { en: 'Cards', pl: 'Karty' },
        itemLabel: { en: 'Card', pl: 'Karta' },
        min: 1,
        max: 4,
        item: {
          widget: 'entities',
          properties: { name: { type: 'text', max: 24 }, cost: { type: 'int', min: 0, max: 3 } },
          constraints: [{ uniqueBy: 'cost' }],
        },
        defaults: [cardOne, cardTwo],
      },
    },
  };

  it('renders properties without a board, and passes checks when values are unique', async () => {
    fetchGameEditor.mockResolvedValue(
      editorState({ definition: entitiesDefinition, content: { cards: [cardOne, cardTwo] } }),
    );
    await renderEditor();

    expect(container.querySelector('.editor-board')).toBeNull();
    expect(container.querySelector('.editor-palette')).toBeNull();
    expect(container.querySelector('.editor-item-list')?.textContent).toContain('Strike');
    expect(container.querySelector('.editor-item-list')?.textContent).toContain('Guard');
    expect(container.textContent).toContain('cost');
    expect(container.querySelector('.editor-check.is-ok')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary')?.disabled).toBe(false);
  });

  it('clicking Publish carries the slug through to the API and shows the published banner', async () => {
    fetchGameEditor.mockResolvedValue(
      editorState({ definition: entitiesDefinition, content: { cards: [cardOne, cardTwo] } }),
    );
    await renderEditor();

    const publishButton = container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary');
    expect(publishButton?.disabled).toBe(false);
    await act(async () => {
      publishButton!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(publishEditorContent).toHaveBeenCalledWith('fixture-game');
    expect(container.querySelector('.editor-banner.is-ok')?.textContent).toContain(
      i18n.t('studioPanel.editor.published'),
    );
  });

  it('flags a duplicate uniqueBy value and blocks publish', async () => {
    const duplicateCard: EditorItemContent = { properties: { name: 'Guard 2', cost: 1 } };
    fetchGameEditor.mockResolvedValue(
      editorState({ definition: entitiesDefinition, content: { cards: [cardOne, duplicateCard] } }),
    );
    await renderEditor();

    expect(container.querySelector('.editor-check.is-bad')?.textContent).toContain('cost');
    expect(container.querySelector<HTMLButtonElement>('.studio-head-action.is-primary')?.disabled).toBe(true);
  });
});

describe('the path widget', () => {
  const pathItem: EditorItemContent = {
    properties: { name: 'Starter' },
    points: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
  };
  const pathDefinition: EditorDefinition = {
    version: 1,
    content: {
      routes: {
        widget: 'collection',
        label: { en: 'Routes', pl: 'Trasy' },
        itemLabel: { en: 'Route', pl: 'Trasa' },
        min: 1,
        max: 3,
        item: {
          widget: 'path',
          gridCols: 4,
          gridRows: 3,
          minPoints: 2,
          maxPoints: 8,
          closed: false,
          properties: { name: { type: 'text', max: 24 } },
        },
        defaults: [pathItem],
      },
    },
  };

  it('edits a Studio path with the required keyboard controls', async () => {
    fetchGameEditor.mockResolvedValue(editorState({ definition: pathDefinition, content: { routes: [pathItem] } }));
    const push = vi.fn();
    const editorPushRef = { current: push as EditorContentPush };
    root = createRoot(container);
    await act(async () => {
      root!.render(<EditorPanel game={game} editorPushRef={editorPushRef} onOpenPlaytest={vi.fn()} onBack={vi.fn()} />);
      await Promise.resolve();
    });
    push.mockClear();

    const painter = container.querySelector<SVGSVGElement>('.editor-path');
    expect(painter).not.toBeNull();
    expect(container.textContent).toContain('arrows move the cursor');
    act(() => {
      painter!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      painter!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(push.mock.lastCall?.[0].routes[0].points).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);

    act(() => {
      painter!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });
    expect(push.mock.lastCall?.[0].routes[0].points).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });
});
